# Balance Locking and Order Matching Guide

This document explains the implemented balance reservation and matching flow in
the core trading engine. It covers spot and perpetual (`PERP`) orders, including
limit orders, market orders, time-in-force modes, partial fills, insufficient
reservation, cancellation, self-trade prevention, and snapshot restoration.

The main implementation files are:

- `src/engines/core-engine.ts`
- `src/engines/oms-engine.ts`
- `src/engines/balance-engine.ts`
- `src/engines/matching-engine.ts`
- `src/engines/single-orderbook.ts`
- `src/engines/position-engine.ts`
- `src/utils/parse-incoming.ts`

## 1. Core Terms

Each user asset balance has two values:

```ts
{
  total: bigint,
  locked: bigint
}
```

Available balance is:

```txt
available = total - locked
```

Locking does not decrease `total`. It reserves a portion of the total so another
order cannot spend the same funds. Settlement decreases both `total` and
`locked` for a spent spot asset. Unlocking decreases only `locked`.

Every created order also receives a reservation ledger:

```ts
{
  allotted: bigint, // total amount reserved for this order
  used: bigint,     // amount consumed by completed fills
  released: bigint  // unused amount returned to available balance
}
```

Spot orders store this as `balanceLedger`. Perp orders store it as
`marginLedger`.

The remaining reservation owned by an order is:

```txt
available reservation = allotted - used - released
```

## 2. Fixed-Point Values

Request values are strings. The engine parses quantity and price into `bigint`
using market precision.

The examples use the default `BTC_USD` and `BTC_PERP` markets:

```ts
{
  baseAsset: { id: "BTC", symbol: "BTC", precision: 2 },
  quoteAsset: { id: "USD", symbol: "USD", precision: 2 },
  maxLeverage: 50,
  minQty: 1,
  tickSize: 1,
  lotSize: 1,
  minNotional: 1
}
```

Example conversions:

| Request string | Internal bigint |
| --- | ---: |
| `"2.00"` BTC | `200n` |
| `"110.00"` USD | `11000n` |
| `"0.01"` BTC | `1n` |

Quote notional:

```txt
quoteNotional(quantity, price)
  = ceil(quantity * price / 10 ^ basePrecision)
```

For `2 BTC @ 110 USD`:

```txt
quoteNotional(200n, 11000n)
  = ceil(200 * 11000 / 100)
  = 22000n
  = 220 USD
```

Perp margin:

```txt
perpMargin(quantity, price, leverage)
  = ceil(quoteNotional(quantity, price) / leverage)
```

Market perp orders receive a 5% initial buffer:

```txt
bufferedPerpMargin
  = ceil(perpMargin * 105 / 100)
```

## 3. Full Order Creation Path

All spot and perp orders follow this orchestration:

```txt
Engine.process("engine.order.create", payload)
  -> Engine.createOrder(payload)
      -> OMSEngine.createOrderChecks(payload)
          -> normalizeOrderIncoming
          -> basic, TIF, market, position, orderbook, and risk checks
      -> BalanceEngine.lockBalance(parsedOrder)
      -> MatchingEngine.createOrder(parsedOrder, lockedAmount)
          -> construct internal order and reservation ledger
          -> SingleMarketOrderBook.addOrder(order)
              -> FOK liquidity check
              -> post-only check
              -> match
                  -> BalanceEngine.prepareFill(maker, taker, qty, makerPrice)
                  -> create fills
                  -> rest allowed remainder or set final status
      -> release reservations for STP-cancelled maker orders
      -> settle each fill
          -> BalanceEngine.applyFill for spot
          -> Position.applyFill for perp
      -> BalanceEngine.releaseUnusedBalance(result)
      -> normalize response and save snapshot
```

Matching always executes at the resting maker order's price.

`SingleMarketOrderBook` receives `BalanceEngine` when the book is constructed.
The book calls `BalanceEngine.prepareFill(...)` directly while matching.

The global `EngineState.orders` map and each book's `orderMap` contain only
currently-resting orders. Filled, cancelled, and rejected orders are removed or
never inserted. During matching, the book temporarily returns maker and taker
references for immediate settlement without retaining terminal orders globally.

