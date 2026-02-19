---
name: supabase-codegen

/description: "Schema-first code generator for Supabase that emits SQL, RLS policies, TypeScript types/SDKs, role-scoped runnable examples, and optional service-role outbox worker scaffolding from schema.yaml."
---

## Overview

`gen-sub-all.ts` reads `schema.yaml` and generates backend scaffolding for each table.

Generated outputs:

- `generated/sql/{table}.sql`
- `generated/policies/{table}.policy.sql` (when `access` is defined)
- `generated/types/{table}-types.ts`
- `generated/sdk/{table}-sdk.ts`
- `generated/anon.example.ts` (only when a table supports `anon`)
- `generated/authenticated.example.ts` (only when a table supports `authenticated`)
- `generated/service_role.example.ts` (only when a table supports `service_role`)
- `generated/subscriber.ts` (only for tables with `features: [realtime_subscription]`)
- `generated/sql/subscriber_outbox.sql` (only for tables with `features: [realtime_subscription]`)
- `generated/queue.sql` (only when any table uses `features: [queue_trigger]`)

The generator removes legacy `generated/example.ts` automatically.

## Current Ground Truth (validated)

This file reflects the behavior currently implemented in `gen.ts`.

- Entry point is `gen.ts`.
- Canonical command:
  - `npx ts-node gen.ts schema.yaml ./generated`
- Role-aware RLS policy generation is based on `access: [anon|authenticated|service_role]`.
- Owner-scoped policies are generated automatically when:
  - table has `user_id`
  - `authenticated` is included in `access`
  - `anon` is not included
- `realtime_subscription` is an explicit feature flag and requires:
  - `user_id` column
  - `access` includes both `authenticated` and `service_role`
- Realtime feature now generates outbox enqueue triggers in table SQL:
  - `enqueue_{table}_subscriber_outbox()` trigger function
  - `AFTER INSERT OR UPDATE OR DELETE` trigger on each realtime-enabled table
- Outbox SQL includes:
  - `subscriber_outbox` table
  - `enqueue_subscriber_outbox`, `claim_subscriber_outbox`, `ack_subscriber_outbox`, `nack_subscriber_outbox`

## Workflow

### 1. Define tables in `schema.yaml`

Minimal shape:

```yaml
tables:
  prompts:
    description: "Prompt storage"
    access: [authenticated, service_role]
    features: [realtime_subscription]   # optional
    columns:
      - name: id
        type: uuid
        primary: true
        nullable: false
        default: gen_random_uuid()
      - name: user_id
        type: uuid
        nullable: false
      - name: title
        type: text
        nullable: false
      - name: created_at
        type: timestamptz
        nullable: false
        default: now()

config:
  output_dir: ./generated
  embed_dim: 1536
  db_schema: app
```

### 2. Generate files

```bash
npx ts-node gen.ts schema.yaml ./generated
```

### 3. Apply SQL in order

1. `generated/sql/{table}.sql`
2. `generated/policies/{table}.policy.sql` (if generated)
3. `generated/sql/subscriber_outbox.sql` (if realtime feature enabled)
4. `generated/queue.sql` (if generated and needed by your setup)

Note: table SQL drops/recreates the table for clean re-runs.

### 4. Run examples

- `bun generated/authenticated.example.ts`
- `bun generated/service_role.example.ts`
- `bun generated/subscriber.ts` (if realtime feature enabled)

## Schema Reference (practical)

Top-level:

```yaml
tables:
  <table_name>:
    description: string
    access: [anon, authenticated, service_role]   # optional
    features: [queue_trigger, realtime_subscription]   # optional
    columns: [...]
    indexes: [...]
config:
  output_dir: ./generated
  embed_dim: 1536
  db_schema: public
```

Column fields:

- `name` (required)
- `type` (required)
- `primary`, `unique`, `nullable`, `default`
- `patterns` (explicit pattern override)
- `embed_source` (for vector embedding)
- `index` (vector index method)
- `reference` / `references` (FK)

## Pattern and Feature Behavior

Auto-detected patterns when `patterns` is omitted:

- `vector(...)` -> `similarity_search`
- `*[]` -> `array_contains`, `array_overlap`
- `jsonb/json` + column name matching `trace|log|history|events` -> `jsonb_append`
- `jsonb/json` + column name matching `metrics|scores|stats` -> `jsonb_merge`, `jsonb_stats`
- other `jsonb/json` -> `jsonb_merge`

Generated SDK capabilities depend on schema:

- CRUD: `insert`, `get`, `update`, `delete`
- GraphQL pagination: `listPageGraphql`, `listAllGraphql`, `paginateGraphqlQuery`
- Vector search: `search` (if vector pattern exists)
- JSONB RPC helpers: `update{Col}`, `append{Col}`, `{col}Stats`
- Array helpers: `filterBy{Col}Contains`, `filterBy{Col}Overlaps`
- `log` is still emitted as deprecated alias for `insert`

Feature flags:

- `queue_trigger`
  - per-table enqueue trigger
  - shared `queue.sql` infrastructure generation
- `realtime_subscription`
  - outbox enqueue triggers in `sql/{table}.sql`
  - `subscriber.ts` + `sql/subscriber_outbox.sql`

## Realtime Outbox Contract

For `realtime_subscription` tables:

- Table trigger enqueues INSERT/UPDATE/DELETE events into `subscriber_outbox`.
- A service-role worker claims outbox rows and processes them.
- Worker uses `claim`/`ack`/`nack` with retries and backoff for reliability.

Required env vars for examples:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_SCHEMA` (optional, defaults to config schema)
- `TARGET_TABLE` or `TARGET_TOPIC` (optional; filter worker to one table/topic)
- `OUTBOX_POLL_INTERVAL_MS` (optional)
- `OUTBOX_CLAIM_BATCH_SIZE` (optional)
- `OUTBOX_VISIBILITY_TIMEOUT_SECONDS` (optional)
- `OUTBOX_RETRY_BASE_BACKOFF_SECONDS` (optional)
- `OUTBOX_RETRY_MAX_BACKOFF_SECONDS` (optional)

## Constraints and Caveats

- Each table must define a primary key.
- `access` defaults to empty (no policy file generated unless roles are declared).
- Including `anon` in `access` creates open-access policies for anon/auth/service roles in current policy logic.
- Generated files are overwritten on each run.
- Keep `service_role` keys server-side only.

## Maintainer Checklist (when updating this skill)

Before editing this file, verify against current code:

1. `gen-sub-all.ts` output file list and naming.
2. Feature flags in `analyzeTable` (`queue_trigger`, `realtime_subscription`).
3. SQL composer sections (`genSubscriberOutboxTriggerSql`, RPC generation, queue trigger generation).
4. Role example generation and outbox worker/sql gating.
5. Current SDK method names in a generated SDK file.

If any of these change, update this `gen-sub-all-readme.md` in the same PR.
