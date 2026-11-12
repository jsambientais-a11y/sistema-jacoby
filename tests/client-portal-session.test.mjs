import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/client-portal-access.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(
  source.replace('import { supabase } from "@/integrations/supabase/client";', ""),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
);
const { bind } = await import(
  `data:text/javascript;base64,${Buffer.from(
    `${outputText}\nexport const bind = (client) => { supabase = client; return invokeAdminUserAccess; };\nlet supabase;`,
  ).toString("base64")}`
);

const session = (access_token, id = "admin") => ({ access_token, user: { id } });
const failure = (status, message) => ({
  data: null,
  error: { context: new Response(JSON.stringify({ error: message }), { status }) },
});

function setup(results, renewed = session("new")) {
  const tokens = [];
  let refreshes = 0;
  const invoke = bind({
    auth: {
      getSession: async () => ({ data: { session: session("old") }, error: null }),
      refreshSession: async () => {
        refreshes++;
        return { data: { session: renewed }, error: null };
      },
    },
    functions: {
      invoke: async (_name, options) => {
        tokens.push(options.headers.Authorization);
        return results.shift();
      },
    },
  });
  return { invoke, tokens, refreshes: () => refreshes };
}

test("repete o acesso uma vez com a sessão renovada após receber 401", async () => {
  const { invoke, tokens, refreshes } = setup([
    failure(401, "Sessão inválida."),
    { data: { tokenHash: "token" }, error: null },
  ]);
  assert.deepEqual(await invoke("impersonate_client", { userId: "client" }), { tokenHash: "token" });
  assert.deepEqual(tokens, ["Bearer old", "Bearer new"]);
  assert.equal(refreshes(), 1);
});

test("não repete uma operação administrativa com a sessão de outra conta", async () => {
  const { invoke, tokens } = setup([failure(401, "Sessão inválida.")], session("new", "other"));
  await assert.rejects(invoke("create", {}), /Entre novamente/);
  assert.deepEqual(tokens, ["Bearer old"]);
});

test("preserva erros de permissão e evita repetir ações que falharam fora da autenticação", async () => {
  const { invoke, tokens, refreshes } = setup([failure(403, "Somente administradores.")]);
  await assert.rejects(invoke("update", {}), /Somente administradores/);
  assert.deepEqual(tokens, ["Bearer old"]);
  assert.equal(refreshes(), 0);
});
