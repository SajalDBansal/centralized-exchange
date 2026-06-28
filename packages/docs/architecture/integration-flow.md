---
title: Integration flow
description: End-to-end paths across clients, backend, proxy, Redis, NATS, engine, WebSocket, poller, and database.
category: architecture
order: 3
type: architecture
updated: 2026-06-28
---

# Integration flow

There are two client-facing integration paths in the repository. Keeping them separate prevents an external market-data call from being mistaken for an internal exchange command.

## Path A: internal exchange command and realtime result

```mermaid
sequenceDiagram
    autonumber

    participant C as Client
    participant B as Core Backend
    participant R as Redis Streams
    participant E as Trading Engine
    participant W as WS Server
    participant D as Database Engine
    participant P as PostgreSQL

    C->>B: POST /api/v1/order + Bearer JWT
    B->>B: Authenticate + Zod validate
    B->>B: Register requestId/backendId promise
    B->>R: XADD market:event

    R->>E: XREADGROUP (trade-engine-group)
    E->>E: OMS check, lock, match, settle
    E->>E: Build projections + save snapshot
    E->>R: XADD engine:result

    par HTTP Correlation
        R-->>B: XREAD result
        B-->>B: Match requestId/backendId
        B-->>C: JSON response
    and Realtime Fanout
        R-->>W: XREADGROUP (ws-server-group)
        W-->>C: Ticker / Price / Depth events
    and Persistence
        R-->>D: XREADGROUP (database-engine-group)
        D->>P: Upsert orders & tickers
        D->>P: Append trades
    end
```

The database write is not on the HTTP critical path. An accepted order can be returned before its projection is committed to PostgreSQL.

## Path B: external market-data UI

```mermaid
flowchart LR
  UI[core-frontend] -->|REST /api/backpack/*| Proxy[proxy-server]
  Proxy -->|rewritten REST path| BackpackREST[Backpack REST]
  UI -->|public stream subscriptions| BackpackWS[Backpack WebSocket]
```

The proxy protects the upstream with an origin allowlist, rate limiting, and a read-only default. The browser WebSocket client currently connects directly to Backpack and manages reconnect/subscription state locally.

## Index, funding, and liquidation path

```mermaid
sequenceDiagram
    autonumber

    participant X as Binance Futures WS
    participant P as Index Poller
    participant R as Redis Streams
    participant E as Trading Engine
    participant S as Position/Risk State

    X->>P: Mark & Index Price Updates
    P->>R: XADD engine.market.indexPrice.update

    R->>E: XREADGROUP
    E->>S: Update index prices
    E->>S: Find liquidatable positions

    loop Every FUNDING_INTERVAL_SECONDS
        P->>R: XADD engine.market.funding.settle
        R->>E: XREADGROUP
        E->>S: Calculate capped funding
        E->>S: Apply funding payments
    end
```

The poller maps only BTC, ETH, and SOL perpetual symbols. Other external symbols are ignored.

## Where NATS fits

`@workspace/nats-streams` implements request/reply, publish, wildcard subscription, reconnection, and BigInt-safe JSON encoding. Backend controllers and the engine entry point retain commented NATS calls for rollback:

```text
core-backend -- request(engine.subject) --> NATS -- engine.> --> core-trading-engine
```

This is not executed in the current runtime. Redis Streams is the only active engine command transport, and running the NATS container does not make it part of the request path.

## Correlation envelope

A command on `market:event` carries:

```json
{
  "requestId": "correlation-id",
  "backendId": "backend-process-id",
  "source": "BACKEND",
  "type": "engine.order.create",
  "payload": {},
  "timestamp": 1782640000000
}
```

The result repeats `requestId`, `backendId`, and `sourceEventType`, then includes the typed engine payload and optional `updates.marketData` / `updates.database` projections.

## Failure boundaries

- HTTP validation failure: no Redis command is written.
- Backend timeout: the request promise rejects after five seconds; the engine may still process a delayed command.
- Engine rejection: a typed failure response is returned without a snapshot or downstream projections.
- WS delivery failure: does not roll back the engine mutation.
- Database failure: the batch is not acknowledged, but there is no automated pending-entry reclaim yet.
- Snapshot write failure: currently occurs inside the engine command path and can turn processing into an internal error after state mutation.

