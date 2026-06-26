# Create Order Data Flow Report

This report starts at `POST /api/v1/order` and follows the data until it reaches the API response, WebSocket subscribers, and database engine.

## 1. User Creates An Order

Route:

```http
POST /api/v1/order
Authorization: Bearer <accessToken>
```

Request body validated by `CreateOrderClientSchema`:

```ts
{
  marketId: string;
  entryPrice: string;
  quantity: string;
  leverage: number;
  side: "BUY" | "SELL";
  marketType: "SPOT" | "PERP";
  type: "LIMIT" | "MARKET";
  position?: "LONG" | "SHORT";
  postOnly: boolean;
  reduceOnly: boolean;
  stpMode: "CANCEL_BOTH" | "CANCEL_MAKER" | "CANCEL_TAKER";
  timeInForce: "Fill_OR_KILL" | "Good_Till_Cancel" | "Immediate_OR_Return";
}
```

The backend adds `userId` from auth and `createdAt`.

## 2. API Sends The Order To The Trading Engine

Order routes now use `backendRouter.request(...)`, which publishes one Redis stream event to `market:event`.

Type: `MarketEvent`

```ts
{
  requestId: string;
  backendId: string;
  source: "BACKEND";
  type: "engine.order.create";
  payload: CreateOrderPayload;
  timestamp: number;
}
```

Example:

```json
{
  "requestId": "request-1",
  "backendId": "backend-1",
  "source": "BACKEND",
  "type": "engine.order.create",
  "payload": {
    "userId": "user-1",
    "marketId": "BTC_INR",
    "marketType": "SPOT",
    "side": "BUY",
    "type": "LIMIT",
    "entryPrice": "100",
    "quantity": "1",
    "leverage": 1,
    "postOnly": false,
    "reduceOnly": false,
    "stpMode": "CANCEL_TAKER",
    "timeInForce": "Good_Till_Cancel",
    "createdAt": 1710000000000
  },
  "timestamp": 1710000000001
}
```

## 3. Trading Engine Converts The Order

`OMSEngine.createOrderChecks(...)` validates the market, balance rules, TIF rules, post-only rules, risk rules, and market constraints.

Then `normalizeOrderIncoming(...)` converts decimal strings to integer `bigint` values using asset precision.

Type: `normalizeIncomingOrderType`

```ts
{
  userId: string;
  marketId: string;
  marketType: "SPOT" | "PERP";
  side: "BUY" | "SELL";
  type: "LIMIT" | "MARKET";
  entryPrice: bigint;
  quantity: bigint;
  margin: bigint;
  leverage: number;
  postOnly: boolean;
  reduceOnly?: boolean;
  stpMode: STPMode;
  timeInForce: TimeInForce;
  createdAt: number;
}
```

The matching engine then creates an in-memory order.

Type: `InMarketOrderType`

```ts
{
  orderId: string;
  userId: string;
  marketId: string;
  entryPrice: bigint;
  quantity: bigint;
  filled: bigint;
  remainingQty: bigint;
  averagePrice: bigint;
  status: OrderStatus;
  fills: InMarketFillType[];
  depths: {
    bids: { price: string; quantity: string }[];
    asks: { price: string; quantity: string }[];
  };
}
```

Important: `depths` is now the delta for the current order mutation. It is not the full orderbook.

## 4. Matching Output

When an order is placed, the matching engine can produce:

- Resting book delta, when the order is added to the book.
- Fill records, when the order executes against maker orders.
- Removal delta, when a price level is consumed or cancelled.

Internal fill type:

```ts
{
  tradeId: bigint;
  makerOrderId: string;
  takerOrderId: string;
  makerUserId: string;
  takerUserId: string;
  marketId: string;
  side: "BUY" | "SELL";
  price: bigint;
  qty: bigint;
  status: "TRADE";
  timestamp: number;
}
```

Depth delta rules:

- New or changed bid level goes into `depths.bids`.
- New or changed ask level goes into `depths.asks`.
- `quantity: "0"` means that price level was removed.
- The frontend should start from a snapshot, then apply these deltas by `seq`.

Example after a buy order consumes the only ask at `100`:

```json
{
  "bids": [],
  "asks": [{ "price": "100", "quantity": "0" }]
}
```

## 5. Engine Response Payload

