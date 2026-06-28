---
title: Service catalog
description: Every application and infrastructure service, with ownership, interfaces, dependencies, and current maturity.
category: architecture
order: 2
type: architecture
updated: 2026-06-28
---

# Service catalog

## Application matrix

| Application | Interface | Depends on | Current role |
|---|---|---|---|
| `core-backend` | HTTP, default `:8080/api/v1` | Redis, PostgreSQL | Auth, REST routing, validation, engine request correlation |
| `core-trading-engine` | Redis consumer | Redis, local snapshot storage | OMS, matching, balances, positions, funding, liquidation |
| `database-engine` | Redis consumer | Redis, PostgreSQL | Idempotent durable projections and candle aggregation |
| `ws-server` | HTTP health + WS, default `:8081/ws` | Redis | Subscriptions and market-data fanout |
| `ws-index-poller` | Outbound WS + Redis publisher | Binance futures WS, Redis | Index-price updates and periodic funding-settlement commands |
| `proxy-server` | HTTP, default `:8082` | Backpack REST | CORS/rate-limited upstream proxy; read-only by default |
| `core-frontend` | Next.js | Proxy, Backpack WS | Main market UI using external Backpack data today |
| `debug-console` | Next.js | Core backend, internal WS | Exercises auth, wallet, market, and order paths |
| `docs-frontend` | Next.js | `packages/docs` | Renders this Markdown documentation |
| `market-maker` | None | None | Empty reserved directory, not an implemented service |

## Core backend

The Express app mounts all routes under `/api/v1`. It stores users/sessions in PostgreSQL and sends typed commands to the engine through `market:event`. `BackendResponseRouter` gives each backend process a unique `backendId`, correlates `requestId` values, and rejects requests after a five-second default timeout.

Health routes for Redis and the market engine perform real checks. Several other health handlers currently return static success bodies and should not be treated as dependency probes.

## Trading engine

The trading engine consumes `market:event` using `trade-engine-group`. It owns a shared `EngineState` containing:

- balances;
- orderbooks, global orders, and order-to-market lookup;
- positions per market;
- markets and assets;
- index/funding risk state;
- insurance and commission funds;
- funding payment history.

After a successful mutating command it builds database/realtime updates and writes `core-engine.snapshot.txt` (or `ENGINE_SNAPSHOT_PATH`).

## Database engine

The database engine consumes `engine:result` using its own consumer group. It deduplicates a batch, upserts mutable entities, creates append-only records with `skipDuplicates`, and applies monotonic trade-id guards to ticker and candle upserts.

It derives `1m`, `15m`, `1h`, and `1w` candles from ticker trade events.

## WebSocket server

The WS server consumes `engine:result` with a separate consumer group and publishes `ticker`, `price`, or `depth` events only to matching local subscriptions. It exposes a real `/health` endpoint and a configurable WS path.

## Index poller

The poller connects to Binance's aggregate futures mark-price stream, maps `BTCUSDT`, `ETHUSDT`, and `SOLUSDT` to the repository's perpetual market IDs, and publishes index/funding commands to Redis.

> **Warning:** Poller events use source `WS`. The current engine stream handler mutates state for those events but publishes `engine:result` only for source `BACKEND`. Consequently poller-originated updates do not currently reach the database engine or WS server through that result stream.

## Proxy server

The proxy forwards `/api/backpack/*` to the configured Backpack REST origin. It applies CORS, Helmet, compression, logging, and an IP rate limiter. Unless `ALLOW_MUTATIONS=true`, only `GET`, `HEAD`, and `OPTIONS` pass the safety guard.

It is not the gateway for the internal `/api/v1` routes.

## Infrastructure

| Service | Active? | Notes |
|---|---|---|
| Redis | Yes | Command/result streams and consumer groups |
| PostgreSQL | Yes | Auth and durable exchange records |
| TimescaleDB | Required for latest candle migration | `MarketTickerCandle` hypertable |
| NATS | No, retained | Package and rollback code exist; runtime calls are commented |
| Local snapshot file | Yes | Trading-engine restore point |