Before locking a market order, OMS requires opposite-side non-self book
liquidity for the full requested quantity. This confirms quantity is present,
but it does not guarantee that the user's submitted-price reservation can fund
every maker price. A spot market buy can therefore pass liquidity validation
and later become `PARTIAL_REJECTED` when its order-specific budget is exhausted.

## 4. Complete Incoming Payloads

Every request must provide `entryPrice`, including market orders. For market
orders, it is the user's current market-price estimate and reservation basis.
It is not a guaranteed execution price.

### 4.1 Spot Limit Buy

```ts
{
  userId: "alice",
  marketId: "BTC_USD",
  marketType: "SPOT",
  side: "BUY",
  type: "LIMIT",
  entryPrice: "120.00",
  quantity: "2.00",
  postOnly: false,
  stpMode: "CANCEL_TAKER",
  timeInForce: "Good_Till_Cancel",
  createdAt: 1767225600000
}
```

### 4.2 Spot Limit Sell

```ts
{
  userId: "bob",
  marketId: "BTC_USD",
  marketType: "SPOT",
  side: "SELL",
  type: "LIMIT",
  entryPrice: "110.00",
  quantity: "2.00",
  postOnly: false,
  stpMode: "CANCEL_TAKER",
  timeInForce: "Good_Till_Cancel",
  createdAt: 1767225601000
}
```

### 4.3 Spot Market Buy

```ts
{
  userId: "alice",
  marketId: "BTC_USD",
  marketType: "SPOT",
  side: "BUY",
  type: "MARKET",
  entryPrice: "100.00",
  quantity: "2.00",
  postOnly: false,
  stpMode: "CANCEL_TAKER",
  timeInForce: "Immediate_OR_Return",
  createdAt: 1767225602000
}
```

### 4.4 Spot Market Sell

```ts
{
  userId: "bob",
  marketId: "BTC_USD",
  marketType: "SPOT",
  side: "SELL",
  type: "MARKET",
  entryPrice: "100.00",
  quantity: "2.00",
  postOnly: false,
  stpMode: "CANCEL_TAKER",
  timeInForce: "Immediate_OR_Return",
  createdAt: 1767225603000
}
```

### 4.5 Perp Limit Long

A long position uses `position: "LONG"` with `side: "BUY"`.

```ts
{
  userId: "alice",
  marketId: "BTC_PERP",
  marketType: "PERP",
  side: "BUY",
  position: "LONG",
  type: "LIMIT",
  entryPrice: "100.00",
  quantity: "2.00",
  leverage: 10,
  reduceOnly: false,
  postOnly: false,
  stpMode: "CANCEL_TAKER",
  timeInForce: "Good_Till_Cancel",
  createdAt: 1767225604000
}
```

### 4.6 Perp Limit Short

A short position uses `position: "SHORT"` with `side: "SELL"`.

```ts
{
  userId: "bob",
  marketId: "BTC_PERP",
  marketType: "PERP",
  side: "SELL",
  position: "SHORT",
  type: "LIMIT",
  entryPrice: "100.00",
  quantity: "2.00",
  leverage: 10,
  reduceOnly: false,
  postOnly: false,
  stpMode: "CANCEL_TAKER",
  timeInForce: "Good_Till_Cancel",
  createdAt: 1767225605000
}
```

### 4.7 Perp Market Long

```ts
{
  userId: "alice",
  marketId: "BTC_PERP",
  marketType: "PERP",
  side: "BUY",
  position: "LONG",
  type: "MARKET",
  entryPrice: "100.00",
  quantity: "2.00",
  leverage: 10,
  reduceOnly: false,
  postOnly: false,
  stpMode: "CANCEL_TAKER",
  timeInForce: "Immediate_OR_Return",
  createdAt: 1767225606000
}
```

### 4.8 Perp Market Short

```ts
{
  userId: "bob",
  marketId: "BTC_PERP",
  marketType: "PERP",
  side: "SELL",
  position: "SHORT",
  type: "MARKET",
  entryPrice: "100.00",
  quantity: "2.00",
  leverage: 10,
  reduceOnly: false,
  postOnly: false,
  stpMode: "CANCEL_TAKER",
  timeInForce: "Immediate_OR_Return",
  createdAt: 1767225607000
}
```

### 4.9 Perp Reduce-Only Close

To reduce an existing long position, submit the opposite direction:

