---
title: WebSocket API
description: Connect to the internal market-data gateway, subscribe to streams, and process control and data events.
category: api
order: 3
type: api
updated: 2026-06-28
---

# WebSocket API

The internal WebSocket server defaults to:

```text
ws://localhost:8081/ws
```

`WS_PORT` (or `PORT`) changes the port, and `WS_PATH` changes the path. The endpoint is currently public and carries market data only; there are no authenticated user-order or balance channels.

## Connection handshake

The first server frame is:

```json
{
  "type": "connection.ready",
  "eventTs": 1782640000000,
  "protocol": "market-data.v1"
}
```

## Subscribe

Explicit stream keys are the simplest form:

```json
{
  "type": "subscribe",
  "streams": [
    "ticker:BTC_PERP",
    "price:BTC_PERP",
    "depth:BTC_PERP"
  ]
}
```

Equivalent structured form:

```json
{
  "type": "subscribe",
  "marketId": "BTC_PERP",
  "stream": ["ticker", "price", "depth"]
}
```

Market IDs are trimmed and normalized to uppercase. Acknowledgement:

```json
{
  "type": "subscribed",
  "eventTs": 1782640000000,
  "streams": ["ticker:BTC_PERP", "price:BTC_PERP", "depth:BTC_PERP"]
}
```

## Unsubscribe and ping

Use the same key or structured forms with `type: "unsubscribe"`. To test the connection:

```json
{ "type": "ping" }
```

The server replies with `{ "type": "pong", "eventTs": ... }`. The server does not currently initiate heartbeat pings or disconnect idle clients.

## Data events

### Depth

```json
{
  "type": "depth.update",
  "stream": "depth",
  "marketId": "BTC_PERP",
  "eventTs": 1782640000000,
  "seq": 42,
  "data": {
    "bids": [{ "price": "64999.00", "quantity": "0.25" }],
    "asks": [{ "price": "65001.00", "quantity": "0" }]
  }
}
```

Depth events are deltas from an order mutation. A zero quantity means remove that price level.

### Last price

```json
{
  "type": "price.update",
  "stream": "price",
  "marketId": "BTC_PERP",
  "eventTs": 1782640000000,
  "tradeId": "17",
  "data": {
    "lastPrice": "65000.00",
    "lastQuantity": "0.10"
  }
}
```

### Ticker

```json
{
  "type": "ticker.update",
  "stream": "ticker",
  "marketId": "BTC_PERP",
  "eventTs": 1782640000000,
  "tradeId": "17",
  "data": {
    "lastPrice": "65000.00",
    "priceChange24h": "250.00",
    "priceChangePercent24h": "0.3861",
    "high24h": "65100.00",
    "low24h": "64200.00",
    "volume24h": "12.40",
    "quoteVolume24h": "802000.00"
  }
}
```

## Snapshot-first consumption

1. Fetch `GET /api/v1/market/:marketId/snapshot`.
2. Record `snapshotAt` and `orderbookSeq`.
3. Subscribe to the three WS streams.
4. Ignore events at or before the snapshot timestamp.
5. Apply depth events only when `seq` is newer than the last applied depth sequence.

The shared market-data package contains cursor helpers for this policy.

## Minimal browser client

```ts
const socket = new WebSocket("ws://localhost:8081/ws");

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({
    type: "subscribe",
    streams: ["ticker:BTC_PERP", "depth:BTC_PERP"],
  }));
});

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(String(data));
  console.log(message);
});
```

## Error frames

Malformed JSON, unsupported message types, and empty/invalid stream sets return a control frame with `type: "error"`. They do not currently close the connection.

