
Tool Description:
A modular code generator that creates type, sdk, and sql migrations files for Supabas postgres database. It generates methods for vector similarity search, JSONB filtering, and some array operations.

## 🎯 Problem This Solves

When working with Supabase, you often need:
- **Vector similarity search** for embeddings (pgvector)
- **JSONB filtering** for metadata and flexible schemas
- **Array operations** for tags and relationships
- **Type-safe repositories** with consistent patterns
- **SQL functions** for complex queries

Manually writing these for each table is repetitive and error-prone. This tool automates it all. But you still need to write the schema.yaml file.

## ✨ Tool Features

- 📝 **Schema-Driven**: Define your tables once in YAML
- 🔍 **Pattern Detection**: Automatically generates specialized methods based on column types
- 🎯 **Type-Safe**: Full TypeScript support with generated types
- 🚀 **Modular**: Extensible pattern generator system
- 📊 **Multiple Patterns**:
  - Vector similarity search (pgvector)
  - JSONB path filtering
  - Array contains/overlaps
  - Full CRUD operations
  - Custom patterns (extensible)



## 🚀 Usage

```bash
bun gen.ts schema.yaml
```

## 📦 Dependencies

- [Supabase](https://supabase.com/)
- [YAML](https://yaml.org/)
- [Zod](https://zod.dev/)