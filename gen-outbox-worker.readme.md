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
