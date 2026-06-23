# Centralized Exchange

A TypeScript monorepo for building a centralized crypto exchange backend. The project is focused on the core exchange infrastructure: user and market APIs, an in-memory trading engine, order matching, balances, positions, transport between services, and future persistence and realtime delivery workers.

The current system is still under active development. The most complete part is the core trading engine, which supports spot and perpetual order processing, orderbook matching, balance locking, perp margin and position updates, and engine snapshots.

## What This Project Does

This repository is intended to become a modular centralized exchange stack.

At a high level it can:

- Accept API requests through an Express backend.
- Authenticate users and protect user/order routes.
- Route market, order, balance, and depth requests toward the trading engine.
- Process typed engine events through NATS request/reply.
- Maintain in-memory markets, assets, balances, orderbooks, orders, and positions.
- Match orders using price-time priority.
- Support spot and perpetual market order flows.
- Lock and unlock balances before and after matching.
- Apply fills to user balances or perp positions.
- Return engine-safe responses back to callers.
- Snapshot engine state to disk after successful mutating operations.
- Define database models for users, sessions, assets, markets, balances, orders, and trades.
- Provide Redis Streams helpers for a backend-to-engine request/response pipeline.

## Languages And Tools Used

- TypeScript: primary language across apps and packages.
- JavaScript/TSX: frontend and React/Next.js application code.
- SQL: Prisma migrations for PostgreSQL schema changes.
- Prisma: database schema and generated database client.
- Bun: package manager and workspace runtime tooling.
- Turbo: monorepo task runner.
- Node.js: server runtime target.
- Express: HTTP API backend.
- Next.js: frontend and docs application shells.
- NATS: active engine request/reply transport.
- Redis Streams: planned/scaffolded stream transport between backend, engine, and workers.
- PostgreSQL: persistent database.
- Docker Compose: local infrastructure for Postgres, Redis, and NATS.
- Zod: shared request validation schemas.
- Jest: backend test setup.
- functional-red-black-tree: orderbook price-level indexing.

## Repository Architecture

```txt
centralized-exchange/
  apps/
    core-backend/          HTTP API server for auth, users, markets, depth, and orders
    core-trading-engine/   In-memory matching, balances, positions, markets, and snapshots
    core-frontend/         Main Next.js frontend shell
    docs-frontend/         Documentation frontend shell
    database-engine/       Placeholder worker for writing engine events to the database
    ws-server/             Placeholder worker for pushing realtime data to clients

  packages/
    database/              Prisma schema, generated client, and database package exports
    redis-stream/          Redis Streams client, publisher, consumer, and group setup
    nats-stream/           NATS singleton manager, request/reply, publish, and subscribe helpers
    types/                 Shared TypeScript exchange, engine, Redis, and NATS types
    validations/           Shared Zod validation schemas
    ui/                    Shared React UI components and styles
    eslint-config/         Shared ESLint config
    typescript-config/     Shared TypeScript config
    jest-presets/          Shared Jest preset

  docker/
    docker-compose.dev.yml   Local Postgres, Redis, and NATS
    docker-compose.prod.yml  Production compose scaffold

  turbo.json
  package.json
  tsconfig.json
  bun.lock
```

## High-Level Architecture

The project is split into service apps and reusable workspace packages.

The API layer receives user-facing HTTP requests. The trading engine owns the critical exchange state and performs the matching and settlement logic. Shared packages keep event types, validation, transports, database code, and UI components consistent across apps.

```mermaid
flowchart TB
    Client["Client / Browser / API Consumer"]
    Frontend["core-frontend<br/>Next.js Exchange UI"]
    Docs["docs-frontend<br/>Docs UI"]
    Backend["core-backend<br/>Express HTTP API"]
    Auth["Auth Middleware<br/>JWT / Cookies"]
    Validation["validations package<br/>Zod Schemas"]
    Types["types package<br/>Shared Event Types"]
    Nats["NATS<br/>Active Request Reply"]
    Redis["Redis Streams<br/>Planned Event Pipeline"]
    Engine["core-trading-engine<br/>In-Memory Matching Engine"]
    Snapshot["Snapshot File<br/>Engine Restore Point"]
    DatabaseWorker["database-engine<br/>Planned Persistence Worker"]
    WsServer["ws-server<br/>Planned Realtime Fanout"]
    Postgres["PostgreSQL<br/>Prisma Database"]
    UI["ui package<br/>Shared Components"]

    Client --> Frontend
    Client --> Backend
    Docs --> UI
    Frontend --> UI
    Frontend --> Backend
    Backend --> Auth
    Backend --> Validation
    Backend --> Types
    Backend --> Nats
    Backend -. planned .-> Redis
    Nats --> Engine
    Redis -. planned .-> Engine
    Engine --> Snapshot
    Engine --> Types
    Engine -. planned events .-> DatabaseWorker
    DatabaseWorker -. writes .-> Postgres
    Engine -. market and user updates .-> WsServer
    WsServer -. realtime pushes .-> Client
```