```ts
{
  userId: "alice",
  marketId: "BTC_PERP",
  marketType: "PERP",
  side: "SELL",
  position: "SHORT",
  type: "LIMIT",
  entryPrice: "120.00",
  quantity: "1.00",
  leverage: 10,
  reduceOnly: true,
  postOnly: false,
  stpMode: "CANCEL_TAKER",
  timeInForce: "Immediate_OR_Return",
  createdAt: 1767225608000
}
```

Reduce-only orders lock `0` new margin and cannot use `LIMIT GTC`, because they
are not allowed to rest.

## 5. Internal Order Shape

`MatchingEngine.createOrder(...)` generates `orderId` and runtime fields.

A newly-created spot buy from section 4.1 becomes:

```ts
{
  userId: "alice",
  marketId: "BTC_USD",
  marketType: "SPOT",
  side: "BUY",
  type: "LIMIT",
  entryPrice: 12000n,
  quantity: 200n,
  postOnly: false,
  stpMode: "CANCEL_TAKER",
  timeInForce: "Good_Till_Cancel",
  createdAt: 1767225600000,
  margin: 0n,
  orderId: "<generated cuid>",
  filled: 0n,
  remainingQty: 200n,
  averagePrice: 0n,
  status: "OPEN",
  fills: [],
  depths: { asks: [], bids: [] },
  balanceLedger: {
    allotted: 24005n,
    used: 0n,
    released: 0n
  }
}
```

A newly-created perp limit long from section 4.5 becomes:

```ts
{
  userId: "alice",
  marketId: "BTC_PERP",
  marketType: "PERP",
  side: "BUY",
  position: "LONG",
  type: "LIMIT",
  entryPrice: 10000n,
  quantity: 200n,
  leverage: 10,
  reduceOnly: false,
  postOnly: false,
  stpMode: "CANCEL_TAKER",
  timeInForce: "Good_Till_Cancel",
  createdAt: 1767225604000,
  margin: 2000n,
  orderId: "<generated cuid>",
  filled: 0n,
  remainingQty: 200n,
  averagePrice: 0n,
  status: "OPEN",
  fills: [],
  depths: { asks: [], bids: [] },
  marginLedger: {
    allotted: 2000n,
    used: 0n,
    released: 0n
  }
}
```

## 6. Matching Algorithm and Fill Shape

The orderbook maintains:

```txt
bids: highest price first
asks: lowest price first
orders at the same price: FIFO insertion order
```

For each incoming taker order:

```txt
1. Select the best opposite maker price.
2. Stop if the book is empty.
3. For a limit order, stop if the maker price does not cross the limit.
4. Apply STP when maker and taker have the same userId.
5. requestedQty = min(taker remainingQty, maker remainingQty).
6. Call BalanceEngine.prepareFill(maker, taker, requestedQty, makerPrice).
7. Fill the returned affordable quantity.
8. Remove a fully-filled maker or retain a partially-filled maker.
9. Continue until the taker fills, stops crossing, runs out of liquidity, or
   exhausts its affordable reservation.
```

Suppose Bob's resting sell and Alice's incoming buy match:

```txt
maker: Bob SELL 1 BTC LIMIT @ 110 USD
taker: Alice BUY 2 BTC LIMIT @ 120 USD
```

The generated fill has every field set:

```ts
{
  tradeId: 1n,
  makerOrderId: "<bob order cuid>",
  takerOrderId: "<alice order cuid>",
  makerUserId: "bob",
  takerUserId: "alice",
  side: "SELL",
  marketId: "BTC_USD",
  qty: 100n,
  price: 11000n,
  timestamp: 1767225609000,
  status: "TRADE"
}
```

`side` is the resting maker's side. Settlement loads both orders by ID, so it
still applies the correct debit and credit to each participant.

## 7. Spot Balance Locking

### 7.1 Spot Buy

For spot buys:

```txt
locked USD = quoteNotional(quantity, submitted entryPrice) + taker fee
```

For Alice buying `2 BTC @ 120 USD`:

```txt
quantity  = 200n
price     = 12000n
lock      = 24005n = 240.05 USD
```

Before:

```ts
USD: { total: 30000n, locked: 0n } // 300 USD total
```

After locking:

