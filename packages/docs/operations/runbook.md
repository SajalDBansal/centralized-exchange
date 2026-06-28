---
title: Operations runbook
description: Startup order, health checks, failure diagnosis, recovery steps, and production-readiness warnings.
category: operations
order: 2
type: readme
updated: 2026-06-28
---

# Operations runbook

## Recommended startup order

1. PostgreSQL/TimescaleDB and Redis.
2. Apply Prisma migrations and verify database access.
3. Trading engine (creates streams/groups and restores snapshot).
4. Database engine and WS server.
5. Core backend (it waits for its Redis response listener before binding HTTP).
6. Index poller.
7. Debug/docs/core frontends and proxy as needed.

## Basic health checks

```bash
curl -fsS http://localhost:8080/api/v1/health/core-backend
curl -fsS http://localhost:8080/api/v1/health/redis-stream
curl -fsS http://localhost:8080/api/v1/health/market-engine
curl -fsS http://localhost:8081/health
curl -fsS http://localhost:8082/health
```

Do not use the backend's placeholder WS/database/Postgres health responses as proof that those dependencies are working. Check each service process and dependency directly.

## A backend request times out

Check in order:

1. Redis is reachable from backend and engine using the same host/port.
2. `market:event` exists and `trade-engine-group` has an active consumer.
3. The engine process is not stuck/crashed during snapshot writing.
4. `engine:result` is receiving results for backend-originated commands.
5. The result's `backendId` matches the current backend process.

The backend starts its direct stream read at `$`, so restarting it intentionally ignores old results. A timed-out mutation is indeterminate; query state before retrying.

## Database projections lag or stop

Check:

1. the database engine logs for Prisma/SQL failures;
2. TimescaleDB extension availability;
3. pending entries in `database-engine-group`;
4. foreign-key ordering (assets/users/markets must exist before related orders/trades);
5. migration/schema alignment with generated Prisma client.

The worker does not currently reclaim abandoned pending entries. Manual inspection/replay may be required after a consumer crash.

## WebSocket clients receive no data

Verify:

1. the client receives `connection.ready`;
2. subscription keys use `ticker|price|depth:MARKET_ID`;
3. an order mutation produced depth or trade events;
4. WS server is consuming `engine:result` in `ws-server-group`;
5. the event reached the same WS instance that owns the subscription.

Index-poller events currently do not get published to `engine:result`; see the known limitation in [Risk, funding, and liquidation](/docs/trading/risk-funding-liquidation).

## Snapshot recovery

Before replacing a snapshot:

1. stop the trading engine;
2. copy the snapshot for forensic analysis;
3. validate that it is complete JSON and note the `eventSequenceId`;
4. determine whether removing it (which seeds default markets and loses live state) is acceptable;
5. restart a single engine instance and inspect restore logs/state.

Never delete a production snapshot casually: balances, positions, and book priority are not fully reconstructible from PostgreSQL today.

## Redis memory and retention

No `MAXLEN` trimming is configured when publishing. Monitor stream lengths and define a retention/replay policy before long-running deployment. Do not trim beyond unprocessed group positions without understanding pending entries.

## Graceful shutdown gaps

The WS server handles SIGTERM/SIGINT and closes its Redis subscriber/gateway. Other long-running apps do not all implement graceful drain. Deployments should allow in-flight work to finish and should test duplicate delivery around restarts.

## Before production

- Replace placeholder/static dependency health checks.
- Add role-based admin authorization.
- Add Redis pending recovery, dead-lettering, retention, and idempotency.
- Make snapshots atomic, versioned, checksummed, and backed up.
- Add durable command/event journaling and reconciliation.
- Design WS horizontal fanout.
- Add oracle freshness/quality controls and liquidation backstops.
- Correct and validate Dockerfiles/production Compose; current files contain copied `apps/api`/`apps/web` scaffolding paths that do not match this repository.

