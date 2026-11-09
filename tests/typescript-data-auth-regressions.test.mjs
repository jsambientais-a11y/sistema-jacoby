import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path, dependencies, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, ...globals,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

function dataHooks(response) {
  const queries = [];
  const supabase = {
    from(table) {
      queries.push(table);
      const chain = {
        select() { return chain; }, is() { return chain; }, order() { return chain; },
        then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); },
      };
      return chain;
    },
  };
  return { queries, hooks: load("../src/hooks/use-data.ts", {
    react: { useEffect() {} },
    "@tanstack/react-query": { useQuery: (options) => options, useQueryClient() {} },
    "@/integrations/supabase/client": { supabase },
  }) };
}

test("task/invoice query failures are surfaced, not presented as successful empty lists", async () => {
  const error = new Error("Database permission denied");
  const { hooks, queries } = dataHooks({ data: null, error });
  await assert.rejects(hooks.useTasks().queryFn(), error);
  await assert.rejects(hooks.useClientInvoices().queryFn(), error);
  assert.deepEqual(queries, ["tasks", "client_invoices"]);
});
test("task/invoice query success keeps returned rows and accepts genuinely empty results", async () => {
  const task = { id: "task", title: "Processo", status: "todo" };
  const tasks = dataHooks({ data: [task], error: null });
  assert.deepEqual(await tasks.hooks.useTasks().queryFn(), [task]);
  const invoice = { id: "invoice", amount: 123, status: "open" };
  const invoices = dataHooks({ data: [invoice], error: null });
  assert.deepEqual(await invoices.hooks.useClientInvoices().queryFn(), [invoice]);
  for (const data of [null, []]) {
    const empty = dataHooks({ data, error: null });
    assert.equal((await empty.hooks.useTasks().queryFn()).length, 0);
    assert.equal((await empty.hooks.useClientInvoices().queryFn()).length, 0);
  }
});

function authMiddleware({ env = {}, header = null, claims = { sub: "authenticated-user" }, error = null } = {}) {
  const calls = [];
  const client = { auth: { async getClaims(token) { calls.push({ token }); return { data: { claims }, error }; } } };
  const { requireSupabaseAuth } = load("../src/integrations/supabase/auth-middleware.ts", {
    "@tanstack/react-start": { createMiddleware: () => ({ server: (handler) => handler }) },
    "@tanstack/react-start/server": { getRequest: () => ({ headers: { get: () => header } }) },
    "@supabase/supabase-js": { createClient: (url, key, options) => { calls.push({ url, key, options }); return client; } },
  }, { process: { env } });
  let nextCalls = 0;
  return {
    calls, client, get nextCalls() { return nextCalls; },
    run: () => requireSupabaseAuth({ next: async ({ context }) => { nextCalls++; return context; } }),
  };
}
const configured = { SUPABASE_URL: "https://example.invalid", SUPABASE_PUBLISHABLE_KEY: "test-public-key" };
test("server authentication fails closed without configuration or a valid bearer header", async () => {
  for (const scenario of [
    {}, { env: { SUPABASE_URL: configured.SUPABASE_URL } },
    { env: configured }, { env: configured, header: "Basic test" },
    { env: configured, header: "Bearer " },
  ]) {
    const auth = authMiddleware(scenario);
    await assert.rejects(auth.run());
    assert.equal(auth.nextCalls, 0);
    assert.equal(auth.calls.length, 0);
  }
});
test("invalid claims or missing user id cannot reach a protected server handler", async () => {
  for (const scenario of [{ claims: null }, { claims: {} }, { error: new Error("Invalid token") }]) {
    const auth = authMiddleware({ env: configured, header: "Bearer test-token", ...scenario });
    await assert.rejects(auth.run(), /Unauthorized/);
    assert.equal(auth.nextCalls, 0);
  }
});
test("valid bearer token passes a typed authenticated context with original RLS credentials", async () => {
  const auth = authMiddleware({ env: configured, header: "Bearer test-token" });
  const context = await auth.run();
  assert.equal(context.userId, "authenticated-user");
  assert.equal(context.supabase, auth.client);
  assert.equal(auth.nextCalls, 1);
  assert.equal(auth.calls[0].key, "test-public-key");
  assert.equal(auth.calls[0].options.global.headers.Authorization, "Bearer test-token");
  assert.equal(auth.calls[0].options.auth.persistSession, false);
  assert.equal(auth.calls[1].token, "test-token");
});