## Main Services

### Core Backend

Path: `apps/core-backend`

The core backend is an Express API server. It is responsible for request parsing, auth middleware, route organization, validation, and sending exchange actions to the engine.

Current route groups:

- `/health`
- `/auth`
- `/user`
- `/market`
- `/depth`
- `/order`

The backend already has a `BackendResponseRouter` for Redis Streams request/response routing. That router creates a `requestId`, attaches a `backendId`, publishes a market event to Redis, listens to a backend-specific response stream, and resolves the original pending request.

### Core Trading Engine

Path: `apps/core-trading-engine`

The trading engine is the heart of the exchange. It is an in-memory engine that receives typed subjects, validates payloads, mutates state, settles fills, and returns typed responses.

The engine currently supports:

- Spot order processing.
- Perpetual order processing.
- Market and limit orders.
- GTC, IOC, and FOK behavior.
- Post-only checks.
- Self-trade prevention.
- Price-time priority matching.
- Balance locking and unlocking.
- Spot fill settlement.
- Perp margin locking and position updates.
- Market, order, depth, balance, and open-order queries.
- Snapshot save and restore.

The current runtime entry point subscribes to NATS subjects under `engine.>`:

```txt
NATS subject: engine.*
      |
      v
Engine.process(subject, payload)
```

There is also a commented Redis Streams path in the engine entry point. That path is intended to let the engine consume `market:event`, process each event through the same `Engine.process(...)` API, and publish results back to `backend:response:<backendId>`.

### Database Engine

Path: `apps/database-engine`

This is currently a placeholder worker. The intended role is to consume confirmed engine events or result streams and write durable records to PostgreSQL, such as:

- Orders.
- Trades.
- Balance updates.
- Market updates.
- User position snapshots.
- Engine audit logs.

### WebSocket Server

Path: `apps/ws-server`

This is currently a placeholder worker. The intended role is to push realtime exchange data to frontend clients, such as:

- Market depth updates.
- Trade ticks.
- Order status updates.
- User balance updates.
- User position updates.
- Liquidation alerts.

### Frontends

Paths: `apps/core-frontend`, `apps/docs-frontend`

Both are Next.js app shells using the shared `@workspace/ui` package. The core frontend is intended to become the exchange UI. The docs frontend is intended for project or API documentation.

## Trading Engine Internals

The engine owns one shared `EngineState` object. Sub-engines receive that state and operate on it.

```txt
EngineState
  balances    Map<UserId, Map<AssetId, Balance>>
  orderbooks  Map<MarketId, SingleMarketOrderBook>
  positions   Map<MarketId, Map<UserId, UserPosition>>
  markets     Map<MarketId, Market>
  orderMap    Map<OrderId, MarketId>
  orders      Map<OrderId, InMarketOrder>
  assets      Map<AssetId, Asset>
```

Important engine modules:

- `core-engine.ts`: orchestrates every engine request and owns `EngineState`.
- `oms-engine.ts`: validates order, market, user, orderbook, balance, and risk rules.
- `matching-engine.ts`: routes order actions to the correct market orderbook.
- `single-orderbook.ts`: matches orders for one market.
- `balance-engine.ts`: handles balances, locked funds, deposits, and spot settlement.
- `position-engine.ts`: handles perp positions, margin, realized PnL, and flips.
- `market-engine.ts`: initializes and manages markets and assets.
- `parse-incoming.ts`: converts JSON string amounts into `bigint` and normalizes responses back to strings.

## Data Flow

### Current NATS Flow

