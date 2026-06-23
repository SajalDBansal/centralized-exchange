# `BalanceEngine.prepareFill` Guide

This document explains the purpose and behavior of
`BalanceEngine.prepareFill(...)` in the core trading engine.

Primary implementation files:

- `src/engines/balance-engine.ts`
- `src/engines/single-orderbook.ts`
- `src/utils/parse-incoming.ts`

## 1. Why `prepareFill` Exists

An order receives an initial balance reservation before it enters matching:

```txt
incoming order
  -> OMS validation
  -> BalanceEngine.lockBalance(order)
  -> SingleMarketOrderBook.addOrder(order)
  -> matching
```

Initial locking alone is not enough. The actual fill price is the resting
maker's price, which may differ from the incoming order's submitted
`entryPrice`.

Example:

```txt
Alice submits: BUY 2 BTC MARKET with entryPrice 100 USD
Initial lock:  2 * 100 + taker fee = 200.04 USD

Book maker:    SELL 2 BTC LIMIT @ 110 USD
Actual cost:   2 * 110 + taker fee = 220.05 USD
```

The engine must decide what can safely fill before it mutates quantities or
creates a trade. `prepareFill(...)` is that pre-fill gate.

It answers:

1. Can both maker and taker fund the requested quantity?
2. Does either order need additional reservation?
3. If the full quantity cannot fill, what is the largest lot-sized quantity
   that can fill?
4. Should matching stop with a rejected remainder?

## 2. Where It Runs

`SingleMarketOrderBook.match(...)` calculates the requested match quantity:

```txt
requestedQty = min(taker remainingQty, maker remainingQty)
```

Before creating a fill, the orderbook calls:

```ts
const prepared = this.balanceEngine.prepareFill(
    maker,
    taker,
    requestedQty,
    bestPrice
);
```

The returned object is:

```ts
{
  qty: bigint,
  reservationRejected: boolean
}
```

Meaning:

| Field | Meaning |
| --- | --- |
| `qty` | Affordable lot-sized quantity allowed to trade now. |
| `reservationRejected` | `true` when `qty < requestedQty`; matching must stop after this fill attempt. |

If `qty === 0n`, no fill is created. If `qty > 0n`, the matcher creates a fill
for exactly that quantity.

## 3. Reservation Ledgers

Every order tracks its own reservation:

```ts
{
  allotted: bigint,
  used: bigint,
  released: bigint
}
```

Spot orders use:

```ts
order.balanceLedger
```

Perp orders use:

```ts
order.marginLedger
```

Available reservation is always:

```txt
available reservation = allotted - used - released
```

`prepareFill(...)` updates `allotted` when a top-up is required and updates
`used` for the approved fill quantity.

## 4. High-Level Branching

The public method dispatches by market type:

```txt
prepareFill(maker, taker, requestedQty, price)
  -> both SPOT
       -> prepareSpotFill(...)
  -> both PERP
       -> maxPerpFillQty(...) for maker and taker
       -> allotPerpFillMargin(...) for maker and taker
  -> mixed market types
       -> return requestedQty unchanged
```

Spot and perp orders should not share an orderbook, so the mixed-market branch
is a defensive fallback.

For both spot and perp:

```txt
makerQty = maximum affordable maker quantity
takerQty = maximum affordable taker quantity
qty      = min(makerQty, takerQty)
```

The smaller participant capacity controls the trade.

## 5. Spot Logic

### 5.1 Spot Sell

A spot sell initially locks the full submitted base quantity:

```txt
SELL 2 BTC
initial lock = 2 BTC
```

For a sell order:

```txt
maximum fill quantity = min(available base reservation, requestedQty)
```

Spot sellers do not receive fill-time top-ups because the submitted base
quantity was already locked before matching.

### 5.2 Spot Limit Buy

A spot limit buy initially locks notional plus taker-fee headroom:

```txt
quantity * submitted limit price + taker fee
```

For a limit buy:

```txt
capacity = available order reservation
```

It does not borrow additional wallet balance during matching.

This is sufficient for normal limit matching because a buy limit only executes
at a maker ask price less than or equal to its submitted limit price.

Example:

```txt
Alice: BUY 2 BTC LIMIT @ 120 USD
Initial lock = 240.05 USD

Bob maker ask = 110 USD
Requested fill = 1 BTC
Required balance = 110.03 USD
Available reservation = 240.05 USD

Approved fill = 1 BTC
Additional lock = 0 USD
```

### 5.3 Spot Market Buy

A spot market buy initially locks notional plus taker-fee headroom:

```txt
quantity * submitted entryPrice + taker fee
```

The submitted market `entryPrice` is a reservation estimate, not a guaranteed
execution price.

For a market buy:

```txt
available wallet balance = quote total - quote locked
capacity = available order reservation + available wallet balance
```

If execution requires more quote balance than the order already reserved,
`allotSpotFillBalance(...)` locks the difference and adds it to
`balanceLedger.allotted`.

Example with successful top-up:

```txt
Alice USD total = 220.05 USD
Alice submits BUY 2 BTC MARKET with entryPrice 100 USD

Initial reservation = 200.04 USD
Maker ask           = 110 USD
Actual cost         = 220.05 USD
Additional lock     = 20.01 USD
```

Final ledger before settlement:

```ts
balanceLedger: {
  allotted: 22005n,
  used: 22005n,
  released: 0n
}
```

