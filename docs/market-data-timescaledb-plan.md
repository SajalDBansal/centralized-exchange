# Market Data, TimescaleDB, and WebSocket Flow

## Goal

Persist ticker and candle data for `1m`, `15m`, `1h`, and `1w` intervals, and push live `price`, `depth`, and `ticker` updates to subscribed frontend WebSocket clients whenever orders mutate the book or trades execute.

## Important Prisma Postgres Note

Prisma ORM can manage PostgreSQL extensions through custom SQL migrations, for example by creating an empty migration and adding `CREATE EXTENSION IF NOT EXISTS ...` manually. Prisma also recommends raw SQL for extension-specific behavior that is not represented natively in the Prisma schema.

Prisma Postgres, the hosted database product, has a published supported-extension list. `timescaledb` is not listed there as of this report, so TimescaleDB should run on a Timescale/Tiger Cloud database, self-hosted TimescaleDB, or another Postgres provider that explicitly supports the `timescaledb` extension. Local dev now uses `timescale/timescaledb:latest-pg16`.

Sources:

- Prisma ORM PostgreSQL extensions: https://www.prisma.io/docs/orm/prisma-schema/postgresql-extensions
- Prisma Postgres extensions and supported list: https://www.prisma.io/docs/postgres/database/postgres-extensions
- TimescaleDB hypertables: https://docs.timescale.com/api/latest/hypertable/create_hypertable_old/
- TimescaleDB Docker image tags: https://hub.docker.com/r/timescale/timescaledb
- TimescaleDB continuous aggregates: https://docs.timescale.com/use-timescale/latest/continuous-aggregates/

## Data Flow Plan

1. User places or cancels an order through the backend.
2. Backend sends the request to the trading engine.
3. Trading engine validates through OMS, locks or releases balances, mutates the in-memory orderbook, and applies fills.
4. Trading engine builds one return payload with:
   - assets and markets needed for foreign keys
   - touched orders
   - fill/trade records
   - `depth.update`: only the price levels changed by the current order mutation
   - `price.update`: the last executed trade price for each fill
   - `ticker.update`: rolling ticker state for each fill
5. Trading engine publishes that one result to Redis Stream `engine:result`.
6. Core backend reads `engine:result`, filters by `backendId` and `requestId`, and returns the payload as the API response.
7. `apps/database-engine` consumes `engine:result` through `database-engine-group`, ignores depth/price updates, derives ticker and candle rows from ticker updates, and writes batched records to Postgres/TimescaleDB.
8. `apps/ws-server` consumes `engine:result` through `ws-server-group`, extracts market-data updates, and fans them out to subscribed WebSocket clients.

## WebSocket Frontend Flow

The frontend connects to `ws://<host>:8081/ws`.

On connect, the server sends:

```json
{
  "type": "connection.ready",
  "eventTs": 1710000000000,
  "protocol": "market-data.v1"
}
```

The frontend subscribes by market and stream:

```json
{
  "type": "subscribe",
  "marketId": "BTC_INR",
  "stream": ["price", "depth", "ticker"]
}
```

Or with explicit stream keys:

```json
{
  "type": "subscribe",
  "streams": ["price:BTC_INR", "depth:BTC_INR", "ticker:BTC_INR"]
}
```

Unsubscribe uses the same shape with `"type": "unsubscribe"`.

Internally, ws-server keeps:

- `subscriptionsBySocket`: socket -> subscribed keys
- `socketsBySubscription`: stream key -> sockets

When an `engine:result` message arrives, ws-server reads `updates.marketData`, builds each key with `streamKey(event.stream, event.marketId)`, and sends the event only to sockets subscribed to that key.

## Event Types Sent to Frontend

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

Price update:

```ts
{
  type: "price.update";
  stream: "price";
  marketId: string;
  eventTs: number;
  tradeId?: string;
  data: {
    lastPrice: string;
    lastQuantity?: string;
    markPrice?: string;
    indexPrice?: string;
  };
}
```

Ticker update:

```ts
{
  type: "ticker.update";
  stream: "ticker";
  marketId: string;
  eventTs: number;
  tradeId?: string;
  data: {
    lastPrice: string;
    lastQuantity?: string;
    lastQuoteVolume?: string;
    priceChange24h: string;
    priceChangePercent24h: string;
    high24h: string;
    low24h: string;
    volume24h: string;
    quoteVolume24h: string;
  };
}
```

Depth is emitted once per successful order create/cancel when that mutation changed at least one book level. `data.bids` and `data.asks` contain only the changed levels; a level quantity of `"0"` means frontend clients should remove that price level from their local book. Price and ticker are emitted once per real `TRADE` fill, so a taker order that matches multiple makers can produce multiple price/ticker events.

## TimescaleDB/Prisma Schema

Two tables were added:

- `MarketTicker`: latest ticker snapshot per market.
- `MarketTickerCandle`: OHLCV candle table keyed by `(marketId, interval, bucketStart)`.

The Prisma schema models both tables normally. The SQL migration adds:

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
SELECT create_hypertable('"MarketTickerCandle"', 'bucketStart', if_not_exists => TRUE, migrate_data => TRUE);
```

The candle table primary key includes `bucketStart`, because TimescaleDB requires unique and primary-key constraints on hypertables to include the time partition column.

## Persistence Details

The trading engine does not send depth or price updates to the database as database writes. Database-engine reads the same `engine:result` stream and only uses `ticker.update` events for ticker tables.

For each ticker trade update, database-engine derives four candle contributions:

- `1m`
- `15m`
- `1h`
- `1w`

The database engine merges each contribution with:

- `open`: first insert value for the bucket
- `high`: max of existing high and incoming price
- `low`: min of existing low and incoming price
- `close`: incoming price for the newest trade
- `volume`: existing volume plus fill quantity
- `quoteVolume`: existing quote volume plus `price * quantity`
- `tradeCount`: incremented by one
- `lastTradeId`: highest applied engine trade id

The `lastTradeId` guard makes candle and ticker updates idempotent for Redis Stream retries and duplicate maker/taker order captures.

## Query Examples

Latest ticker:

```sql
SELECT *
FROM "MarketTicker"
WHERE "marketId" = 'BTC_INR';
```

Recent 1m candles:

```sql
SELECT *
FROM "MarketTickerCandle"
WHERE "marketId" = 'BTC_INR'
  AND "interval" = '1m'
ORDER BY "bucketStart" DESC
LIMIT 200;
```

All supported chart intervals for one market:

```sql
SELECT "interval", count(*)
FROM "MarketTickerCandle"
WHERE "marketId" = 'BTC_INR'
GROUP BY "interval";
```

## Runtime Streams

- `market:event`: backend/API request stream into the trading engine.
- `engine:result`: single return stream used by core backend, database-engine, and ws-server.

Consumer groups on `engine:result`:

- core backend: direct `XREAD`, filtered by `backendId` and `requestId`
- database-engine: `database-engine-group`
- ws-server: `ws-server-group`

## Optional Future Upgrade

If we later want raw tick storage plus database-side rollups, add an append-only `MarketTradeTick` hypertable and define TimescaleDB continuous aggregates with `time_bucket`. Continuous aggregates are updated incrementally in the background and can reduce query cost for long chart ranges. The current implementation writes the four required intervals directly because it is simple, deterministic, and works with the current database-engine event flow.
