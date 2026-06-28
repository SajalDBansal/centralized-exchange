---
title: Configuration reference
description: Environment variables, defaults, ports, and safe configuration notes for every runtime.
category: operations
order: 1
type: readme
updated: 2026-06-28
---

# Configuration reference

## Core backend

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | No | `8080` | HTTP listen port |
| `JWT_ACCESS_TOKEN` | Yes | — | Access-token signing secret |
| `JWT_REFRESH_TOKEN` | Yes | — | Refresh-token signing secret |
| `BCRYPT_HASH` | No | `10` | Bcrypt cost |
| `NODE_ENV` | No | `development` | Cookie/error/log behavior |
| `DATABASE_URL` | Yes | — | Prisma PostgreSQL connection |
| `REDIS_HOST` | No | `localhost` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |

Use different high-entropy JWT secrets. In production the refresh cookie is marked secure; TLS termination must preserve HTTPS semantics.

## Trading engine

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ENGINE_SNAPSHOT_PATH` | No | `<cwd>/snapshots/core-engine.snapshot.txt` | Snapshot file path |
| `REDIS_HOST` | No | `localhost` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |

Use durable storage for snapshots and ensure only one intended engine writer owns a market partition.

## Database engine

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Prisma connection |
| `DATABASE_ENGINE_BATCH_SIZE` | No | `100` | Maximum stream messages per read |
| `DATABASE_ENGINE_BLOCK_TIME_MS` | No | `1000` | Blocking read duration |
| `REDIS_HOST` | No | `localhost` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |

Batch size and block time must be positive integers.

## WebSocket server

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `WS_PORT` | No | `8081` | Preferred listen port |
| `PORT` | No | `8081` | Fallback listen port |
| `WS_PATH` | No | `/ws` | WebSocket upgrade path |
| `REDIS_HOST` | No | `localhost` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |

## Index poller

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `BINANCE_MARK_PRICE_STREAM_URL` | No | Binance aggregate 1s futures stream | Upstream WS URL |
| `FUNDING_INTERVAL_SECONDS` | No | `3600` | Funding settlement cadence |
| `REDIS_HOST` | No | `localhost` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |

## Proxy server

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | No | `8080` | HTTP port; local examples conventionally use `8082` |
| `BACKPACK_REST_URL` | No | `https://api.backpack.exchange` | Upstream origin |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` | Comma-separated CORS allowlist |
| `ALLOW_MUTATIONS` | No | `false` | Permit non-read methods |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate-limit window |
| `RATE_LIMIT_MAX` | No | `300` | Requests per IP/window |

## Frontends

| Application | Variables |
|---|---|
| Core frontend | `NEXT_PUBLIC_PROXY_URL`, `NEXT_PUBLIC_BACKPACK_WS_URL` |
| Debug console | `NEXT_PUBLIC_CORE_BACKEND_URL`, `NEXT_PUBLIC_WS_URL` |
| Docs frontend | `NEXT_PUBLIC_DEBUG_CONSOLE_URL`, `NEXT_PUBLIC_CORE_SITE_URL` |

Every `NEXT_PUBLIC_*` value is embedded into browser assets. Never put a private key or server secret in one.

## Retained NATS configuration

`NATS_URL` is required only when code imports/instantiates `NatsManager`. Current app runtimes do not do that. The development Compose service exposes `nats://localhost:4222` for future or rollback work.