```mermaid
sequenceDiagram
    participant Caller as API or Service Caller
    participant NATS as NATS Request Reply
    participant EngineApp as core-trading-engine
    participant Core as Engine.process
    participant OMS as OMS Engine
    participant Match as Matching Engine
    participant Settle as Balance or Position Engine

    Caller->>NATS: request(subject, payload)
    NATS->>EngineApp: deliver engine.* subject
    EngineApp->>Core: process(subject, payload)
    Core->>OMS: validate payload and risk
    OMS-->>Core: normalized order or approved request
    Core->>Settle: lock funds or margin
    Core->>Match: match or route order action
    Match-->>Core: order result and fills
    Core->>Settle: apply fills and release unused lock
    Core-->>EngineApp: typed engine response
    EngineApp-->>NATS: respond(response)
    NATS-->>Caller: resolve request
```

### Planned Redis Streams Flow

```mermaid
flowchart LR
    Client["Client"]
    Controller["Core Backend Controller"]
    Router["BackendResponseRouter"]
    MarketStream[("Redis Stream<br/>market:event")]
    TradeGroup{{"Consumer Group<br/>trade-engine-group"}}
    Engine["Core Trading Engine"]
    ResponseStream[("Redis Stream<br/>backend:response:{backendId}")]
    Pending["Pending Request Map<br/>requestId to Promise"]

    Client --> Controller
    Controller --> Router
    Router --> Pending
    Router -- "XADD MarketEvent" --> MarketStream
    MarketStream -- "XREADGROUP" --> TradeGroup
    TradeGroup --> Engine
    Engine -- "Engine.process" --> Engine
    Engine -- "XACK market:event" --> MarketStream
    Engine -- "XADD TradeResultEvent" --> ResponseStream
    ResponseStream -- "XREAD" --> Router
    Router --> Pending
    Router --> Controller
    Controller --> Client
```

### Order Creation Flow

```mermaid
flowchart TD
    Start["Incoming ORDER_CREATE Payload"]
    Normalize["Normalize Incoming Amounts<br/>string -> bigint"]
    OMS["OMS Checks<br/>market, order, TIF, risk, liquidity"]
    Valid{"Accepted?"}
    Lock["Lock Balance or Perp Margin"]
    Match["Matching Engine<br/>route to market orderbook"]
    Book["SingleMarketOrderBook<br/>price-time priority"]
    Fills{"Any fills?"}
    SpotOrPerp{"Market Type"}
    Spot["Balance Engine<br/>settle spot fills"]
    Perp["Position Engine<br/>update perp position"]
    Release["Release Unused Locked Funds"]
    Resting{"Remaining Quantity?"}
    Rest["Keep Resting Order<br/>GTC / partial open"]
    Done["Normalize Response<br/>bigint -> string"]
    Snapshot["Save Snapshot"]
    Reject["Return Reject Response"]

    Start --> Normalize
    Normalize --> OMS
    OMS --> Valid
    Valid -- no --> Reject
    Valid -- yes --> Lock
    Lock --> Match
    Match --> Book
    Book --> Fills
    Fills -- yes --> SpotOrPerp
    SpotOrPerp -- spot --> Spot
    SpotOrPerp -- perp --> Perp
    Spot --> Release
    Perp --> Release
    Fills -- no --> Release
    Release --> Resting
    Resting -- yes --> Rest
    Resting -- no --> Done
    Rest --> Done
    Done --> Snapshot
```

## Core Concepts Used

### Monorepo Workspaces

The repository uses Bun workspaces and Turbo. Apps and packages can import each other with workspace package names like `@workspace/types`, `@workspace/database`, `@workspace/redis-streams`, and `@workspace/nats-streams`.

### Event-Driven Engine Boundary

The trading engine is called through typed event subjects instead of direct HTTP handlers. This keeps exchange logic separated from the API layer and makes it possible to support multiple transports.

Current engine subjects include:

- `engine.order.create`
- `engine.order.cancel`
- `engine.order.openOrders`
- `engine.order.get`
- `engine.ramp.on`
- `engine.balance.get`
- `engine.depth.get`
- `engine.health.check`
- `engine.market.getAll`
- `engine.market.getAll.asset`
- `engine.market.get`
- `engine.market.add`
- `engine.market.update`
- `engine.market.delete`
- `engine.market.asset.add`
- `engine.user.add`

### In-Memory Matching