### 5.4 Spot Market Partial Rejection

If the wallet cannot fund the full requested quantity, `maxSpotFillQty(...)`
uses binary search and rounds down to the market lot size.

Example:

```txt
Alice USD total = 210 USD
Alice submits BUY 2 BTC MARKET with entryPrice 100 USD

Initial reservation       = 200.04 USD
Additional wallet balance =   9.96 USD
Total capacity            = 210 USD
Maker ask                 = 110 USD per BTC
```

With taker fees, two BTC cost `220.05 USD`, but one BTC costs `110.03 USD`.

Result:

```txt
approved qty        = 1 BTC
reservationRejected = true
order status        = PARTIAL_REJECTED
remaining quantity  = 1 BTC
```

After post-match unused release:

```ts
balanceLedger: {
  allotted: 20004n,
  used: 11003n,
  released: 9001n
}
```

## 6. Perp Logic

Perp orders reserve quote collateral rather than spending quote assets for BTC.

Required margin is:

```txt
perpMargin(quantity, price, leverage)
  = ceil(quoteNotional(quantity, price) / leverage)
```

For each non-reduce-only perp order:

```txt
available collateral = quote total - quote locked
capacity = available order reservation + available collateral
```

If the fill needs more margin than the order already reserved,
`allotPerpFillMargin(...)` locks the difference:

```txt
additional = max(required fill margin - available reservation, 0)
```

Then it updates:

```txt
marginLedger.allotted += additional
marginLedger.used     += required fill margin
```

### 6.1 Perp Top-Up Example

```txt
Alice submits BUY/LONG 2 BTC MARKET
submitted entryPrice = 100 USD
leverage             = 10x

Initial buffered lock = 21 USD
Maker ask             = 120 USD
Required fill margin  = ceil(240 / 10) = 24 USD
Additional lock       = 3 USD
```

Ledger:

```ts
marginLedger: {
  allotted: 2400n,
  used: 2400n,
  released: 0n
}
```

### 6.2 Reduce-Only Perp Orders

Reduce-only orders return the requested quantity immediately from
`maxPerpFillQty(...)`:

```txt
reduceOnly = true
new fill reservation = 0
```

The position engine releases collateral from the existing position when the
close settles.

## 7. Why Ledger Mutation Happens Before Settlement

The sequence is:

```txt
prepareFill
  -> approve affordable quantity
  -> reserve any required top-up
  -> increment ledger.used

orderbook
  -> mutate filled quantities
  -> create fill

core engine
  -> settle fill
  -> release unused reservation
```

This ordering prevents settlement from debiting funds that were never locked.

For a spot buy:

```txt
prepareFill locks enough USD
applySpotFillToUser debits locked USD and credits BTC
```

For a spot sell:

```txt
prepareFill confirms locked BTC
applySpotFillToUser debits locked BTC and credits USD
```

For a perp fill:

```txt
prepareFill locks enough margin
Position.applyFill creates, increases, reduces, closes, or flips the position
```

## 8. How Matching Uses `reservationRejected`

When:

```txt
prepared.qty < requestedQty
```

`prepareFill(...)` returns:

```ts
{
  qty: preparedQty,
  reservationRejected: true
}
```

The orderbook:

1. creates a fill when `qty > 0n`;
2. stops further matching;
3. assigns `PARTIAL_REJECTED` when at least one quantity filled;
4. assigns `REJECTED` when no quantity could fill.

The rejected remainder never rests on the book.

## 9. Relationship to Initial Lock and Release

`prepareFill(...)` is one part of a three-stage lifecycle:

```txt
1. lockBalance(order)
   Initial reservation from submitted order details.

2. prepareFill(maker, taker, requestedQty, makerPrice)
   Fill-price affordability check and optional top-up.

3. releaseUnusedBalance(order)
   Unlock funds not consumed by fills or required by a resting LIMIT GTC
   remainder.
```

Cancellation uses:

```txt
releaseOrderMargin(order)
```

That releases the order's remaining reservation.

## 10. Helper Method Responsibilities

| Method | Responsibility |
| --- | --- |
| `prepareFill` | Dispatch spot/perp behavior and return approved fill quantity. |
| `prepareSpotFill` | Compare maker and taker spot capacity and reserve approved usage. |
| `maxSpotFillQty` | Calculate affordable spot quantity; allow wallet capacity only for market buys. |
| `allotSpotFillBalance` | Lock required spot market top-up and increment `balanceLedger.used`. |
| `availableSpotOrderReservation` | Return unused spot order reservation. |
| `maxPerpFillQty` | Calculate affordable perp quantity using reservation plus wallet collateral. |
| `allotPerpFillMargin` | Lock required perp top-up and increment `marginLedger.used`. |
| `availablePerpOrderReservation` | Return unused perp order margin. |
| `floorToLotSize` | Round partial affordable quantity down to a valid market lot. |

## 11. Summary

`prepareFill(...)` protects the engine at the last safe point before a trade is
created. It ensures:

- maker and taker reservations are both checked;
- actual maker prices are used;
- spot market buys can top up from available quote balance;
- spot limit buys stay bounded by their submitted reservation;
- spot sells cannot exceed locked base quantity;
- perp fills can top up collateral;
- unaffordable remainders are rejected at valid lot boundaries;
- settlement only debits already-locked assets or collateral.