The engine normalizes all `bigint` values back to strings through `normalizeOrderReturn(...)`.

Type: `CreateOrderReturnPayload`

```ts
{
  success: boolean;
  message: string;
  userId: string;
  eventId: number;
  timestamp: number;
  data?: {
    order: NormalizeOrderReturnType;
  };
  updates?: {
    marketData?: MarketDataEvent[];
    database?: DatabaseWritePayload;
  };
}
```

The order response contains:

- `data.order`: normalized order, fills, and depth deltas.
- `updates.marketData`: realtime frontend events.
- `updates.database`: durable database records for assets, markets, orders, trades, and other non-market-data tables.

## 6. Market Data Created By Trading Engine

The trading engine creates market-data events from the order result before publishing the return stream event.

Depth update:

```ts
{
  type: "depth.update";
  stream: "depth";
  marketId: string;
  eventTs: number;
  seq: number;
  data: {
    bids: { price: string; quantity: string }[];
    asks: { price: string; quantity: string }[];
  };
}
```

This sends only the changed levels from the current order.

Price update:

```ts
{
  type: "price.update";
  stream: "price";
  marketId: string;
  eventTs: number;
  tradeId: string;
  data: {
    lastPrice: string;
    lastQuantity: string;
  };
}
```

This is the last traded price from this platform for that executed fill.

Ticker update:

```ts
{
  type: "ticker.update";
  stream: "ticker";
  marketId: string;
  eventTs: number;
  tradeId: string;
  data: {
    lastPrice: string;
    lastQuantity: string;
    lastQuoteVolume: string;
    priceChange24h: string;
    priceChangePercent24h: string;
    high24h: string;
    low24h: string;
    volume24h: string;
    quoteVolume24h: string;
  };
}
```

This sends only the newly created ticker event for the executed trade. It does not send all previous ticker rows or candles.

## 7. Response Stream Event

The core trading engine publishes one event to `engine:result`.

Type: `TradeResultEvent`

```ts
{
  requestId: string;
  backendId: string;
  sourceEventType: "engine.order.create";
  success: boolean;
  payload: PayloadToBackendType;
  updates?: EngineReturnUpdates;
  timestamp: number;
}
```

Example shape:

```json
{
  "requestId": "request-1",
  "backendId": "backend-1",
  "sourceEventType": "engine.order.create",
  "success": true,
  "payload": {
    "success": true,
    "message": "Order created successfully",
    "eventId": 42,
    "timestamp": 1710000000100,
    "userId": "user-1",
    "data": {
      "order": {
        "orderId": "order-1",
        "marketId": "BTC_INR",
        "entryPrice": "100",
        "quantity": "1",
        "filled": "1",
        "remainingQty": "0",
        "averagePrice": "100",
        "fills": [{ "tradeId": "1", "price": "100", "qty": "1" }],
        "depths": {
          "bids": [],
          "asks": [{ "price": "100", "quantity": "0" }]
        }
      }
    }
  },
  "updates": {
    "marketData": [
      {
        "type": "depth.update",
        "stream": "depth",
        "marketId": "BTC_INR",
        "eventTs": 1710000000100,
        "seq": 42,
        "data": {
          "bids": [],
          "asks": [{ "price": "100", "quantity": "0" }]
        }
      },
      {
        "type": "price.update",
        "stream": "price",
        "marketId": "BTC_INR",
        "eventTs": 1710000000100,
        "tradeId": "1",
        "data": { "lastPrice": "100", "lastQuantity": "1" }
      },
      {
        "type": "ticker.update",
        "stream": "ticker",
        "marketId": "BTC_INR",
        "eventTs": 1710000000100,
        "tradeId": "1",
        "data": {
          "lastPrice": "100",
          "lastQuantity": "1",
          "lastQuoteVolume": "100",
          "priceChange24h": "0",
          "priceChangePercent24h": "0",
          "high24h": "100",
          "low24h": "100",
          "volume24h": "1",
          "quoteVolume24h": "100"
        }
      }
    ],
    "database": {
      "orders": [],
      "trades": []
    }
  },
  "timestamp": 1710000000110
}
```

## 8. API Receives The Response

The API response router reads `engine:result`, filters by:

- `backendId`
- `requestId`

Then it resolves the waiting HTTP request with `TradeResultEvent.payload`.

For create order, the controller returns:

