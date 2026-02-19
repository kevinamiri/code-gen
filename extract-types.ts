import { readFile, writeFile } from "node:fs/promises";

type OpenApiDoc = {
  paths?: Record<string, unknown>;
  components?: Record<string, Record<string, unknown>>;
};

type RefTarget = { section: string; name: string };

const parseCsv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const readOpenApi = async (): Promise<OpenApiDoc> => {
  const schemaArg = process.argv[2];
  const endpoint =
    process.env.SUPABASE_OPENAPI_URL ??
    (process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/` : "");
  if (!endpoint) {
    const input = process.env.OPENAPI_INPUT ?? "postgrest.openapi.json";
    return JSON.parse(await readFile(input, "utf8")) as OpenApiDoc;
  }

  const apiKey = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) for SUPABASE_OPENAPI_URL fetch."
    );
  }

  const headers: Record<string, string> = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/openapi+json",
  };
  if (schemaArg) {
    headers["Accept-Profile"] = schemaArg;
    headers["Content-Profile"] = schemaArg;
  }

  const res = await fetch(endpoint, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAPI fetch failed: ${res.status} ${res.statusText} :: ${body}`);
  }

  return (await res.json()) as OpenApiDoc;
};

const addRef = (
  ref: unknown,
  used: Map<string, Set<string>>,
  queue: RefTarget[]
): void => {
  if (typeof ref !== "string") return;
  const match = /^#\/components\/([^/]+)\/([^/]+)$/.exec(ref);
  if (!match) return;
  const [, section, name] = match;
  if (!used.has(section)) used.set(section, new Set<string>());
  const sectionSet = used.get(section)!;
  if (sectionSet.has(name)) return;
  sectionSet.add(name);
  queue.push({ section, name });
};

const walkRefs = (
  node: unknown,
  used: Map<string, Set<string>>,
  queue: RefTarget[]
): void => {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkRefs(item, used, queue);
    return;
  }
  const maybeRef = (node as { $ref?: unknown }).$ref;
  addRef(maybeRef, used, queue);
  for (const value of Object.values(node as Record<string, unknown>)) {
    walkRefs(value, used, queue);
  }
};

const main = async () => {
  const schemaArg = process.argv[2];
  const targetArg = process.argv[3];

  const output = process.env.OPENAPI_OUTPUT ?? "postgrest.openapi.pruned.json";
  const tables = targetArg ? [targetArg] : parseCsv(process.env.TABLES);
  const functions = targetArg ? [targetArg] : parseCsv(process.env.FUNCTIONS);

  if (!schemaArg || !targetArg) {
    throw new Error("Usage: bun supa.ts [schema_name] [table_name_or_function_name]");
  }

  const doc = await readOpenApi();
  const keepPaths = new Set<string>([
    ...tables.map((name) => `/${name}`),
    ...functions.map((name) => `/rpc/${name}`),
  ]);

  const currentPaths = doc.paths ?? {};
  doc.paths = Object.fromEntries(
    Object.entries(currentPaths).filter(([path]) => keepPaths.has(path))
  );

  const used = new Map<string, Set<string>>();
  const queue: RefTarget[] = [];
  walkRefs(doc.paths, used, queue);

  while (queue.length > 0) {
    const item = queue.pop()!;
    const target = doc.components?.[item.section]?.[item.name];
    if (target) walkRefs(target, used, queue);
  }

  const components: Record<string, Record<string, unknown>> = {};
  for (const [section, names] of used.entries()) {
    const sourceSection = doc.components?.[section];
    if (!sourceSection) continue;
    components[section] = {};
    for (const name of names.values()) {
      const value = sourceSection[name];
      if (value !== undefined) components[section][name] = value;
    }
  }
  doc.components = components;

  await writeFile(output, JSON.stringify(doc, null, 2));
  console.log(`Wrote ${output}`);
  console.log(`Schema: ${schemaArg}`);
  console.log(`Target: ${targetArg}`);
  console.log(`Kept paths: ${Object.keys(doc.paths).length}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
