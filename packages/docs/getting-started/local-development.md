---
title: Local development
description: Install dependencies, start infrastructure, migrate the database, and run the exchange services.
category: getting-started
order: 2
type: readme
updated: 2026-06-28
---

# Local development

The workspace uses Bun, Turbo, Node.js, PostgreSQL/TimescaleDB, Redis, and optionally NATS. Run commands from the repository root unless a section says otherwise.

## Prerequisites

- Node.js 20 or newer.
- Bun 1.3.x (the root manifest currently pins `bun@1.3.13`).
- Docker with Compose.
- Free local ports for the services you start.

## Install and start infrastructure

```bash
bun install
docker compose -f docker/docker-compose.dev.yml up -d
```

The development compose file exposes:

| Dependency | Host port | Purpose |
|---|---:|---|
| PostgreSQL 16 | `5432` | Primary relational database |
| TimescaleDB (Postgres 16) | `5433` | Required by the candle hypertable migration |
| Redis 7.4 | `6379` | Active engine command/result transport |
| NATS 2.11 | `4222` | Retained transport; inactive in current runtimes |

> **Warning:** The latest migration enables TimescaleDB and converts `MarketTickerCandle` into a hypertable. Point `DATABASE_URL` at the TimescaleDB instance when applying the complete migration history.

## Configure environment variables

Copy the checked-in `.env.example` files and replace placeholder secrets. Do not copy real credentials into documentation or commit them.

Core variables include:

```dotenv
# core-backend
PORT=8080
JWT_ACCESS_TOKEN=replace-with-a-long-random-secret
JWT_REFRESH_TOKEN=replace-with-a-different-long-random-secret
BCRYPT_HASH=10
REDIS_HOST=localhost
REDIS_PORT=6379
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/cex

# ws-server
WS_PORT=8081
WS_PATH=/ws

# proxy-server
PORT=8082
BACKPACK_REST_URL=https://api.backpack.exchange
ALLOW_MUTATIONS=false
```

## Generate and migrate Prisma

```bash
bun --filter @workspace/database generate
bun --filter @workspace/database db:migrate:deploy
```

Use `db:migrate:dev` only when authoring a new migration.

## Start the internal exchange path

Use separate terminals so failures remain visible:

```bash
bun --filter trading-engine dev
bun --filter core-backend dev
bun --filter databse-engine dev
bun --filter ws-server dev
bun --filter ws-index-poller dev
bun --filter debug-console dev
```

The `databse-engine` package name contains the current spelling from its `package.json`. The app directory is `apps/database-engine`.

## Start the external market-data frontend path

```bash
bun --filter proxy-server dev
bun --filter core-frontend dev
```

The core frontend currently reads Backpack REST data through `proxy-server` and connects directly to Backpack's public WebSocket endpoint. This path is independent from the internal `core-backend` + `ws-server` path used by the debug console.

## Start the docs site

```bash
bun --filter docs-frontend dev
```

Markdown changes under `packages/docs` are loaded by the docs frontend. If a newly added file does not appear after a hot reload, restart the docs dev process so Next.js rebuilds the file index.

## Quick verification

```bash
curl http://localhost:8080/api/v1/health/core-backend
curl http://localhost:8080/api/v1/health/market-engine
curl http://localhost:8081/health
curl http://localhost:8082/health
```

Then open the debug console, create a user, add quote balance, and place two crossing orders from separate users. See [Order lifecycle](/docs/trading/order-lifecycle) for the expected state transitions.