```json
{
  "success": true,
  "message": "Order created successfully",
  "order": {
    "success": true,
    "message": "Order created successfully",
    "eventId": 42,
    "timestamp": 1710000000100,
    "data": {
      "order": {}
    }
  }
}
```

## 9. WebSocket Server Receives The Same Response

`apps/ws-server` consumes `engine:result` with:

- stream: `engine:result`
- group: `ws-server-group`
- consumer: `ws-server-<pid>`

It extracts:

```ts
result.updates?.marketData ?? result.payload?.updates?.marketData ?? []
```

Then each event is sent only to sockets subscribed to:

```ts
`${event.stream}:${event.marketId}`
```

Subscribe message:

```json
{
  "type": "subscribe",
  "marketId": "BTC_INR",
  "stream": ["price", "depth", "ticker"]
}
```

Equivalent explicit form:

```json
{
  "type": "subscribe",
  "streams": ["price:BTC_INR", "depth:BTC_INR", "ticker:BTC_INR"]
}
```

Unsubscribe message:

```json
{
  "type": "unsubscribe",
  "marketId": "BTC_INR",
  "stream": "depth"
}
```

In-memory maps:

- `subscriptionsBySocket`: socket to subscribed stream keys.
- `socketsBySubscription`: stream key to sockets.

So if a socket subscribes to `depth:BTC_INR`, it receives only `depth.update` events for `BTC_INR`.

## 10. Database Engine Receives The Same Response

`apps/database-engine` consumes `engine:result` with:

- stream: `engine:result`
- group: `database-engine-group`
- consumer: `database-engine-<pid>`

It builds a database payload from:

```ts
const databasePayload = result.updates?.database ?? result.payload?.updates?.database;
const marketData = result.updates?.marketData ?? result.payload?.updates?.marketData ?? [];
const tickerEvents = marketData.filter(event => event.type === "ticker.update" && event.tradeId);
```

Important:

- Depth updates are not written to the database by this path.
- Price updates are not written to the database by this path.
- Ticker table rows are derived from `ticker.update` events.
- Order, trade, asset, market, funding, and liquidation rows come from `updates.database`.

## 11. Database Table Split

The database engine divides the payload like this:

| Payload field | Database table | Write style |
| --- | --- | --- |
| `assets` | `Asset` | upsert |
| `markets` | `Market` | upsert |
| `orders` | `Order` | create if missing, then update latest state |
| `trades` | `Trade` | append-only `createMany` with duplicate skip |
| `assetTransactions` | `AssetTransaction` | append-only |
| `fundingSettlements` | `FundingSettlement` | append-only |
| `fundingPayments` | `FundingPayment` | append-only |
| `liquidationEvents` | `LiquidationEvent` | append-only |
| derived `ticker.update` | `MarketTicker` | latest ticker per market |
| derived `ticker.update` | `MarketTickerCandle` | OHLCV rows for `1m`, `15m`, `1h`, `1w` |

Ticker candle bucket rules:

- `1m`: timestamp rounded down to the minute.
- `15m`: timestamp rounded down to the 15 minute bucket.
- `1h`: timestamp rounded down to the hour.
- `1w`: timestamp rounded down to Monday 00:00 UTC.

Each ticker update creates one candle contribution per interval. The database merges it into the bucket:

- `open`: kept from the first insert.
- `high`: max existing high and incoming trade price.
- `low`: min existing low and incoming trade price.
- `close`: latest trade price.
- `volume`: adds trade quantity.
- `quoteVolume`: adds `price * quantity`.
- `tradeCount`: increments by one.
- `lastTradeId`: guards against duplicate or older stream retries.

## 12. Final Flow Summary

```text
Frontend/API client
  -> POST /api/v1/order
  -> core-backend validates body and publishes MarketEvent to market:event
  -> core-trading-engine consumes market:event
  -> OMS validates and normalizes strings to bigint
  -> matching engine mutates orderbook, fills trades, records depth deltas
  -> core engine normalizes response strings
  -> core engine attaches marketData and database updates
  -> core engine publishes TradeResultEvent to engine:result
  -> API response router returns payload to HTTP request
  -> ws-server reads marketData and pushes subscribed depth/price/ticker events
  -> database-engine reads database payload and ticker.update events
  -> database-engine writes normal records plus TimescaleDB ticker/candle tables
```
