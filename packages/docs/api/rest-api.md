---
title: REST API
description: Repository-accurate HTTP routes, authentication requirements, request shapes, and implementation status.
category: api
order: 1
type: api
updated: 2026-06-28
---

# REST API

The core backend mounts its router at `/api/v1`. Local examples assume `http://localhost:8080/api/v1`.

## Authentication

Protected routes require the exact header form:

```http
Authorization: Bearer <access-token>
```

The access token is returned by signin as a string already prefixed with `Bearer `. Refresh tokens are stored in an HTTP-only, same-site cookie. See [Authentication and errors](/docs/api/auth-errors) for lifecycle details.

## Auth routes

| Method | Path | Auth | Status |
|---|---|---|---|
| `POST` | `/auth/signup` | Public | Implemented |
| `POST` | `/auth/signin` | Public | Implemented |
| `GET` | `/auth/signout` | Bearer + refresh cookie | Implemented |
| `GET` | `/auth/refresh` | Bearer + refresh cookie | Implemented |
| `GET` | `/auth/signout-all` | Bearer | Stub; empty controller |
| `POST` | `/auth/verify-otp` | Public | Stub |
| `POST` | `/auth/resend-otp` | Public | Stub |
| `POST` | `/auth/forgot-password` | Public | Stub |
| `POST` | `/auth/reset-password` | Public | Stub |
| `POST` | `/auth/change-password` | Bearer | Stub |
| `DELETE` | `/auth/archive-account` | Bearer | Stub |

### Signup

```http
POST /api/v1/auth/signup
Content-Type: application/json

{
  "username": "alice",
  "email": "alice@example.com",
  "password": "Exchange9",
  "confirmPassword": "Exchange9"
}
```

Signup writes the user to PostgreSQL and then sends `engine.user.add` so the engine creates its in-memory balance map.

### Signin

```http
POST /api/v1/auth/signin
Content-Type: application/json

{
  "username": "alice",
  "password": "Exchange9"
}
```

The response includes `token: "Bearer ..."` and basic user fields, and sets the refresh-token cookie.

## User and balance routes

All routes in this group require a Bearer token.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/user` | Read current profile from PostgreSQL |
| `POST` | `/user` | Stub profile update |
| `GET` | `/user/get-balance` | Read live balances from the engine |
| `POST` | `/user/add-balance` | Add engine balance and project an on-ramp transaction |
| `POST` | `/user/withdraw-balance` | Withdraw available engine balance |
| `POST` | `/user/withdraw-balnce` | Compatibility typo alias for withdraw |

Balance mutation body:

```json
{ "assetId": "USD", "amount": "10000.00" }
```

## Market and depth routes

| Method | Path | Auth | Source |
|---|---|---|---|
| `GET` | `/market` | Public | Engine markets |
| `GET` | `/market/assets` | Public | Engine assets |
| `GET` | `/market/tickers` | Public | Empty ticker snapshots generated from engine markets |
| `GET` | `/market/:marketId/candles` | Public | PostgreSQL/TimescaleDB |
| `GET` | `/market/:marketId/snapshot` | Public | Engine market + depth |
| `GET` | `/market/:marketId` | Public | Engine market |
| `GET` | `/depth/:marketId` | Public | Engine orderbook |
| `POST` | `/market` | Bearer via `requireAdminAuth` | Add engine market |
| `POST` | `/market/asset` | Bearer via `requireAdminAuth` | Add engine asset |
| `PUT` | `/market/:marketId` | Bearer via `requireAdminAuth` | Update engine market |
| `DELETE` | `/market/:marketId` | Bearer via `requireAdminAuth` | Delete empty engine market |

Candles accept `interval=1m|15m|1h|1w` and `limit=1..500`; defaults are `1m` and `120`.

> **Warning:** `requireAdminAuth` currently verifies a normal access token but does not check an admin claim or role. Market controllers also use a hard-coded internal user ID. Do not expose mutation routes as production admin APIs in this state.

## Order routes

All order routes require a Bearer token.

| Method | Path | Source |
|---|---|---|
| `POST` | `/order` | Create through engine |
| `GET` | `/order/all/:marketId` | Historical/projected orders from PostgreSQL |
| `GET` | `/order/open/:marketId` | Open orders from live engine state |
| `GET` | `/order/:orderId` | Order from live engine state |
| `DELETE` | `/order/:orderId` | Cancel through engine |

### Create an order

```http
POST /api/v1/order
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "marketId": "BTC_PERP",
  "marketType": "PERP",
  "entryPrice": "65000.00",
  "quantity": "0.10",
  "leverage": 10,
  "side": "BUY",
  "position": "LONG",
  "type": "LIMIT",
  "postOnly": false,
  "reduceOnly": false,
  "stpMode": "CANCEL_TAKER",
  "timeInForce": "Good_Till_Cancel"
}
```

All fields shown are required by the current client schema except `position`. `position` is required by engine rules for perpetual orders and forbidden for spot orders. `leverage` and `entryPrice` are still required by the HTTP schema for spot and market orders.

Accepted enum values:

| Field | Values |
|---|---|
| `marketType` | `SPOT`, `PERP` |
| `side` | `BUY`, `SELL` |
| `position` | `LONG`, `SHORT` |
| `type` | `LIMIT`, `MARKET` |
| `stpMode` | `CANCEL_MAKER`, `CANCEL_TAKER`, `CANCEL_BOTH` |
| `timeInForce` | `Good_Till_Cancel`, `Immediate_OR_Return`, `Fill_OR_KILL` |

Market orders cannot use GTC. For perpetual opening orders, `LONG` requires `BUY` and `SHORT` requires `SELL`.

## Health routes

Health checks live under `/health/*`: `core-backend`, `market-engine`, `redis-stream`, `nats-stream`, `ws-engine`, `ws-market-poller`, `database-engine`, `postgres`, `core-frontend`, `docs-frontend`, and `debug-frontend`.

Only the market-engine and Redis routes contact the named dependency. The NATS route reports that NATS is inactive. Several other routes currently return static success and are liveness placeholders.

## Response shape

Successful routes generally return:

```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

The order-create route is slightly different and nests the engine response under `order`.

