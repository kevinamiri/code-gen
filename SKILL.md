---
name: supabase-codegen
description: "Schema-first code generator for Supabase that emits SQL, RLS policies, TypeScript types/SDKs, role-scoped runnable examples, and optional owner-scoped Realtime subscription examples from schema.yaml."
---

## Overview

`gen.ts` reads `schema.yaml` and generates backend scaffolding for each table.

Generated outputs:

- `generated/sql/{table}.sql`
- `generated/policies/{table}.policy.sql` (when `access` is defined)
- `generated/types/{table}-types.ts`
- `generated/sdk/{table}-sdk.ts`
- `generated/anon.example.ts` (only when a table supports `anon`)
- `generated/authenticated.example.ts` (only when a table supports `authenticated`)
- `generated/service_role.example.ts` (only when a table supports `service_role`)
- `generated/subscriber.example.ts` and `generated/invoke_change.example.ts` (only for tables with `features: [realtime_subscription]`)
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
- Realtime SQL includes:
  - add table to `supabase_realtime` publication (idempotent)
  - `ALTER TABLE ... REPLICA IDENTITY FULL`
- Subscriber example uses JWT websocket auth:
  - `await client.realtime.setAuth(accessToken)`

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
3. `generated/queue.sql` (if generated and needed by your setup)

Note: table SQL drops/recreates the table for clean re-runs.

### 4. Run examples

- `bun generated/authenticated.example.ts`
- `bun generated/service_role.example.ts`
- `bun generated/subscriber.example.ts` (if realtime feature enabled)
- `bun generated/invoke_change.example.ts` (if realtime feature enabled)

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
  - publication + replica identity SQL in `sql/{table}.sql`
  - `subscriber.example.ts` + `invoke_change.example.ts`

## Realtime Subscription Contract

For `realtime_subscription` tables:

- Authenticated subscriber listens with `user_id=eq.<auth_user_id>` filter.
- Service-role producer updates rows for that same `user_id`.
- RLS ensures authenticated users can only access their own rows.

Required env vars for examples:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (producer/service_role examples)
- `SUPABASE_DB_SCHEMA` (optional, defaults to config schema)
- `SUPABASE_USER_EMAIL`
- `SUPABASE_USER_PASSWORD`
- `TARGET_TABLE` (optional in realtime examples)
- `<TABLE>_ROW_ID` (required by `invoke_change.example.ts`)

## Constraints and Caveats

- Each table must define a primary key.
- `access` defaults to empty (no policy file generated unless roles are declared).
- Including `anon` in `access` creates open-access policies for anon/auth/service roles in current policy logic.
- Generated files are overwritten on each run.
- Keep `service_role` keys server-side only.

## Maintainer Checklist (when updating this skill)

Before editing this file, verify against current code:

1. `gen.ts` output file list and naming.
2. Feature flags in `analyzeTable` (`queue_trigger`, `realtime_subscription`).
3. SQL composer sections (`genRealtimeSql`, RPC generation, queue trigger generation).
4. Role example generation and realtime example gating.
5. Current SDK method names in a generated SDK file.

If any of these change, update this `SKILL.md` in the same PR.


