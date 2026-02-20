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
- `outputDir`: `./generated`

## Generated SQL Functions

`gen-outbox-worker.ts` generates SQL functions in these groups.

### 1. Subscriber outbox infrastructure (`sql/subscriber_outbox.sql`)

Generated when at least one table has feature `outbox-worker`.

- `${db_schema}.enqueue_subscriber_outbox(p_topic, p_event_type, p_row_pk, p_old_row, p_new_row, p_available_at, p_max_attempts) -> bigint`  
  Inserts a row-change event into `subscriber_outbox`.
- `${db_schema}.claim_subscriber_outbox(p_worker_id, p_limit, p_visibility_timeout_seconds, p_topic) -> SETOF ${db_schema}.subscriber_outbox`  
  Atomically claims ready jobs for a worker.
- `${db_schema}.ack_subscriber_outbox(p_id, p_worker_id) -> void`  
  Marks a claimed outbox job as done.
- `${db_schema}.nack_subscriber_outbox(p_id, p_worker_id, p_backoff_seconds, p_error) -> void`  
  Releases a claimed job back to `ready` (or `failed` when max attempts reached).

### 2. Per-table outbox trigger function (`sql/<table>.sql`)

Generated per table when that table has feature `outbox-worker`.

- `${db_schema}.enqueue_<table>_subscriber_outbox() -> trigger`  
  Trigger function that calls `enqueue_subscriber_outbox` on `INSERT`, `UPDATE`, and `DELETE`.

### 3. Shared queue infrastructure (`queue.sql`)

Generated when at least one table has feature `queue_trigger`.

- `${db_schema}.enqueue_message(p_topic, p_payload, p_available_at) -> bigint`  
  Enqueues a generic queue message.
- `${db_schema}.dequeue_message(p_topic, p_worker_id, visibility_timeout_seconds) -> SETOF ${db_schema}.queue_messages`  
  Claims one ready message for processing.
- `${db_schema}.ack_message(p_id, p_worker_id) -> void`  
  Acknowledges a claimed message as done.
- `${db_schema}.nack_message(p_id, p_worker_id, backoff_seconds, p_error) -> void`  
  Releases a claimed message back for retry.

### 4. Per-table queue trigger function (`sql/<table>.sql`)

Generated per table when that table has feature `queue_trigger`.

- `${db_schema}.enqueue_<table>_job() -> trigger`  
  Trigger function that enqueues work into `queue_messages` on insert/update.

### 5. Per-table vector search RPC (`sql/<table>.sql`)

Generated per table that has a vector column.

- `${db_schema}.search_<table>(query_embedding, match_threshold, match_count, conditions) -> TABLE(...)`  
  Similarity search RPC with optional dynamic filters.

### 6. Per-table JSONB RPCs (`sql/<table>.sql`)

Generated based on JSON/JSONB column pattern resolution.

- `${db_schema}.update_<table>_<jsonb_col>(p_id, p_data) -> jsonb`  
  Merges partial JSONB data into the column.
- `${db_schema}.append_<table>_<jsonb_col>(p_id, p_entry) -> void`  
  Appends one JSONB entry to array-like JSONB columns.
- `${db_schema}.get_<table>_<jsonb_col>_stats(p_metric_key, p_filter) -> TABLE(...)`  
  Computes aggregate stats for numeric metrics stored in JSONB.
