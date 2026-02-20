# Generate Supabase Pub-Sub SDK

Schema-driven code generator. Reads a YAML schema, analyzes each table, and emits production-ready SQL + TypeScript targeting Supabase with Realtime pub-sub support.

## Quick Start

```bash
bun gen-pub-sub.ts schema.yaml
```

Arguments are positional and optional:
- Arg 1: schema path (default `schema.yaml`)

## Core Workflow

1. **Define tables** in `schema.yaml`.
2. **Run the generator**: `bun gen-pub-sub.ts schema.yaml`


## Use-Case:
For the frontend realtime listener receiving `INSERT/UPDATE` events. The frontend will receive the event and update the UI.



```bash
- {table}.sql              — Table DDL, triggers, functions
- {table}.policy.sql       — RLS policies
- {table}-types.ts         — TypeScript types
- {table}-sdk.ts           — CRUD SDK with typed methods
- authenticated.example.ts — Example for authenticated role
- service_role.example.ts  — Example for service_role
- subscriber.example.ts    — Realtime subscription example

```
