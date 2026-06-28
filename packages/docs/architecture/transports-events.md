---
title: Transports and events
description: Redis stream names, consumer groups, event envelopes, delivery behavior, and the retained NATS path.
category: architecture
order: 5
type: architecture
updated: 2026-06-28
---

# Transports and events

## Redis stream registry

| Stream | Producer | Consumers |
|---|---|---|
| `market:event` | Core backend, WS index poller | Trading engine (`trade-engine-group`) |
| `engine:result` | Trading engine for backend-originated commands | Backend response listener, database group, WS group |

`snapshot-engine-group` is created on `market:event`, but no snapshot consumer service currently reads it.

## Consumer groups

| Group | Delivery purpose | Ack behavior |
|---|---|---|
| `trade-engine-group` | One engine consumer handles each command | After handler completes |
| `database-engine-group` | Every result is independently available to persistence | After batch persistence |
| `ws-server-group` | Every result is independently available to WS fanout | After local publish attempt |

Each service uses a consumer name suffixed with its process ID. Redis group semantics distribute messages among instances in the same group; they do not broadcast to every instance in that group.

> **Warning:** With multiple WS server instances in one consumer group, only one instance receives a given event, while subscriptions are stored locally. Complete horizontal fanout needs pub/sub, per-instance groups, or another broadcast layer.

## Engine subjects

| Domain | Subjects |
|---|---|
| Orders | `engine.order.create`, `engine.order.cancel`, `engine.order.openOrders`, `engine.order.get` |
| Balances | `engine.ramp.on`, `engine.ramp.off`, `engine.balance.get` |
| Markets | `engine.market.getAll`, `engine.market.getAll.asset`, `engine.market.get`, `engine.market.add`, `engine.market.update`, `engine.market.delete`, `engine.market.asset.add` |
| Market data/risk | `engine.depth.get`, `engine.market.indexPrice.update`, `engine.market.funding.settle` |
| System | `engine.health.check`, `engine.user.add` |

The subject-to-payload and subject-to-response mappings in `nats-types.ts` are transport-independent despite the filename.

## Delivery and idempotency

- Redis entries remain in the streams; no trimming policy is configured in code.
- The generic consumer reads only new group entries (`>`).
- Failed handler messages are not acknowledged, but pending entries are not reclaimed automatically.
- Engine order commands do not expose a client-provided idempotency key.
- Database records use stable IDs and `skipDuplicates`/upserts to make repeated projection writes safer.
- Ticker/candle SQL updates require a newer `lastTradeId` before replacing or accumulating data.

## NATS status

The NATS helper remains functional code and supports:

- request/reply with a timeout;
- wildcard subscription and queue groups;
- reconnect forever with a two-second delay;
- BigInt-safe JSON serialization;
- publish and graceful drain.

No active app imports it at runtime. The current backend and engine show the previous NATS calls in comments next to the Redis implementations. Treat NATS as a rollback/reference path until a deliberate transport switch is implemented and tested.

