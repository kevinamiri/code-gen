
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


Role configuration

## Single role examples

```yaml
# 1) Public read/write (no user identity)
access: [anon]
```
- Use `SUPABASE_ANON_KEY`
- No user JWT
- Policy is open (`USING (true)`)

```yaml
# 2) User-owned data
access: [authenticated]
# requires user_id column for owner-style policy
```
- Use `SUPABASE_ANON_KEY` + authenticated user JWT (`accessToken`)
- Policy is owner-scoped (`auth.uid() = user_id`) when `user_id` exists

```yaml
# 3) Server-only/admin
access: [service_role]
```
- Use `SUPABASE_SERVICE_ROLE_KEY` (backend only)
- Never expose in client apps
- Full privileged access

## Combined role examples

```yaml
# 4) End users + backend jobs
access: [authenticated, service_role]
```
- `authenticated`: user JWT, owner-scoped (if `user_id` exists)
- `service_role`: backend bypass/admin access
- Clear split: frontend uses authenticated flow, backend uses service role flow

```yaml
# 5) Public + logged-in users
access: [anon, authenticated]
```
- In current generator logic, `anon` makes access effectively open for both roles
- Not owner-scoped in this combo (important caveat)
- so this is the same as [anon] alone.

```yaml
# 6) All roles
access: [anon, authenticated, service_role]
```
- Effectively open + admin backend access
- Use only if table is intentionally non-sensitive


## Practical rule for developers

- If data is user-owned/private: use **`[authenticated]`** (or add `service_role` only for backend jobs).
- If you include `anon`, treat table as public-access in current policy generation.
- Keep `service_role` usage strictly server-side.

Goal: please revise the code generator to generate  the example file in more clear way, as if when two or more roles being used in access, the example would create clearity on this that developer would understand how to use each role in the code. And hoe each role will uses the different tokens, this even can be clearer with extra comments in the generated example code.