```ts
USD: { total: 30000n, locked: 24005n }
balanceLedger: { allotted: 24005n, used: 0n, released: 0n }
```

### 7.2 Spot Sell

For spot sells:

```txt
locked BTC = quantity
```

For Bob selling `2 BTC`:

```ts
BTC: { total: 300n, locked: 0n } // before
BTC: { total: 300n, locked: 200n } // after locking

balanceLedger: { allotted: 200n, used: 0n, released: 0n }
```

## 8. Spot Matching Examples

### 8.1 Limit Buy With Price Improvement and Resting Remainder

Initial ask:

```txt
Bob: SELL 1 BTC LIMIT GTC @ 110 USD
Bob balanceLedger = { allotted: 1 BTC, used: 0, released: 0 }
```

Alice submits:

```txt
BUY 2 BTC LIMIT GTC @ 120 USD
```

Initial reservation:

```txt
Alice locks 2 * 120 + taker fee = 240.05 USD
Alice balanceLedger = { allotted: 240.05, used: 0, released: 0 }
```

Matching uses Bob's maker price:

```txt
requestedQty = min(Alice remaining 2 BTC, Bob remaining 1 BTC) = 1 BTC
fill price   = 110 USD
fill cost    = 110 USD + 0.03 USD taker fee
```

After the fill:

```txt
Alice balanceLedger.used = 110.03 USD
Alice remainingQty       = 1 BTC
Alice status             = PARTIAL_FILLED
```

Because Alice's remaining `LIMIT GTC` order rests, it needs:

```txt
desired resting reservation = 1 BTC * 120 USD + maker fee = 120.02 USD
available reservation       = 240.05 - 110.03 - 0 = 130.02 USD
release                     = 130.02 - 120.02 = 10 USD
```

Final state:

```ts
balanceLedger: {
  allotted: 24005n,
  used: 11003n,
  released: 1000n
}

Alice USD: {
  total: 18997n,  // 300 - 110.03 = 189.97 USD
  locked: 12002n  // supports the resting 1 BTC bid and maker fee
}

Alice BTC: {
  total: 100n,
  locked: 0n
}
```

### 8.2 Market Buy With Insufficient Order-Specific Reservation

Initial ask:

```txt
Bob: SELL 2 BTC LIMIT GTC @ 110 USD
```

Alice submits the full payload from section 4.3:

```txt
BUY 2 BTC MARKET IOC with submitted entryPrice 100 USD
```

The market order initially locks its submitted budget:

```txt
allotted = 2 * 100 + taker fee = 200.04 USD
```

The actual maker ask is `110 USD`. With taker fees, two BTC would cost
`220.05 USD`, which exceeds this order's initial `200.04 USD` reservation. A
market buy may top up its ledger from Alice's unlocked USD balance. Suppose
Alice has only `210 USD` total:

```txt
initial lock             = 200.04 USD
remaining wallet balance =   9.96 USD
maximum capacity         = 210 USD
```

`maxSpotFillQty(...)` finds the greatest lot-sized affordable quantity:

```txt
affordable fill = 1 BTC
cost            = 110.03 USD
remaining       = 1 BTC
status          = PARTIAL_REJECTED
```

The unspent amount is released:

```ts
balanceLedger: {
  allotted: 20004n,
  used: 11003n,
  released: 9001n
}
```

The first `110.03 USD` fill consumes part of the initial reservation. The
remaining `90.01 USD` reservation cannot fund another `110.03 USD` lot, so
matching stops. When enough unlocked USD exists, a spot market buy locks the
required top-up and increases `balanceLedger.allotted` before settlement.

### 8.3 Market Sell

Initial bid:

```txt
Alice: BUY 1 BTC LIMIT GTC @ 110 USD
```

Bob submits:

```txt
SELL 2 BTC MARKET IOC with submitted entryPrice 100 USD
```

Bob locks the full `2 BTC`. One BTC fills:

```txt
used      = 1 BTC
released  = 1 BTC
status    = PARTIAL_FILLED
remainder = 1 BTC, not resting
```

Final ledger:

```ts
balanceLedger: {
  allotted: 200n,
  used: 100n,
  released: 100n
}
```

### 8.4 Spot Cancellation

Suppose Alice has a live bid:

```txt
BUY 1 BTC LIMIT GTC @ 120 USD
balanceLedger = { allotted: 120.02 USD, used: 0, released: 0 }
USD locked    = 120.02 USD
```

Cancellation removes the order from the book and calls
`releaseOrderMargin(...)`:

```txt
available reservation = 120.02 - 0 - 0 = 120.02 USD
released              = 120.02 USD
USD locked            = 0 USD
```

Final ledger:

```ts
balanceLedger: {
  allotted: 12002n,
  used: 0n,
  released: 12002n
}
```

## 9. Perp Margin Locking

### 9.1 Perp Limit Order

For a non-reduce-only perp limit order:

```txt
initial lock = perpMargin(quantity, submitted entryPrice, leverage)
```

For `2 BTC @ 100 USD` with `10x` leverage:

```txt
notional = 200 USD
margin   = ceil(200 / 10) = 20 USD
```

Ledger:

```ts
marginLedger: {
  allotted: 2000n,
  used: 0n,
  released: 0n
}
```

### 9.2 Perp Market Order

For a non-reduce-only perp market order:

```txt
initial lock = ceil(perpMargin * 105 / 100)
```

For `2 BTC @ 100 USD` with `10x` leverage:

```txt
base margin     = 20 USD
5% buffer       = 1 USD
initial lock    = 21 USD
```

Ledger:

```ts
marginLedger: {
  allotted: 2100n,
  used: 0n,
  released: 0n
}
```

### 9.3 Fill-Time Perp Margin Top-Up

Unlike spot matching, perp matching may lock additional available quote
collateral from the user's wallet.

For each perp participant:

```txt
required fill margin = perpMargin(fillQty, makerPrice, order.leverage)
available reservation = allotted - used - released
additional lock = max(required fill margin - available reservation, 0)
```

If the additional lock succeeds:

```txt
marginLedger.allotted += additional lock
marginLedger.used     += required fill margin
```

If the full requested quantity cannot be funded, `maxPerpFillQty(...)` uses:

```txt
capacity = available order reservation + unlocked wallet collateral
```

It finds the largest lot-sized quantity that fits. The taker becomes
`PARTIAL_REJECTED` after a partial affordable fill, or `REJECTED` if no lot can
fill.

### 9.4 Perp Price Increase Example

Alice submits:

```txt
BUY/LONG 2 BTC MARKET IOC
submitted entryPrice = 100 USD
leverage             = 10x
initial lock         = 21 USD
```

The maker ask is `120 USD`:

```txt
required margin for 2 BTC = ceil(240 / 10) = 24 USD
available reservation     = 21 USD
additional lock           = 3 USD
```

If Alice has at least `3 USD` unlocked collateral:

```ts
marginLedger: {
  allotted: 2400n,
  used: 2400n,
  released: 0n
}
```

If Alice cannot add the full `3 USD`, the engine computes and fills only the
lot-sized quantity supported by her reservation plus unlocked USD.

## 10. Perp Position Settlement

Perp fills update positions instead of exchanging BTC ownership.

For a new `LONG` fill of `2 BTC @ 100 USD` with `10x` leverage:

```ts
{
  userId: "alice",
  positionId: "<generated cuid>",
  orderId: "<originating order id>",
  market: "BTC_PERP",
  side: "BUY",
  position: "LONG",
  leverage: 10,
  margin: 2000n,
  averagePrice: 10000n,
  quantity: 200n,
  liquidationPrice: 9100n,
  bankruptcyPrice: 9000n,
  entryPrice: 10000n,
  upnl: 0n
}
```

When a fill has the same direction as an existing position, the engine:

- adds quantity;
- adds fill margin;
- recomputes weighted average price;
- recomputes effective leverage, liquidation price, and bankruptcy price.

When a fill has the opposite direction, the engine:

- releases proportional margin for the closed quantity;
- applies realized PnL to quote `total`;
- removes the position when fully closed;
- creates an opposite position for any quantity beyond the close.

### 10.1 Reduce-Only Close Example

Alice has:

```txt
LONG 1 BTC @ 100 USD
margin locked = 10 USD
```

Alice submits the reduce-only payload from section 4.9:

```txt
SELL/SHORT 1 BTC LIMIT IOC @ 120 USD
reduceOnly = true
new margin lock = 0 USD
```

