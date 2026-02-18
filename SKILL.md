
---
name: supabase-codegen
description: "Schema-driven Supabase code generator that produces TypeScript SDKs, type definitions, and SQL migrations from a schema.yaml file. Use when: (1) adding or modifying tables in schema.yaml, (2) running gen.ts to regenerate output files, (3) integrating the generated SDK into application code, (4) understanding what SQL objects (RPCs, indexes, triggers) are created, (5) configuring vector search, JSONB merge/append, array filters, or queue triggers for a table."
---

## Overview

`gen.ts` reads `schema.yaml` and emits four artifacts per table: a SQL migration, TypeScript types, a typed SDK class, and a usage example. The SDK wraps Supabase REST + GraphQL + RPC calls behind a clean interface. No manual boilerplate — change the schema, re-run the generator.

## Resources

- **`references/schema-syntax.md`** — Full `schema.yaml` reference: column properties, pattern names, auto-detection rules, FK syntax, queue trigger setup. Read this when writing or modifying a schema.
- **`references/sdk-api.md`** — Every generated SDK method with signatures and usage. Read this when integrating the SDK into application code.
- **`scripts/run-gen.sh`** — Wrapper to invoke the generator. Run this instead of invoking `ts-node` manually.
- **`assets/schema-template.yaml`** — Starter schema with annotated examples. Copy and modify for new projects.

## Workflow

### 1. Write or modify `schema.yaml`

Start from `assets/schema-template.yaml` or edit an existing schema. Read `references/schema-syntax.md` for the full column/pattern reference.

Minimal table:
```yaml:assets/schema-template.yaml
tables:
  users:
    description: "Application users"
    columns:
      - name: id
        type: uuid
        primary: true
        nullable: false
        default: gen_random_uuid()
      - name: email
        type: text
        nullable: false
      - name: created_at
        type: timestamptz
        nullable: false
        default: now()

config:
  output_dir: ./generated
  embed_dim: 1536
```

### 2. Run the generator

```bash
bash scripts/run-gen.sh                          # uses schema.yaml + ./generated defaults
bash scripts/run-gen.sh my-schema.yaml ./out     # custom paths
```

Or directly:
```bash
npx ts-node gen.ts schema.yaml ./generated
```

Output per table:
```
generated/
├── sql/{table}.sql          # DDL + indexes + RPCs
├── types/{table}-types.ts   # TypeScript interfaces
├── sdk/{table}-sdk.ts       # Typed SDK class
├── example.ts               # Runnable usage example
└── queue.sql                # Shared queue infra (only if queue_trigger used)
```

### 3. Apply the SQL migration

Run `generated/sql/{table}.sql` against your Supabase project. The file includes DROP statements for clean re-runs — safe to re-apply after regeneration.

For vector search, the SQL enables the `extensions.vector` extension and creates an HNSW index automatically.

### 4. Use the SDK

```typescript
import { UserSdk } from './generated/sdk/users-sdk'

const sdk = new UserSdk({ url: SUPABASE_URL, key: SUPABASE_KEY })

const row = await sdk.log({ email: 'user@example.com' })
const found = await sdk.get(row.id)
await sdk.update(row.id, { email: 'new@example.com' })
await sdk.delete(row.id)
```

For tables with vector columns, pass an `embedder`:
```typescript
const sdk = new PromptSdk({ url, key, embedder: { dim: 1536, embed: myEmbedFn } })
const results = await sdk.search({ query: 'find similar', topK: 5, threshold: 0.2 })
```

Read `references/sdk-api.md` for all method signatures.

## Constraints

- **Primary key required.** Every table must have exactly one column with `primary: true`.
- **Vector columns need `embed_source`.** Without it, the embedding field is not auto-populated on insert/update.
- **RPC naming is fixed.** SQL functions follow `search_{table}`, `update_{table}_{col}`, `append_{table}_{col}`, `get_{table}_{col}_stats`. Do not rename them in Supabase without regenerating.
- **Re-run after every schema change.** Generated files are not hand-edited — they are overwritten on each run.
- **Queue infrastructure is shared.** `queue.sql` is generated once for all tables with `queue_trigger`. Apply it before the per-table SQL.
- **GraphQL requires Supabase GraphQL enabled.** The `listPageGraphql` and `listAllGraphql` methods use the `/graphql/v1` endpoint.
```

```yaml:supabase-codegen/agents/openai.yaml
display_name: Supabase Code Generator
short_description: Generate TypeScript SDKs, types, and SQL migrations from a schema.yaml file for Supabase.
default_prompt: "Add a new `documents` table to my schema.yaml with full-text vector search on the `content` column, a `metadata` JSONB field, and a `tags` text array. Then run the generator and show me how to use the SDK to insert and search documents."
```

```markdown:supabase-codegen/references/schema-syntax.md
# schema.yaml Reference

