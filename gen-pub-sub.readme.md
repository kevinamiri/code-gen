`gen-pub-sub.readme.md` is out of sync with `gen-pub-sub.ts` in a few places (entrypoint name, command examples, and maintainer note references).  
Ask mode is active, so I can’t edit the file directly, but here is a corrected version you can paste into `gen-pub-sub.readme.md`.

```markdown
## Overview

`gen-pub-sub.ts` reads `schema.yaml` and generates Supabase SQL + TypeScript assets per table, including optional role-based examples, queue infrastructure, and realtime subscription examples.

Canonical CLI:

```bash
npx ts-node gen-pub-sub.ts schema.yaml
```

Or

```bash
bun gen-pub-sub.ts schema.yaml
```

Defaults:

- `schemaPath`: `schema.yaml`

---

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
- `generated/subscriber.example.ts` when any table has `features: [realtime_subscription]`
- `generated/invoke_change.example.ts` when any table has `features: [realtime_subscription]`
- `generated/queue.sql` when any table has `features: [queue_trigger]`

Cleanup behavior:

- Removes legacy `generated/example.ts`
- Removes `generated/subscriber.example.ts` and `generated/invoke_change.example.ts` when no table is realtime-enabled

---

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

---

## Access and Feature Rules

Access roles:

- Allowed: `anon`, `authenticated`, `service_role`
- If `access` is empty/omitted: no policy file is generated
- Owner-scoped authenticated policies are generated only when:
  - table has `user_id`
  - `authenticated` is present
  - `anon` is not present
- If `anon` is included, open-access policies are generated for non-owner-scoped roles

Realtime constraints (`features: [realtime_subscription]`):

- requires a `user_id` column
- requires `access` to include both `authenticated` and `service_role`
- adds table to `supabase_realtime` publication (idempotent)
- sets `ALTER TABLE ... REPLICA IDENTITY FULL`
- generates:
  - `subscriber.example.ts` (authenticated owner-scoped listener)
  - `invoke_change.example.ts` (service-role updater for test events)

Queue trigger feature (`features: [queue_trigger]`):

- adds per-table enqueue trigger for inserts and meaningful updates
- generates shared queue infra in `queue.sql`:
  - `enqueue_message`
  - `dequeue_message`
  - `ack_message`
  - `nack_message`

---

## SDK and Types Behavior

Generated SDK includes:

- CRUD: `insert`, `get`, `update`, `delete`
- GraphQL helpers: `listPageGraphql`, `listAllGraphql`, `paginateGraphqlQuery`
- `log` as deprecated alias of `insert`

Conditional SDK helpers:

- vector search: `search(...)` when vector/search pattern exists
- JSONB RPC helpers: `update{Col}`, `append{Col}`, `{col}Stats`
- array filters: `filterBy{Col}Contains`, `filterBy{Col}Overlaps`

Pattern inference when `patterns` is omitted:

- `vector(...)` -> `similarity_search`
- arrays (`*[]`) -> `array_contains`, `array_overlap`
- JSON columns with names matching `trace|log|history|events` -> `jsonb_append`
- JSON columns with names matching `metrics|scores|stats` -> `jsonb_merge`, `jsonb_stats`
- other JSON columns -> `jsonb_merge`

---

## Runtime Env Vars

Role example files (`anon.example.ts`, `authenticated.example.ts`, `service_role.example.ts`) use:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (or fallback `SUPABASE_KEY`)
- `SUPABASE_DB_SCHEMA` (optional)
- `SUPABASE_USER_EMAIL` / `SUPABASE_USER_PASSWORD` (authenticated example)
- `SUPABASE_SERVICE_ROLE_KEY` (service-role example)

`subscriber.example.ts` uses:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (or fallback `SUPABASE_KEY`)
- `SUPABASE_DB_SCHEMA` (optional)
- `SUPABASE_USER_EMAIL`
- `SUPABASE_USER_PASSWORD`
- `TARGET_TABLE` (optional)

`invoke_change.example.ts` uses:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (or fallback `SUPABASE_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_SCHEMA` (optional)
- `SUPABASE_USER_EMAIL`
- `SUPABASE_USER_PASSWORD`
- `TARGET_TABLE` (optional)
- `CHANGE_SEQUENCE` (optional, defaults to `1`)
- `<TABLE>_ROW_ID` (required for the selected target table)

---

## SQL Application Order

1. `generated/sql/{table}.sql`
2. `generated/policies/{table}.policy.sql` (if present)
3. `generated/queue.sql` (if present)

---

## Maintainer Checklist

Before editing this file, verify against current code:

1. `gen-pub-sub.ts` output file list and naming
2. feature flags in `analyzeTable` (`queue_trigger`, `realtime_subscription`)
3. SQL composition (`genRealtimeSql`, RPC generation, queue trigger generation)
4. role example generation and realtime example gating
5. current SDK method names in generated SDK output

If these change, update `gen-pub-sub.readme.md` in the same PR.
```

If you switch to Agent mode, I can apply this directly to the file for you.