## Overview

`gen-outbox-worker.ts` reads `schema.yaml` and generates Supabase SQL + TypeScript assets for each table, plus optional queue/outbox worker files.

Canonical CLI:

```bash
npx ts-node gen-outbox-worker.ts schema.yaml
```

Or

```bash
bun gen-outbox-worker.ts schema.yaml
```

Defaults:

- `schemaPath`: `schema.yaml`

## Generated Output

Always per table:

- `generated/sql/{table}.sql`
- `generated/types/{table}-types.ts`
- `generated/sdk/{table}-sdk.ts`

Conditional:

- `generated/policies/{table}.policy.sql` when `access` is defined
- `generated/anon.example.ts` when at least one table supports anon (or has empty `access`)
- `generated/authenticated.example.ts` when at least one table includes `authenticated`
- `generated/service_role.example.ts` when at least one table includes `service_role`
- `generated/subscriber.ts` when any table has `features: [realtime_subscription]`
- `generated/sql/subscriber_outbox.sql` when any table has `features: [realtime_subscription]`
- `generated/queue.sql` when any table has `features: [queue_trigger]`

Cleanup behavior:

- Removes legacy `generated/example.ts`
- Removes legacy `generated/subscriber.example.ts`
- Removes legacy `generated/invoke_change.example.ts`
- Removes `generated/subscriber.ts` and `generated/sql/subscriber_outbox.sql` if no table is realtime-enabled

## Schema Shape

```yaml
tables:
  prompts:
    description: "Prompt storage"
    access: [authenticated, service_role] # optional
    features: [realtime_subscription, queue_trigger] # optional
    columns:
      - name: id
        type: uuid
        primary: true
        default: gen_random_uuid()
      - name: user_id
        type: uuid
        nullable: false
      - name: title
        type: text
        nullable: false
    indexes: # optional
      - columns: [title]
        type: btree
config:
  output_dir: ./generated
  embed_dim: 1536
  db_schema: app
```

Column fields supported:

- `name`, `type`
- `primary`, `unique`, `nullable`, `default`
- `patterns`
- `embed_source`, `index`
- `reference` / `references` (string or object)

## Access and Feature Rules

- `access` accepts: `anon`, `authenticated`, `service_role`
- If `access` is empty/omitted: no policy file is generated
- Owner-scoped authenticated policies are generated only when:
  - table has `user_id`
  - `authenticated` is present
  - `anon` is not present
- If `anon` is included, generated policies are open-access for the declared roles

Realtime constraints (`features: [realtime_subscription]`):

- requires a `user_id` column
- requires `access` to include both `authenticated` and `service_role`
- adds table trigger `enqueue_{table}_subscriber_outbox` (`AFTER INSERT OR UPDATE OR DELETE`)
- generates outbox infra functions:
  - `enqueue_subscriber_outbox`
  - `claim_subscriber_outbox`
  - `ack_subscriber_outbox`
  - `nack_subscriber_outbox`

Queue trigger feature (`features: [queue_trigger]`):

- adds per-table enqueue trigger into `queue_messages`
- generates shared queue infra in `queue.sql` (`enqueue_message`, `dequeue_message`, `ack_message`, `nack_message`)

## SDK and Types Behavior

Generated SDK includes:

- CRUD: `insert`, `get`, `update`, `delete`
- GraphQL helpers: `listPageGraphql`, `listAllGraphql`, `paginateGraphqlQuery`
- `log` as deprecated alias of `insert`

Conditional SDK helpers:

- vector search `search(...)` when vector columns exist
- JSONB RPC helpers `update{Col}`, `append{Col}`, `{col}Stats` based on inferred/explicit patterns
- array filters `filterBy{Col}Contains`, `filterBy{Col}Overlaps`

Pattern inference when `patterns` is omitted:

- `vector(...)` -> `similarity_search`
- arrays (`*[]`) -> `array_contains`, `array_overlap`
- JSON columns with names matching `trace|log|history|events` -> `jsonb_append`
- JSON columns with names matching `metrics|scores|stats` -> `jsonb_merge`, `jsonb_stats`
- other JSON columns -> `jsonb_merge`

## Runtime Env Vars

Role example files use:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (or fallback `SUPABASE_KEY`)
- `SUPABASE_DB_SCHEMA` (optional)
- `SUPABASE_USER_EMAIL` / `SUPABASE_USER_PASSWORD` (authenticated example only)
- `SUPABASE_SERVICE_ROLE_KEY` (service role example only)

`subscriber.ts` uses:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_SCHEMA` (optional)
- `TARGET_TABLE` or `TARGET_TOPIC` (optional topic filter)
- `WORKER_ID` (optional)
- `OUTBOX_POLL_INTERVAL_MS` (default `1000`)
- `OUTBOX_CLAIM_BATCH_SIZE` (default `20`)
- `OUTBOX_VISIBILITY_TIMEOUT_SECONDS` (default `120`)
- `OUTBOX_RETRY_BASE_BACKOFF_SECONDS` (default `3`)
- `OUTBOX_RETRY_MAX_BACKOFF_SECONDS` (default `300`)

## SQL Application Order

1. `generated/sql/{table}.sql`
2. `generated/policies/{table}.policy.sql` (if present)
3. `generated/sql/subscriber_outbox.sql` (if present)
4. `generated/queue.sql` (if present)
