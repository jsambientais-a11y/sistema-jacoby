import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/task-notifications.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { collaboratorChanges, mergeNotifications } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

test("salvar sem mudar colaboradores não insere ninguém de novo", () => {
  assert.deepEqual(collaboratorChanges(["a", "b"], ["b", "a"]), { toAdd: [], toRemove: [] });
});

test("só quem entrou é inserido e só quem saiu é removido", () => {
  assert.deepEqual(collaboratorChanges(["a", "b"], ["b", "c"]), { toAdd: ["c"], toRemove: ["a"] });
});

test("atribuição antiga não lida continua no sino mesmo fora das recentes, sem repetir", () => {
  const doc = { id: "doc", created_at: "2026-11-05T10:00:00Z" };
  const repeated = { id: "repetida", created_at: "2026-11-04T10:00:00Z" };
  const old = { id: "antiga", created_at: "2026-10-01T10:00:00Z" };
  const merged = mergeNotifications([doc, repeated], [repeated, old]);
  assert.deepEqual(
    merged.map((item) => item.id),
    ["doc", "repetida", "antiga"],
  );
});
