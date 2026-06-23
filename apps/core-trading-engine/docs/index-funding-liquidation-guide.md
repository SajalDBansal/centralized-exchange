# Index Price, Funding, Liquidation, and Fee Flow

This document describes the first market-risk implementation slice. It is
designed so later insurance-fund, ADL, funding-history, and partial-liquidation
work can extend the engine without replacing order matching or position
settlement.

## Event Contracts

The engine accepts:

```ts
EVENT_TO_ENGINE_SUBJECT.INDEX_PRICE_UPDATE
```

with:

```ts
{
  marketId: "BTC_PERP",
  indexPrice: "91000.00",
  timestamp: 1767225600000
}
```

and:

```ts
EVENT_TO_ENGINE_SUBJECT.FUNDING_SETTLE
```

with:

```ts
{
  marketId: "BTC_PERP",
  indexPrice: "101000.00",
  markPrice: "100000.00",
  intervalSeconds: 3600
}
```

## Poller Producer

`apps/ws-index-poller` connects to Binance futures mark-price websocket data:

```txt
wss://fstream.binance.com/ws/!markPrice@arr@1s
```

For supported symbols, it publishes index updates through:

```ts
RedisPublisher.publishMarketEvent(...)
```

into:

```txt
REDIS_STREAMS.MARKET_EVENT = "market:event"
```

It retains the latest index and mark prices and publishes a funding-settlement
event every configured interval. The default is one hour.

Poller events use `EventSource.WS`. The trading engine processes them but does
not publish an unused backend-response event.

## Market Risk State

`EngineState` stores:

```ts
marketRisk: Map<MarketId, {
  indexPrice: bigint,
  indexUpdatedAt: number,
  lastFundingRateBps: bigint,
  lastFundingSettledAt: number
}>

insuranceFunds: Map<MarketId, bigint>
commissionFunds: Map<MarketId, bigint>
fundingPayments: FundingPayment[]
```

These values are included in snapshots.

## Index Update and Liquidation

The index update route is:

```txt
Engine.process(INDEX_PRICE_UPDATE)
  -> MarketEngine.onIndexPriceUpdate
      -> store index price
      -> Position.getLiquidatablePositions
          -> SingleMarketPositions.getLiquidatablePositions
  -> Engine.executeLiquidations
```

Liquidation candidates become system-generated reduce-only market IOC orders.
They run through the normal order checks, matching, position settlement, and
fee settlement path.

```ts
{
  marketType: "PERP",
  type: "MARKET",
  reduceOnly: true,
  liquidation: true,
  timeInForce: "Immediate_OR_Return"
}
```

When orderbook liquidity is unavailable, the liquidation attempt fails and the
position remains indexed. A later price update can retry it. Future ADL and
insurance execution can consume these failed attempts.

## Funding Formula

The market engine computes:

```txt
premiumBps = (indexPrice - markPrice) * 10000 / indexPrice
intervalRateBps = premiumBps * intervalSeconds / 3600
fundingRateBps = clamp(intervalRateBps, -1, 1)
```

Current direction:

```txt
indexPrice > markPrice -> longs pay shorts
indexPrice < markPrice -> shorts pay longs
```

For each position:

```txt
fundingAmount = positionNotional * abs(fundingRateBps) / 10000
```

Funding changes isolated position margin and quote collateral together, then
recalculates and reindexes liquidation and bankruptcy prices.

If payer margin cannot cover the full funding amount, the remaining deficit is
recorded against `insuranceFunds`. The resulting low-margin position becomes a
liquidation candidate.

Every applied payment is appended to `fundingPayments` for auditing.

## Fill Fees

Fees are charged only after a fill executes:

| Fill | Fee |
| --- | ---: |
| Maker | `1` basis point |
| Taker | `2` basis points |
| Liquidation order | `50` basis points |

Spot:

- buy reservations include fee headroom;
- buyers pay quote fees from locked quote balance;
- sellers pay quote fees from received quote proceeds.

Perp:

- fees are charged from available quote collateral after position settlement;
- commission is credited to `commissionFunds`;
- an uncovered fee deficit is recorded against `insuranceFunds`.

The fee values are intentionally centralized in `BalanceEngine.fillFee(...)`.
They can later move into per-market configuration or account-tier schedules.

## Future Extensions

This implementation intentionally leaves room for:

- mark-price aggregation across multiple exchanges;
- maintenance-margin tiers;
- partial liquidation;
- liquidation fee routing split between insurance and commission;
- positive insurance-fund deposits and withdrawals;
- ADL ranking and execution;
- funding caps per market;
- funding history persistence outside the in-memory snapshot;
- dedicated liquidation retry queues.