The engine keeps active exchange state in memory for speed. Each market has its own orderbook. Orders are matched by price-time priority, and the orderbook keeps price levels indexed so best bid/ask lookup is efficient.

### BigInt Accounting

The engine uses `bigint` for balances, prices, quantities, and margin calculations. Incoming JSON payloads use strings for numeric amounts, because JSON cannot safely represent large integers. Responses are normalized back to strings before leaving the engine.

### Balance Locking

Before matching, the engine locks the maximum funds an order may need.

For spot:

- Buy orders lock quote asset value.
- Sell orders lock base asset quantity.

For perps:

- Orders lock initial margin in the market quote asset.

After matching, fills are settled and unused locked balance is released.

### OMS And Risk Checks

The OMS layer performs validation before an order can enter matching. It checks market existence, order shape, time-in-force behavior, market constraints, leverage limits, liquidity, self-trade prevention, post-only behavior, and balance or margin availability.

### Snapshots

After successful mutating events, the engine saves a snapshot to disk. On startup, it attempts to restore from the snapshot. If no snapshot exists, it initializes default markets.

### Database Persistence

The Prisma schema defines durable records for users, sessions, assets, markets, balances, orders, and trades. The persistence worker still needs to be connected to the engine event/result pipeline.

## Local Development

Install dependencies:

```bash
bun install
```

Start local infrastructure:

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

Run all dev tasks through Turbo:

```bash
bun run dev
```

Run common workspace checks:

```bash
bun run build
bun run typecheck
bun run lint
```

Useful local services from `docker/docker-compose.dev.yml`:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- NATS: `localhost:4222`

## Environment Variables

The exact `.env` files still need to be standardized. Based on the current code, important variables include:

- `NATS_URL`: NATS server URL used by `@workspace/nats-streams`.
- `REDIS_HOST`: Redis host used by `@workspace/redis-streams`.
- `REDIS_PORT`: Redis port used by `@workspace/redis-streams`.
- `ENGINE_SNAPSHOT_PATH`: optional path for the trading engine snapshot file.
- Database connection variables for Prisma/PostgreSQL.
- Auth token secrets for the core backend.

## Current Status

Working or mostly implemented:

- Monorepo workspace structure.
- Shared TypeScript types.
- Shared validation package.
- Express backend skeleton and route modules.
- NATS transport helper.
- Redis Streams helper package.
- Core trading engine.
- Matching engine and orderbook logic.
- Balance and position engines.
- Market and asset engine state.
- Engine snapshots.
- Prisma database schema.
- Local Docker Compose infrastructure.

In progress or placeholder:

- Database engine worker.
- Test cases creation and debugg
- WebSocket server.
- Durable database writes from engine output.
- Frontend exchange screens.
- Docs frontend content.
- Redis Streams engine runtime path.
- Production deployment setup.

## What To Build Next

- Connect backend controllers fully to the active engine transport.
- Decide the primary transport path: NATS request/reply, Redis Streams, or both with clear responsibilities.
- Enable and test the Redis Streams engine consumer path.
- Build the database poller / database engine worker to persist orders, trades, balances, markets, and positions.
- Build the WebSocket server for realtime market and user updates.
- Add a liquidation engine for perpetual markets.
- Add mark price, index price, funding rate, and funding payment logic.
- Add risk engine checks for maintenance margin and liquidation price updates.
- Add trade history and candle/OHLCV aggregation.
- Add admin market-management APIs.
- Add idempotency keys for mutating requests.
- Add replay support from event logs into engine state.
- Add integration tests for order matching, settlement, snapshots, and transport routing.
- Add load tests for orderbook and engine throughput.
- Add observability: structured logs, metrics, tracing, and health checks.
- Add Dockerfiles and compose profiles for running the full exchange stack locally.
- Build the core frontend trading screen: markets, orderbook, chart area, order form, open orders, balances, and positions.

## Diagrams

These diagrams describe the intended system shape. Some pieces, like the database engine, WebSocket server, and Redis Streams runtime path, are scaffolded or planned rather than fully active.

### System Architecture

```mermaid



```

### Order Matching Flow

