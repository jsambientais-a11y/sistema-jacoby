import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const require = createRequire(import.meta.url);
let code = ts.transpileModule(
  readFileSync("src/lib/iso-local-state.ts", "utf8") + "\nexport {schema as dbSchema};",
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
code = code.replace('"zod"', JSON.stringify(pathToFileURL(require.resolve("zod")).href));
const { dbSchema } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
function convert(z) {
  const d = z._def;
  switch (d.typeName) {
    case "ZodOptional":
    case "ZodDefault":
      return convert(d.innerType);
    case "ZodNullable":
      return { anyOf: [convert(d.innerType), { type: "null" }] };
    case "ZodObject": {
      const shape = d.shape();
      return {
        type: "object",
        properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, convert(v)])),
        required: Object.entries(shape)
          .filter(([, v]) => !v.isOptional())
          .map(([k]) => k),
        additionalProperties: d.unknownKeys === "passthrough",
      };
    }
    case "ZodString":
      return {
        type: "string",
        ...(d.checks.find((c) => c.kind === "regex")
          ? { pattern: d.checks.find((c) => c.kind === "regex").regex.source }
          : {}),
      };
    case "ZodNumber":
      return {
        type: "number",
        ...Object.fromEntries(
          d.checks
            .filter((c) => c.kind === "min" || c.kind === "max")
            .map((c) => [c.kind === "min" ? "minimum" : "maximum", c.value]),
        ),
      };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { enum: d.values };
    case "ZodRecord":
      return { type: "object", additionalProperties: convert(d.valueType) };
    case "ZodArray":
      return {
        type: "array",
        items: convert(d.type),
        ...(d.minLength ? { minItems: d.minLength.value } : {}),
      };
    default:
      throw new Error(`Unsupported schema ${d.typeName}`);
  }
}
const schema = convert(dbSchema);
writeFileSync("supabase/tests/iso-state-schema.json", JSON.stringify(schema, null, 2) + "\n");
const sql = `CREATE FUNCTION public.iso_state_valid(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $validator$ SELECT public.iso_json_valid(value, '${JSON.stringify(schema).replaceAll("'", "''")}'::jsonb) $validator$;\nREVOKE ALL ON FUNCTION public.iso_state_valid(jsonb) FROM PUBLIC,anon,authenticated;\n`;
writeFileSync("/tmp/jacoby-iso-schema-generated.sql", sql);
