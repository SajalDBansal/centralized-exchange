---
title: Testing and change checklist
description: Existing test coverage and the cross-service checklist for safely changing contracts.
category: operations
order: 3
type: readme
updated: 2026-06-28
---

# Testing and change checklist

## Existing suites

| Area | Representative coverage |
|---|---|
| Core backend | Server behavior and API integration tests |
| Core engine | System order flows, market data, stream handler, fills, balances, perp behavior |
| WS server | Gateway subscriptions and Redis result parsing |
| WS index poller | Mark-price parsing, mapping, and publishing |

Run an app's tests with its package script, for example:

```bash
bun --filter trading-engine test
bun --filter core-backend test
bun --filter ws-server test
bun --filter ws-index-poller test
```

Run static checks for the docs frontend:

```bash
bun --filter docs-frontend typecheck
bun --filter docs-frontend build
```

## Engine command change

When adding or changing an engine subject:

1. Update `EVENT_TO_ENGINE_SUBJECT`.
2. Update request and response payload maps.
3. Add the dispatch case in `Engine.process`.
4. Verify Redis envelope serialization.
5. Decide whether the command mutates state and needs snapshot/projections.
6. Add backend/poller caller validation.
7. Test acceptance, rejection, timeout, and replay/duplicate behavior.
8. Update the REST, transport, and workflow docs.

## Database change

1. Change the Prisma schema.
2. Create a migration; do not edit an applied migration casually.
3. Regenerate the Prisma client.
4. Update persistence event types and database-engine mappings.
5. Check create/update ordering and foreign keys.
6. Add idempotency tests.
7. Update the database schema page.

## Market-data change

1. Add/update the discriminated event type.
2. Build the event from engine output.
3. Confirm `ws-server` extracts and fans it out.
4. Update browser event guards and cursor ordering.
5. Decide whether the database engine derives a projection from it.
6. Add snapshot + delta integration coverage.
7. Update the WebSocket reference.

## Documentation change

Every Markdown file under `packages/docs` needs frontmatter fields: `title`, `description`, `category`, `order`, `type`, and `updated`. Use an explicit `slug` only when the URL should differ from its relative file path.

Internal links should use `/docs/<category>/<page>`. Mermaid diagrams are rendered client-side; keep node labels simple and run a production docs build to catch integration errors.