```mermaid
flowchart LR
    Order["New Order"]
    Side{"Side"}
    BidBook["Bid Book<br/>buy orders"]
    AskBook["Ask Book<br/>sell orders"]
    BestAsk["Best Ask"]
    BestBid["Best Bid"]
    CrossBuy{"Buy price >= best ask?"}
    CrossSell{"Sell price <= best bid?"}
    Match["Execute Fill<br/>maker + taker"]
    Update["Update filled and remaining qty"]
    More{"Can keep matching?"}
    Rest{"Should rest on book?"}
    AddBid["Add to Bid Price Level"]
    AddAsk["Add to Ask Price Level"]
    Complete["Return order, fills, depth changes"]

    Order --> Side
    Side -- buy --> AskBook
    AskBook --> BestAsk
    BestAsk --> CrossBuy
    CrossBuy -- yes --> Match
    CrossBuy -- no --> Rest
    Side -- sell --> BidBook
    BidBook --> BestBid
    BestBid --> CrossSell
    CrossSell -- yes --> Match
    CrossSell -- no --> Rest
    Match --> Update
    Update --> More
    More -- yes --> Side
    More -- no --> Rest
    Rest -- buy order remains --> AddBid
    Rest -- sell order remains --> AddAsk
    Rest -- no remaining qty or IOC/FOK --> Complete
    AddBid --> Complete
    AddAsk --> Complete
```

### Persistence Flow

```mermaid
flowchart TD
    Engine["Core Trading Engine"]
    Result["Engine Result<br/>orders, fills, balances, positions"]
    EventLog[("Event Stream<br/>Redis or NATS JetStream later")]
    DbWorker["Database Engine / DB Poller"]
    Mapper["Map Engine Events<br/>to Prisma Models"]
    Postgres[("PostgreSQL")]
    Orders["Order Table"]
    Trades["Trade Table"]
    Balances["UserAssetBalance Table"]
    Markets["Market / Asset Tables"]
    Positions["Future Position Tables"]
    Audit["Future Audit / Replay Log"]

    Engine --> Result
    Result -. planned publish .-> EventLog
    EventLog -. consume .-> DbWorker
    DbWorker --> Mapper
    Mapper --> Postgres
    Postgres --> Orders
    Postgres --> Trades
    Postgres --> Balances
    Postgres --> Markets
    Postgres -. next .-> Positions
    Postgres -. next .-> Audit
```

### WebSocket Realtime Flow

```mermaid
sequenceDiagram
    participant Engine as Core Trading Engine
    participant Stream as Event Stream
    participant WS as ws-server
    participant Client as Frontend Client

    Client->>WS: connect and subscribe to markets/user channels
    Engine->>Stream: publish depth, trade, order, balance, position events
    WS->>Stream: consume realtime events
    WS->>WS: filter by marketId, userId, or channel
    WS-->>Client: push market depth updates
    WS-->>Client: push trade ticks
    WS-->>Client: push private order and balance updates
```

### Database Model

```mermaid
erDiagram
    USER ||--o{ SESSION : has
    USER ||--o{ USER_ASSET_BALANCE : owns
    USER ||--o{ USER_ORDER : places
    ASSET ||--o{ USER_ASSET_BALANCE : tracks
    ASSET ||--o{ MARKET : base_asset
    ASSET ||--o{ MARKET : quote_asset
    MARKET ||--o{ USER_ORDER : contains
    MARKET ||--o{ TRADE : records
    USER_ORDER ||--o{ TRADE : maker_order
    USER_ORDER ||--o{ TRADE : taker_order

    USER {
        string id PK
        string username
        string email
        boolean isVerified
        boolean isArchived
        datetime createdAt
    }

    SESSION {
        string id PK
        string userId FK
        string refreshTokenHash
        boolean revoke
        datetime createdAt
    }

    ASSET {
        string id PK
        string name
        string symbol
        int decimalPrecision
    }

    MARKET {
        string id PK
        string name
        string baseAssetId FK
        string quoteAssetId FK
        boolean active
    }

    USER_ASSET_BALANCE {
        string id PK
        string userId FK
        string assetId FK
        decimal available
        decimal locked
    }

    USER_ORDER {
        string id PK
        bigint sequence
        string userId FK
        string marketId FK
        string type
        string side
        string status
        decimal price
        decimal quantity
        decimal tradedQuantity
        decimal remainingQuantity
    }

    TRADE {
        string id PK
        string marketId FK
        decimal price
        decimal quantity
        string makerOrderId FK
        string takerOrderId FK
        string makerUserId
        string takerUserId
    }
```
