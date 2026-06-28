---
title: Data flow and diagrams
description: Visual reference for commands, results, state mutation, persistence, and market-data delivery.
category: architecture
order: 4
type: architecture
updated: 2026-06-28
---

# Data flow and diagrams

## Command-to-result pipeline

```mermaid
flowchart LR
  HTTP[HTTP controller] --> Validate[JWT + Zod]
  Validate --> Envelope[MarketEvent envelope]
  Poller[Index poller] --> Envelope
  Envelope --> ME[(market:event)]
  ME --> Consume[trade-engine-group]
  Consume --> Dispatch[Engine.process]
  Dispatch --> State[(EngineState)]
  Dispatch --> Projections[Result + projections]
  Projections --> ER[(engine:result)]
  ER --> Response[Backend response router]
  ER --> Fanout[WS consumer group]
  ER --> Persist[Database consumer group]
```

## Engine mutation pipeline

```mermaid
flowchart TD
  Command[Typed order command] --> Parse[Decimal strings to bigint]
  Parse --> OMS[OMS validation]
  OMS --> Lock[Reserve balance or margin]
  Lock --> Match[Price-time matching]
  Match --> Fill{Fills?}
  Fill -->|Spot| Spot[Transfer base/quote + fees]
  Fill -->|Perpetual| Perp[Update positions + collateral + fees]
  Fill -->|None| Rest[Rest GTC limit or cancel IOC/FOK]
  Spot --> Release[Release unused reservation]
  Perp --> Release
  Rest --> Release
  Release --> Output[Normalize decimal strings]
  Output --> Snapshot[Write snapshot]
```

## Realtime bootstrap and deltas

```mermaid
sequenceDiagram
  participant Client
  participant API as core-backend
  participant WS as ws-server
  participant Engine

  Client->>API: GET /market/:id/snapshot
  par snapshot components
    API->>Engine: engine.market.get
    API->>Engine: engine.depth.get
  end
  API-->>Client: market + price/ticker/depth snapshot
  Client->>WS: subscribe ticker:id, price:id, depth:id
  WS-->>Client: subscribed acknowledgement
  Engine-->>WS: later result projections
  WS-->>Client: depth.update / price.update / ticker.update
```

Clients should discard deltas older than the snapshot and use `seq` for depth ordering. Shared helpers in `packages/types/src/types/market-data.ts` implement the cursor comparisons.

## Durable data projection

```mermaid
flowchart TB
  EngineMutation[Successful engine mutation] --> DBPayload[DatabaseWritePayload]
  EngineMutation --> MarketEvents[MarketDataEvent array]
  DBPayload --> Result[engine:result]
  MarketEvents --> Result
  Result --> DBEngine[database-engine]
  DBEngine --> Mutable[Upsert: assets, markets, orders, tickers]
  DBEngine --> Append[Append/idempotent: trades, transactions, funding, liquidation]
  DBEngine --> Candles[Derive 1m / 15m / 1h / 1w candles]
  Mutable --> PG[(PostgreSQL)]
  Append --> PG
  Candles --> TS[(TimescaleDB hypertable)]
```

## State recovery

```mermaid
stateDiagram-v2
  [*] --> ConstructEngine
  ConstructEngine --> LoadSnapshot: snapshot exists and parses
  ConstructEngine --> InitializeDefaults: snapshot absent or invalid
  LoadSnapshot --> Ready: restore markets, balances, orders, books, positions, risk
  InitializeDefaults --> Ready: seed BTC/ETH/SOL spot + perp markets
  Ready --> SaveSnapshot: successful mutation
  SaveSnapshot --> Ready
```

The snapshot is a recovery point, not an append-only event log. PostgreSQL is also not used to reconstruct live books/positions in the current startup path.

