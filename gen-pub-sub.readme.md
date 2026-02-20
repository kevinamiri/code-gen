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