## Table of Contents
1. [Top-level structure](#top-level-structure)
2. [Column properties](#column-properties)
3. [Postgres types](#postgres-types)
4. [Patterns](#patterns)
5. [Auto-detection rules](#auto-detection-rules)
6. [Indexes](#indexes)
7. [Foreign keys](#foreign-keys)
8. [Features](#features)
9. [Config block](#config-block)
10. [Auto-generated columns](#auto-generated-columns)
11. [Full example](#full-example)

---

## Top-level structure

```yaml
tables:
  {table_name}:
    description: "optional human description"
    columns: [...]
    indexes: [...]      # optional explicit indexes
    features: [...]     # optional feature flags

config:
  output_dir: ./generated   # default: ./generated
  embed_dim: 1536           # default: 1536
```

---

## Column properties

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | Column name (snake_case) |
| `type` | string | ✅ | Postgres type (see below) |
| `primary` | boolean | one per table | Marks the primary key |
| `unique` | boolean | — | Adds UNIQUE constraint |
| `nullable` | boolean | — | `false` adds NOT NULL |
| `default` | string/value | — | SQL default expression |
| `patterns` | string[] | — | Explicit pattern list (overrides auto-detect) |
| `embed_source` | string | — | Source column name to auto-embed into this vector column |
| `index` | string | — | Index method for vector columns (`hnsw` default) |
| `reference` / `references` | string or object | — | Foreign key target |

---

## Postgres types

| Type | TypeScript | Notes |
|---|---|---|
| `uuid` | `string` | Use `gen_random_uuid()` as default |
| `text`, `varchar` | `string` | |
| `int`, `integer`, `bigint`, `smallint` | `number` | |
| `float`, `float4`, `float8`, `numeric` | `number` | |
| `boolean`, `bool` | `boolean` | |
| `jsonb`, `json` | `Record<string, any>` | |
| `timestamptz`, `timestamp` | `string` | Use `now()` as default |
| `text[]`, `uuid[]`, etc. | `string[]`, `string[]` | Any type with `[]` suffix |
| `vector(N)` | `number[]` | Requires pgvector extension |

---

## Patterns

Patterns control which SDK methods and SQL RPCs are generated for a column.

| Pattern | Applies to | Generates |
|---|---|---|
| `similarity_search` | `vector(N)` | `search_{table}` RPC + `sdk.search()` |
| `jsonb_merge` | `jsonb` | `update_{table}_{col}` RPC + `sdk.update{Col}()` |
| `jsonb_append` | `jsonb` | `append_{table}_{col}` RPC + `sdk.append{Col}()` |
| `jsonb_stats` | `jsonb` | `get_{table}_{col}_stats` RPC + `sdk.{col}Stats()` |
| `array_contains` | `text[]` etc. | `sdk.filterBy{Col}Contains()` |
| `array_overlap` | `text[]` etc. | `sdk.filterBy{Col}Overlaps()` |

Multiple patterns can be combined on one column:
```yaml
- name: metrics
  type: jsonb
  patterns:
    - jsonb_merge
    - jsonb_stats
```

---

## Auto-detection rules

When `patterns` is omitted, the generator infers patterns from type and column name:

| Condition | Auto-assigned patterns |
|---|---|
| type starts with `vector` | `similarity_search` |
| type ends with `[]` | `array_contains`, `array_overlap` |
| type is `jsonb`/`json` AND name matches `/trace\|log\|history\|events/i` | `jsonb_append` |
| type is `jsonb`/`json` AND name matches `/metrics\|scores\|stats/i` | `jsonb_merge`, `jsonb_stats` |
| type is `jsonb`/`json` (all other names) | `jsonb_merge` |

To suppress auto-detection, set `patterns: []` explicitly.

---

## Indexes

Indexes are auto-created for vector, jsonb, and array columns. Override or add explicit indexes:

```yaml
indexes:
  - columns: [user_id]
    type: btree
  - columns: [embedding]
    type: hnsw
    ops: vector_cosine_ops
```

Auto-created indexes (skipped if column already in an explicit index):
- Vector columns → `USING hnsw ({col} extensions.vector_cosine_ops)`
- JSONB columns → `USING gin ({col})`
- Array columns → `USING gin ({col})`

---

## Foreign keys

Three formats accepted for `reference` / `references`:

```yaml
# Short: infers column = id, schema = public
- name: user_id
  type: uuid
  references: users

# With explicit column
- name: org_id
  type: uuid
  references: organizations(id)

# Full object with cascade actions
- name: parent_id
  type: uuid
  references:
    table: categories
    column: id
    on_delete: CASCADE
    on_update: NO ACTION
```

Valid `on_delete`/`on_update` values: `CASCADE`, `RESTRICT`, `NO ACTION`, `SET NULL`, `SET DEFAULT`.

**Auto-inference:** columns named `{x}_id` where `x` matches a known table name get a FK automatically — no explicit `references` needed.

---

## Features

```yaml
tables:
  jobs:
    features:
      - queue_trigger
    columns: [...]
```

`queue_trigger` — generates an AFTER INSERT OR UPDATE trigger that enqueues a message to `public.queue_messages` whenever a row is inserted or a content column changes. Also generates `queue.sql` with shared queue infrastructure (enqueue, dequeue, ack, nack functions).

---

## Config block

```yaml
config:
  output_dir: ./generated   # where to write all generated files
  embed_dim: 1536           # embedding dimension (used in stub embedder in example.ts)
```

---

## Auto-generated columns

These columns are excluded from the `{Table}Insert` interface (not required on insert):

- Primary key columns with a `default` value
- Vector columns (populated automatically from `embed_source`)
- Timestamp columns with a `default` value

They appear in `{Table}Row` (returned from the database).

---

## Full example

```yaml
tables:
  documents:
    description: "Document storage with semantic search"
    columns:
      - name: id
        type: uuid
        primary: true
        nullable: false
        default: gen_random_uuid()

      - name: user_id
        type: uuid
        nullable: false
        references: users          # auto-infers users(id) FK

      - name: title
        type: text
        nullable: false

      - name: content
        type: text
        nullable: false

      - name: embedding
        type: vector(1536)
        nullable: true
        embed_source: content      # auto-embeds `content` on insert/update

      - name: metadata
        type: jsonb
        nullable: true
        default: '{}'
        # auto-detected as jsonb_merge

      - name: event_log
        type: jsonb
        nullable: true
        default: '[]'
        patterns:
          - jsonb_append           # explicit: append-only log

      - name: tags
        type: text[]
        nullable: true
        # auto-detected as array_contains + array_overlap

      - name: created_at
        type: timestamptz
        nullable: false
        default: now()

      - name: updated_at
        type: timestamptz
        nullable: false
        default: now()

    indexes:
      - columns: [user_id]
        type: btree

  jobs:
    description: "Background job queue"
    features:
      - queue_trigger
    columns:
      - name: id
        type: uuid
        primary: true
        nullable: false
        default: gen_random_uuid()
      - name: payload
        type: jsonb
        nullable: false
      - name: status
        type: text
        nullable: false
        default: "'pending'"
      - name: created_at
        type: timestamptz
        nullable: false
        default: now()

config:
  output_dir: ./generated
  embed_dim: 1536
```
```

```markdown:supabase-codegen/references/sdk-api.md
# Generated SDK API Reference

## Table of Contents
1. [Constructor](#constructor)
2. [CRUD methods](#crud-methods)
3. [GraphQL pagination](#graphql-pagination)
4. [Vector search](#vector-search)
5. [JSONB methods](#jsonb-methods)
6. [Array filter methods](#array-filter-methods)
7. [Types reference](#types-reference)

---

## Constructor

```typescript
new {Pascal}Sdk(opts: {Pascal}Options)
```

```typescript
interface {Pascal}Options {
  url: string;          // Supabase project URL
  key: string;          // Supabase anon or service key
  graphqlUrl?: string;  // defaults to {url}/graphql/v1
  embedder?: Embedder;  // required only if table has vector columns
}

type Embedder = {
  dim: number;
  embed: (text: string) => Promise<number[]>;
}
```

**Example — table without vectors:**
```typescript
const sdk = new UserSdk({ url: SUPABASE_URL, key: SUPABASE_KEY })
```

**Example — table with vectors:**
```typescript
const sdk = new DocumentSdk({
  url: SUPABASE_URL,
  key: SUPABASE_KEY,
  embedder: {
    dim: 1536,
    async embed(text) {
      const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text, dimensions: 1536 })
      return res.data[0].embedding
    }
  }
})
```

---

## CRUD methods

### `log(data: Insert): Promise<Row>`
Insert a new row. Auto-embeds the `embed_source` column if the table has a vector column.

```typescript
const row = await sdk.log({ user_id: 'uuid', title: 'Hello', content: 'World' })
console.log(row.id) // uuid assigned by database
```

### `get(id): Promise<Row | null>`
Fetch a single row by primary key. Returns `null` if not found (does not throw).

```typescript
const row = await sdk.get('some-uuid')
if (row) console.log(row.title)
```

### `update(id, data: Partial<Insert>): Promise<Row>`
Update fields on a row. Re-embeds the vector column if the `embed_source` field is included in `data`.

```typescript
const updated = await sdk.update('some-uuid', { title: 'New title' })
```

### `delete(id): Promise<void>`
Delete a row by primary key. Throws on error.

```typescript
await sdk.delete('some-uuid')
```

---

## GraphQL pagination

All three methods use the Supabase GraphQL endpoint (`/graphql/v1`).

### `listPageGraphql(args?): Promise<GraphqlConnection<Row>>`
Fetch one cursor-based page.

```typescript
interface GraphqlPageArgs {
  first?: number;          // page size, default 50
  after?: string | null;   // cursor from previous page's endCursor
  maxPages?: number;       // unused here, for listAllGraphql
}

const page = await sdk.listPageGraphql({ first: 20 })
for (const edge of page.edges) {
  console.log(edge.node.id, edge.cursor)
}
const { hasNextPage, endCursor } = page.pageInfo
```

### `listAllGraphql(args?): Promise<Row[]>`
Auto-paginate and return all rows as a flat array.

```typescript
const all = await sdk.listAllGraphql({ first: 100, maxPages: 10 })
```

### `paginateGraphqlQuery<TNode>(opts): Promise<TNode[]>`
Run any custom GraphQL connection query with auto-pagination. Query must accept `$first: Int` and `$after: Cursor` variables.

```typescript
const query = `query MyQuery($first: Int = 50, $after: Cursor) {
  documentsCollection(first: $first, after: $after) {
    edges { node { id title } cursor }
    pageInfo { hasNextPage endCursor }
  }
}`

const rows = await sdk.paginateGraphqlQuery({
  query,
  connectionPath: 'documentsCollection',
  first: 50,
  maxPages: 5,
  variables: {}   // extra variables beyond first/after
})
```

---

## Vector search

Generated when a table has a `vector(N)` column. Calls the `search_{table}` SQL RPC.

### `search(args: SearchArgs): Promise<Row[]>`

```typescript
interface SearchArgs {
  query?: string;      // text to embed; omit for filter-only search
  threshold?: number;  // minimum similarity score, default 0.1
  topK?: number;       // max results, default 10
  conditions?: Condition[];
}

type ComparisonOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in' | 'contains' | 'exists' | 'ilike'

interface Condition {
  field: string;
  op: ComparisonOp;
  value: any;
}
```

**Example — semantic search with filter:**
```typescript
const results = await sdk.search({
  query: 'machine learning concepts',
  threshold: 0.3,
  topK: 10,
  conditions: [
    { field: 'user_id', op: 'eq', value: 'some-uuid' },
    { field: 'status', op: 'eq', value: 'published' }
  ]
})
// Each result includes a `similarity` float field
results.forEach(r => console.log(r.title, r.similarity))
```

**Example — filter-only (no embedding):**
```typescript
const results = await sdk.search({
  conditions: [{ field: 'tags', op: 'contains', value: '["typescript"]' }]
})
```

---

## JSONB methods

Generated per JSONB column based on its pattern.

### `update{Col}(id, data): Promise<Record<string, any>>` — `jsonb_merge`
Non-destructive merge: `existing || data`. Returns the merged object.

```typescript
// Merges { theme: 'dark' } into the existing metadata object
const merged = await sdk.updateMetadata('some-uuid', { theme: 'dark' })
```

### `append{Col}(id, entry): Promise<void>` — `jsonb_append`
Appends one entry to a JSONB array column.

```typescript
await sdk.appendEventLog('some-uuid', { event: 'login', at: new Date().toISOString() })
```

### `{col}Stats(metricKey, filter?): Promise<Stats | null>` — `jsonb_stats`
Aggregate numeric stats for a key inside a JSONB column.

```typescript
interface Stats {
  metric_key: string; count: number; avg_value: number;
  min_value: number; max_value: number; stddev_value: number;
}

const stats = await sdk.metricsStats('response_time', { user_id: 'some-uuid' })
if (stats) console.log(stats.avg_value)
```

---

## Array filter methods

Generated per array column (`text[]`, `uuid[]`, etc.).

### `filterBy{Col}Overlaps(values): Promise<Row[]>` — `array_overlap`
Rows where the column contains **any** of the given values.

```typescript
const rows = await sdk.filterByTagsOverlaps(['typescript', 'react'])
```

### `filterBy{Col}Contains(values): Promise<Row[]>` — `array_contains`
Rows where the column contains **all** of the given values.

```typescript
const rows = await sdk.filterByTagsContains(['typescript', 'react'])
```

---

## Types reference

```typescript
// Shared across all generated SDKs
interface GraphqlEdge<TNode>       { node: TNode; cursor: string }
interface GraphqlPageInfo          { hasNextPage: boolean; endCursor: string | null }
interface GraphqlConnection<TNode> { edges: GraphqlEdge<TNode>[]; pageInfo: GraphqlPageInfo }
interface GraphqlPageArgs          { first?: number; after?: string | null; maxPages?: number }
interface GraphqlPaginateOptions<TVars> extends GraphqlPageArgs {
  query: string; connectionPath: string; variables?: TVars
}
```

**Naming convention:** `{Table}` is the PascalCase singular of the table name.
- `prompts` → `Prompt` → `PromptSdk`, `PromptInsert`, `PromptRow`, `PromptSearchArgs`
- `documents` → `Document` → `DocumentSdk`, `DocumentInsert`, `DocumentRow`
- `queue_messages` → `QueueMessage` → `QueueMessageSdk`
---

---


```yaml

# Supabase Code Generator — Schema Template
# Run: npx ts-node gen.ts schema.yaml ./generated

tables:
  # ── Example: table with vector search, JSONB, and array tags ──
  items:
    description: "Replace with your table description"
    columns:
      # Primary key — always include
      - name: id
        type: uuid
        primary: true
        nullable: false
        default: gen_random_uuid()

      # Ownership columns
      - name: user_id
        type: uuid
        nullable: false
        # references: users   # uncomment to add FK

      # Text content
      - name: title
        type: text
        nullable: false

      - name: body
        type: text
        nullable: false

      # Vector embedding — auto-populated from `body` on insert/update
      # Remove this block if you don't need semantic search
      - name: embedding
        type: vector(1536)
        nullable: true
        embed_source: body

      # JSONB — auto-detected as jsonb_merge (generates updateMetadata SDK method)
      - name: metadata
        type: jsonb
        nullable: true
        default: '{}'

      # Array — auto-detected as array_contains + array_overlap
      - name: tags
        type: text[]
        nullable: true

      # Timestamps — auto-excluded from Insert type
      - name: created_at
        type: timestamptz
        nullable: false
        default: now()

      - name: updated_at
        type: timestamptz
        nullable: false
        default: now()

    # Optional: explicit indexes beyond auto-created ones
    # indexes:
    #   - columns: [user_id]
    #     type: btree

    # Optional: enable background queue trigger
    # features:
    #   - queue_trigger

config:
  output_dir: ./generated
  embed_dim: 1536

```


