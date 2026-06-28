---
title: Repository map
description: A practical guide to the applications, shared packages, infrastructure, and source-of-truth files.
category: getting-started
order: 3
type: readme
updated: 2026-06-28
---

# Repository map

## Applications

```text
apps/
  core-backend/          Express REST API and Redis response correlation
  core-trading-engine/   In-memory OMS, matching, balances, positions, risk
  database-engine/       Redis result consumer and Prisma persistence worker
  ws-server/             Internal market-data WebSocket gateway
  ws-index-poller/       Binance mark/index feed and funding scheduler
  proxy-server/          Backpack REST reverse proxy
  core-frontend/         Main Next.js exchange UI
  debug-console/         Internal API and WebSocket test UI
  docs-frontend/         This documentation site
  market-maker/          Reserved empty directory; no service implementation yet
```

## Shared packages

| Package | Responsibility |
|---|---|
| `database` | Prisma schema, generated client, and PostgreSQL adapter |
| `types` | Engine subjects, request/response maps, orders, market data, persistence events |
| `validations` | Zod validation for HTTP request bodies and parameters |
| `redis-stream` | Redis connections, stream initialization, publishers, and group consumers |
| `nats-stream` | Retained NATS request/reply and subscription implementation |
| `ui` | Shared React components and global/docs/debug styles |
| `docs` | Markdown content consumed by `docs-frontend` |
| `eslint-config` | Shared lint configuration |
| `typescript-config` | Shared compiler configuration |
| `jest-presets` | Shared Jest preset |

## Where to make a change

| Change | Start here | Also check |
|---|---|---|
| Add an HTTP endpoint | `apps/core-backend/src/routers` | controller, validation, API docs |
| Add an engine command | `packages/types/src/types/nats-types.ts` | engine switch, Redis event maps, tests |
| Change order behavior | `apps/core-trading-engine/src/engines` | snapshots, database mapping, trading docs |
| Change a persisted record | `packages/database/prisma/schema.prisma` | migration, database engine, database docs |
| Add a realtime event | `packages/types/src/types/market-data.ts` | publisher, WS gateway/client, WS docs |
| Add a docs page | `packages/docs/<category>` | frontmatter, internal links |

## Engine source-of-truth files

- `core-engine.ts` owns the command dispatcher and shared `EngineState`.
- `oms-engine.ts` validates orders and risk constraints.
- `single-orderbook.ts` performs price-time matching.
- `balance-engine.ts` reserves and settles spot funds and perpetual collateral.
- `single-market-positions.ts` owns position mutation, PnL, funding, and liquidation indexes.
- `database-manager.ts` translates engine mutations into persistence payloads.
- `market-data-publisher.ts` builds depth, price, and ticker events.

## Documentation boundaries

This site documents the repository as it exists. It does not claim an external production hostname, throughput target, SDK, rate-limit tier, or unsupported order type. If a page says a feature is planned or retained, it is not part of the active request path.

