# Single-Market Position Store Guide

Perpetual position ownership is split into two layers:

```txt
Position
  -> routes a fill or lookup by market id

SingleMarketPositions
  -> owns positions and indexes for one market
  -> applies open, increase, reduce, close, and flip mutations
  -> releases collateral and realized PnL
  -> returns positions crossing an index-price liquidation boundary
```

This mirrors the matching architecture:

```txt
MatchingEngine -> SingleMarketOrderBook
Position       -> SingleMarketPositions
```

## Position Indexes

Each `SingleMarketPositions` instance owns:

```ts
positionsByUserId: Map<UserId, UserPositionType>
positionsById: Map<PositionId, UserPositionType>

longLiquidationBuckets: Map<LiquidationPrice, Set<PositionId>>
shortLiquidationBuckets: Map<LiquidationPrice, Set<PositionId>>

longLiquidationTree: ordered liquidation-price tree
shortLiquidationTree: ordered liquidation-price tree
```

The maps serve different access patterns:

| Index | Purpose |
| --- | --- |
| `positionsByUserId` | OMS reduce-only validation and normal user-position lookup. |
| `positionsById` | Stable direct lookup for future liquidation, ADL, and audit workflows. |
| Liquidation buckets | Group positions sharing a trigger price. |
| Ordered liquidation trees | Traverse only price buckets crossed by the current index price. |

The store exposes `entries()` for snapshot serialization and `values()` for
future funding sweeps, ADL ranking, and market-wide risk inspection.

## Liquidation Threshold Query

The wrapper exposes:

```ts
positionEngine.getLiquidatablePositions(marketId, indexPrice)
```

For longs:

```txt
liquidate when indexPrice <= liquidationPrice
query buckets where liquidationPrice >= indexPrice
```

For shorts:

```txt
liquidate when indexPrice >= liquidationPrice
query buckets where liquidationPrice <= indexPrice
```

The method only identifies candidates. It intentionally does not close
positions yet. A future liquidation coordinator can consume candidates and add:

- liquidation order execution;
- insurance-fund transfers;
- bankruptcy-loss handling;
- auto-deleveraging (`ADL`);
- funding-rate settlement;
- partial liquidation rules;
- liquidation fees and maintenance-margin tiers.

## Bankruptcy and Liquidation Prices

`bankruptcyPrice` is the price where the isolated position margin is exhausted.

```txt
bankruptcy move = margin / quantity

LONG bankruptcy  = entryPrice - bankruptcy move
SHORT bankruptcy = entryPrice + bankruptcy move
```

`liquidationPrice` triggers before bankruptcy, preserving a 10% margin-loss
buffer:

```txt
liquidation move = bankruptcy move * 90%

LONG liquidation  = entryPrice - liquidation move
SHORT liquidation = entryPrice + liquidation move
```

Example for `1 BTC @ 100 USD`, `10x` leverage:

```txt
margin          = 10 USD
bankruptcy move = 10 USD
liquidation move = 9 USD

LONG:
  liquidationPrice = 91 USD
  bankruptcyPrice  = 90 USD

SHORT:
  liquidationPrice = 109 USD
  bankruptcyPrice  = 110 USD
```

The gap between liquidation and bankruptcy is `1 USD`, which is 10% of the
position margin-loss distance.

## Index Maintenance

Any mutation that changes quantity, margin, average price, or direction also
updates liquidation indexing:

```txt
remove old liquidation bucket reference
  -> mutate position
  -> recalculate leverage, bankruptcyPrice, and liquidationPrice
  -> add new liquidation bucket reference
```

Closing removes both user-ID and position-ID references. Flipping removes the
old position and creates a new position ID for the opposite exposure.

## Snapshot Restore

Snapshots remain data-oriented:

```txt
market id -> serialized positions
```

At startup:

```txt
Engine.loadSnapshot
  -> Position.initializeMarket for every market
  -> Position.restorePosition for every serialized position
      -> recalculate derived prices
      -> rebuild user, position-id, bucket, and ordered-tree indexes
```

Older snapshots without `bankruptcyPrice` remain loadable because restore
recalculates the field from entry price, quantity, and margin.
