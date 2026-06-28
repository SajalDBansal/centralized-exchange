---
title: Risk, funding, and liquidation
description: Perpetual margin rules, position accounting, index ingestion, funding settlement, and liquidation execution.
category: trading
order: 3
type: architecture
updated: 2026-06-28
---

# Risk, funding, and liquidation

## Margin model

Perpetual collateral uses the market's quote asset. Opening orders reserve margin based on order notional and leverage. Resting GTC orders keep the needed reservation; reduce-only orders reserve no additional opening margin.

The implementation tracks isolated margin on each position calculation but stores balances in a per-user asset map. It is not a complete cross-margin portfolio risk engine.

## Position accounting

Each market permits one net position per user. The position records direction, quantity, average/entry price, margin, effective leverage, bankruptcy price, liquidation price, and unrealized-PnL placeholder state.

Realized PnL on a close is:

```text
long:  (exit price - average entry) × closed quantity
short: (average entry - exit price) × closed quantity
```

The calculated PnL is added to quote total when collateral is released.

## Index-price ingestion

`ws-index-poller` consumes Binance futures mark-price messages and maps:

| Binance symbol | Engine market |
|---|---|
| `BTCUSDT` | `BTC_PERP` |
| `ETHUSDT` | `ETH_PERP` |
| `SOLUSDT` | `SOL_PERP` |

It publishes `engine.market.indexPrice.update` with index price and exchange event timestamp. The engine updates market risk state and queries liquidation indexes.

## Liquidation indexes

Long positions are indexed by liquidation price in one red-black tree; shorts use another. On an index update:

- longs at or above the current index threshold are selected;
- shorts at or below the threshold are selected.

For each selected position the engine submits a reduce-only IOC market order in the opposing direction at the current index price. Successful attempts create a liquidation persistence record.

> **Warning:** Liquidation depends on available opposing orderbook liquidity. A failed liquidation order increments failure counts but there is no retry queue, backstop market maker, or socialized-loss process.

## Funding

At `FUNDING_INTERVAL_SECONDS` (default 3600), the poller publishes index price, mark price, and interval. The engine computes:

```text
premium bps       = (index - mark) / index × 10,000
interval rate bps = premium bps × intervalSeconds / 3,600
funding rate bps  = clamp(interval rate, -1, +1)
```

For a positive rate, longs pay shorts; for a negative rate, shorts pay longs. Payment magnitude is based on position notional and absolute rate. Payments adjust position margin and the locked quote collateral. A payer shortfall is recorded against the in-memory insurance fund.

Funding settlement and payment records are prepared for PostgreSQL persistence.

## Current propagation limitation

The poller marks commands with source `WS`. The stream handler currently publishes `engine:result` only for source `BACKEND`. Therefore index/funding commands mutate engine state and snapshots but their market-data/database projections do not traverse the normal result consumers.

Until that handler behavior changes, do not assume funding/liquidation records initiated only by the poller have reached PostgreSQL or subscribed WS clients.

## Missing production controls

- maintenance-margin tiers and portfolio/cross-margin rules;
- stale-index rejection window;
- oracle aggregation and divergence controls;
- liquidation retry/backstop/deleveraging;
- durable insurance-fund ledger;
- user position REST/WS endpoints;
- reconciliation between snapshot and database projections.

