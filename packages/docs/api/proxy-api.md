---
title: Backpack proxy
description: Configure and safely use the external Backpack REST proxy used by the main frontend.
category: api
order: 4
type: api
updated: 2026-06-28
---

# Backpack proxy

`proxy-server` is a reverse proxy for Backpack Exchange REST endpoints. It is separate from the internal exchange backend.

## Local endpoints

| Path | Purpose |
|---|---|
| `GET /` | Service metadata |
| `GET /health` | Proxy liveness and configured upstream |
| `/api/backpack/*` | Forwarded upstream path |

For example:

```text
GET http://localhost:8082/api/backpack/api/v1/markets
  -> https://api.backpack.exchange/api/v1/markets
```

## Safety defaults

- `GET`, `HEAD`, and `OPTIONS` are allowed.
- Mutating methods return 405 unless `ALLOW_MUTATIONS=true`.
- CORS is limited by `ALLOWED_ORIGINS`.
- Requests are rate-limited per IP (`300` per 60 seconds by default).
- Helmet and compression are enabled.
- The proxy does not load or sign private Backpack credentials.

> **Warning:** Enabling mutation forwarding is not sufficient for safe private trading. Keep exchange secrets server-side, implement signing and authorization deliberately, and tighten the forwarded headers and route allowlist.

## Frontend integration

The main frontend defaults `NEXT_PUBLIC_PROXY_URL` to:

```text
http://localhost:8082/api/backpack/api/v1
```

Its helper functions request tickers, markets, mark prices, open interest, depth, trades, and klines. Public realtime data uses a direct Backpack WebSocket URL rather than this HTTP proxy.

