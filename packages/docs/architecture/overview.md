---
title: System architecture
description: The major runtime boundaries, state owners, and active infrastructure of the exchange.
category: architecture
order: 1
type: architecture
updated: 2026-06-28
---

# System architecture

The internal exchange is event-driven around one active command stream and one result stream. The trading engine is the authoritative owner of live balances, positions, orders, and orderbooks; PostgreSQL holds durable projections rather than driving matching decisions.

## Runtime topology

```mermaid
flowchart TB
  subgraph Clients
    Browser[core-frontend]
    Debug[debug-console]
    Consumer[API consumer]
  end

  subgraph Edge
    Proxy[proxy-server]
    API[core-backend]
    WSG[ws-server]
  end

  subgraph EventPlane[Event plane]
    Redis[(Redis Streams)]
    NATS[(NATS retained / inactive)]
  end

  subgraph Compute
    Engine[core-trading-engine]
    Poller[ws-index-poller]
    DBEngine[database-engine]
  end

  subgraph Data
    Snapshot[(Engine snapshot)]
    Postgres[(PostgreSQL / TimescaleDB)]
    Backpack[Backpack REST + WS]
    Binance[Binance futures WS]
  end

  Browser --> Proxy --> Backpack
  Browser --> Backpack
  Debug --> API
  Consumer --> API
  API --> Redis
  Poller --> Redis
  Binance --> Poller
  Redis --> Engine
  Engine --> Snapshot
  Engine --> Redis
  Redis --> API
  Redis --> WSG --> Debug
  Redis --> DBEngine --> Postgres
  API --> Postgres
  NATS -. rollback implementation .- API
  NATS -. rollback implementation .- Engine
```

## Ownership rules

| State | Active owner | Durable copy |
|---|---|---|
| Orderbooks and open orders | Trading engine | Snapshot; orders projected to PostgreSQL |
| User balances | Trading engine | Snapshot; asset transactions in PostgreSQL |
| Perpetual positions | Trading engine | Snapshot; no `Position` table by design |
| Markets and assets | Trading engine | Snapshot and PostgreSQL projection |
| Users and sessions | Core backend | PostgreSQL |
| Trades and candles | Database engine | PostgreSQL / TimescaleDB |
| WS subscriptions | Each WS server process | None |

## Consistency model

1. The backend registers a pending promise before adding a command to `market:event`.
2. The trade-engine consumer group gives a command to a trading-engine consumer.
3. The engine mutates in-memory state synchronously for that command.
4. On a successful mutation, the engine attaches realtime and database projections and writes a snapshot.
5. A backend-originated command is published to `engine:result`.
6. The backend resolves the matching request while the WS and database consumer groups independently process the same result.

This means the HTTP response and downstream projections share a correlation/result event, but PostgreSQL persistence happens asynchronously after engine acceptance.

## Current constraints

- Engine state is process-local; horizontal engine scaling requires market partitioning or another single-writer strategy that is not implemented here.
- Snapshot writes use a local file and are not a distributed journal.
- Redis consumers acknowledge only after their handlers succeed, but pending-entry recovery and dead-letter processing are not implemented.
- The backend result listener starts at `$`, so results produced before a backend process starts are not replayed to that process.
- WS subscription maps are local to a WS server instance.