If the fill executes at `120 USD`:

```txt
realized PnL = (120 - 100) * 1 BTC = 20 USD
released position margin = 10 USD
position is removed
USD locked decreases by 10 USD
USD total increases by 20 USD
```

## 11. Time In Force and Post-Only

### 11.1 `Good_Till_Cancel` (`GTC`)

- Allowed for limit orders.
- An unmatched or partially matched remainder rests on the book.
- The engine retains the reservation required by the resting remainder.
- The live order can be cancelled later.

### 11.2 `Immediate_OR_Return` (`IOC`)

- Allowed for limit and market orders.
- Matches available liquidity immediately.
- Any unmatched remainder does not rest.
- Unused reservation is released.

### 11.3 `Fill_OR_KILL` (`FOK`)

- Checks whether sufficient non-self liquidity exists before matching.
- Cancels the entire order when book liquidity is insufficient.
- A successful liquidity precheck is still followed by reservation checks
  during fills.

### 11.4 `postOnly`

- Applies to limit orders.
- Rejects the order when its price would immediately cross the best opposite
  book price.
- A non-crossing order rests normally and keeps its required reservation.

## 12. Order Statuses

| Status | Meaning |
| --- | --- |
| `OPEN` | Live resting order with no fill yet. |
| `PARTIAL_FILLED` | Some quantity filled; remainder may rest only for limit GTC. |
| `FILLED` | Entire quantity filled. |
| `CANCELLED` | Cancelled explicitly, by STP, by FOK liquidity failure, or because a non-resting order had no fill. |
| `PARTIAL_REJECTED` | Matching stopped after a partial fill because the reservation could not fund another requested lot. |
| `REJECTED` | Matching or post-only logic rejected the order before any fill. |

## 13. Self-Trade Prevention

When taker and maker belong to the same user, no fill is created.

| `stpMode` | Result |
| --- | --- |
| `CANCEL_TAKER` | Cancel the incoming taker and keep the resting maker. |
| `CANCEL_MAKER` | Remove the resting maker, release its reservation, and continue matching the taker. |
| `CANCEL_BOTH` | Cancel both orders and release the resting maker reservation. |

The taker's unused reservation is released during normal post-match cleanup.

There are two enforcement points:

- OMS pre-validates crossing limit orders. It rejects limit takers immediately
  for `CANCEL_TAKER` and `CANCEL_BOTH`, before a new reservation is locked.
- Runtime matching applies the table above. This handles market orders, and it
  removes `CANCEL_MAKER` limit makers so their existing reservation can be
  released.

## 14. Error Rollback

If an error occurs after initial locking but before order creation completes,
`Engine.createOrder(...)` calls:

```txt
BalanceEngine.releaseBalance(parsedOrder, lockedAmount)
```

This unlocks the initial asset or margin amount.

## 15. Snapshot Restoration

Snapshots persist live order ledgers as stringified bigint values. Terminal
orders are not retained in the global map or snapshot. On restart:

- balances are restored;
- orders and ledgers are restored;
- `OPEN` and `PARTIAL_FILLED` orders with remaining quantity return to the
  orderbook;
- older snapshots with status `PARTIAL` are migrated to `PARTIAL_FILLED`;
- older spot snapshots without `balanceLedger` reconstruct the outstanding
  resting reservation from remaining quantity and submitted entry price.

## 16. Quick Rule Table

| Order | Initial reservation | Can receive fill-time top-up? | Unused release |
| --- | --- | --- | --- |
| Spot buy limit | Full quantity notional at submitted price plus taker-fee headroom | No | Release price improvement, excess fee headroom, and non-resting remainder |
| Spot buy market | Full quantity notional at submitted price plus taker-fee headroom | Yes, from unlocked quote balance | Release unspent quote balance |
| Spot sell limit | Full submitted base quantity | No | Release non-resting remainder |
| Spot sell market | Full submitted base quantity | No | Release unfilled base quantity |
| Perp limit | Margin at submitted price and leverage | Yes | Release unused margin when no remainder rests |
| Perp market | Margin at submitted price and leverage plus 5% buffer | Yes | Release unused margin after matching |
| Perp reduce-only | `0` new margin | No new margin needed | Position settlement releases closed collateral |
