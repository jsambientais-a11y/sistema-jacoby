import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const require = createRequire(import.meta.url);
const encode = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
function compile(path, replacements = {}) {
  let code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [from, to] of Object.entries(replacements)) code = code.replaceAll(from, to);
  return encode(code);
}
const libUrl = compile("../src/lib/chatgpt-connection.ts", {
  '"zod"': JSON.stringify(pathToFileURL(require.resolve("zod")).href),
});
const access = await import(libUrl);
const serverUrl = compile("../src/server/chatgpt-mcp.ts", {
  '"../lib/chatgpt-connection"': JSON.stringify(libUrl),
  '"@supabase/supabase-js"': JSON.stringify(
    pathToFileURL(require.resolve("@supabase/supabase-js")).href,
  ),
  '"zod"': JSON.stringify(pathToFileURL(require.resolve("zod")).href),
  "import.meta.env.DEV": "false",
  "import.meta.env.VITE_SUPABASE_URL": "undefined",
  "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": "undefined",
});
const { createChatGptHandler } = await import(serverUrl);
const cfg = {
  url: "https://example.supabase.co",
  key: "public-key",
  origin: "https://jacoby.example",
  allowedClients: ["dedicated-chatgpt"],
  enabled: true,
};
const claims = {
  sub: access.CHATGPT_OWNER_ID,
  iss: `${cfg.url}/auth/v1`,
  role: "authenticated",
  exp: Math.floor(Date.now() / 1000) + 3600,
  client_id: "dedicated-chatgpt",
};
const jwt = (patch) =>
  `header.${Buffer.from(JSON.stringify({ ...claims, ...patch })).toString("base64url")}.signature`;
function fixture({
  userId = access.CHATGPT_OWNER_ID,
  roles = [{ role: "admin" }],
  active = true,
  grant = true,
  authError = false,
  config = cfg,
  development = false,
  records = {},
} = {}) {
  const calls = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: authError ? null : { id: userId, email: "owner@example.com" } },
        error: authError ? new Error("secret error") : null,
      }),
      oauth: {
        listGrants: async () => {
          throw Error("Stateless server must pass the bearer explicitly");
        },
      },
    },
    from(table) {
      calls.push({ table, operations: [] });
      const call = calls.at(-1);
      const query = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then")
              return (resolve, reject) =>
                Promise.resolve({
                  data:
                    table === "user_roles"
                      ? roles
                      : table === "profiles"
                        ? { is_active: active }
                        : records[table] || [],
                  error: null,
                }).then(resolve, reject);
            if (["insert", "update", "delete", "upsert", "rpc"].includes(prop))
              throw new Error("No writes allowed");
            return (...args) => {
              call.operations.push([prop, ...args]);
              return query;
            };
          },
        },
      );
      return query;
    },
  };
  return {
    calls,
    handle: createChatGptHandler({
      config,
      development,
      createClient: () => client,
      fetch: async (url, options) => {
        if (url.endsWith("/user/oauth/grants")) {
          assert.match(options.headers.Authorization, /^Bearer /);
          assert.equal(options.headers.apikey, cfg.key);
          return Response.json(grant ? [{ client: { id: "dedicated-chatgpt" } }] : []);
        }
        return new Response("{}", { status: 404 });
      },
    }),
  };
}
function req(
  body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "identificar_acesso", arguments: {} },
  },
  { path = "mcp", token = jwt(), headers = {}, method = "POST", raw } = {},
) {
  return new Request(`${cfg.origin}/api/chatgpt/${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      ...headers,
    },
    ...(method === "POST" ? { body: raw ?? JSON.stringify(body) } : {}),
  });
}
test("produção exclusiva da Juliana; Reinan apenas no teste local; sem bypass de outro admin ou cliente", () => {
  const can = access.canManageChatGpt;
  assert.equal(can(access.CHATGPT_OWNER_ID, true, false), true);
  assert.equal(can(access.CHATGPT_TESTER_ID, true, false), false);
  assert.equal(can(access.CHATGPT_TESTER_ID, true, false, true), true);
  for (const id of [access.CHATGPT_OWNER_ID, access.CHATGPT_TESTER_ID, "other", undefined]) {
    assert.equal(can(id, false, false, true), false);
    assert.equal(can(id, true, true, true), false);
  }
  assert.equal(can("other", true, false, true), false);
});
test("callback limita HTTPS ao ChatGPT e aos caminhos oficiais", () => {
  for (const value of [
    "https://chatgpt.com/connector_platform_oauth_redirect",
    "https://chatgpt.com/connector/oauth/abc-123?state=a",
  ])
    assert.equal(access.isChatGptCallback(value), true);
  for (const value of [
    "http://chatgpt.com/connector/oauth/a",
    "https://chatgpt.com.evil.test/connector/oauth/a",
    "https://user@chatgpt.com/connector/oauth/a",
    "https://chatgpt.com/other",
    "javascript:alert(1)",
    "//chatgpt.com/connector/oauth/a",
  ])
    assert.equal(access.isChatGptCallback(value), false);
});
test("rascunho valida prazo real, UUID e campos; não aceita instrução ou responsável embutido", () => {
  assert.deepEqual(
    access.parseChatGptDraft(JSON.stringify({ title: " Revisar BM ", dueDate: "2026-11-09" })),
    { title: "Revisar BM", dueDate: "2026-11-09", priority: "medium" },
  );
  for (const draft of [
    { title: "X", dueDate: "2026-02-30" },
    { title: "X", assigneeId: "other" },
    { title: "X", description: "injection" },
    { title: "X", clientId: "not-uuid" },
    { title: "" },
  ])
    assert.equal(access.parseChatGptDraft(JSON.stringify(draft)), null);
});
test("descoberta informa recurso fixo, sem confiar em Host do pedido", async () => {
  const f = fixture();
  const res = await f.handle(req(null, { path: "metadata", token: null, method: "GET" }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).resource, `${cfg.origin}/api/chatgpt/mcp`);
  assert.equal(f.calls.length, 0);
});
test("sem token ou sessão verificada não consulta nenhuma tabela", async () => {
  let f = fixture();
  let res = await f.handle(req(undefined, { token: null }));
  assert.equal(res.status, 401);
  assert.match(res.headers.get("www-authenticate"), /resource_metadata/);
  assert.equal(f.calls.length, 0);
  f = fixture({ authError: true });
  res = await f.handle(req());
  assert.equal(res.status, 401);
  assert.equal(f.calls.length, 0);
});
test("rejeita cliente, outro admin, usuário desativado e Reinan na produção", async () => {
  for (const args of [
    { roles: [{ role: "client" }] },
    { userId: "other" },
    { active: false },
    { userId: access.CHATGPT_TESTER_ID },
  ]) {
    const f = fixture(args);
    assert.equal((await f.handle(req())).status, 403);
    assert.ok(f.calls.every((c) => ["user_roles", "profiles"].includes(c.table)));
  }
});
test("não funciona com sessão comum, OAuth de outro client, issuer diferente, token expirado ou conexão revogada", async () => {
  for (const patch of [
    { client_id: undefined },
    { client_id: "other-app" },
    { iss: "https://evil.example/auth/v1" },
    { exp: 1 },
    { sub: "other" },
  ]) {
    const f = fixture();
    assert.equal((await f.handle(req(undefined, { token: jwt(patch) }))).status, 401);
  }
  assert.equal((await fixture({ grant: false }).handle(req())).status, 401);
});
test("conector permanece desligado sem ativação explícita e client dedicado", async () => {
  assert.equal((await fixture({ config: { ...cfg, enabled: false } }).handle(req())).status, 503);
  assert.equal(
    (await fixture({ config: { ...cfg, allowedClients: [] } }).handle(req())).status,
    503,
  );
});
test("status exige proprietário mas permite sua sessão da Jacoby; informa OAuth indisponível corretamente", async () => {
  const response = await fixture().handle(
    req(null, { path: "status", method: "GET", token: "ordinary-session" }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).oauthEnabled, false);
});
test("rejeita origem externa, JSON inválido, lote e corpo grande", async () => {
  for (const [options, status] of [
    [{ headers: { Origin: "https://evil.example" } }, 403],
    [{ raw: "bad-json" }, 400],
    [{ raw: "[]" }, 400],
    [{ raw: "x".repeat(32769) }, 413],
  ])
    assert.equal((await fixture().handle(req(undefined, options))).status, status);
});
test("negocia MCP e lista apenas ferramentas sem gravação ou exclusão", async () => {
  const f = fixture();
  let response = await f.handle(req({ jsonrpc: "2.0", id: 1, method: "initialize" }));
  assert.equal((await response.json()).result.protocolVersion, "2025-03-26");
  response = await f.handle(req({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
  const tools = (await response.json()).result.tools;
  assert.equal(tools.length, 6);
  assert.ok(tools.every((t) => t.annotations.readOnlyHint));
});
test("paginação de BMs pede só 26 linhas e devolve 25 com indicação de mais", async () => {
  const rows = Array.from({ length: 26 }, (_, i) => ({ id: String(i) }));
  const f = fixture({ records: { billing_v2_cycles: rows } });
  const response = await f.handle(
    req({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "buscar_boletins", arguments: { pagina: 2 } },
    }),
  );
  const result = JSON.parse((await response.json()).result.content[0].text);
  assert.equal(result.boletins.length, 25);
  assert.equal(result.temMais, true);
  const call = f.calls.find((c) => c.table === "billing_v2_cycles");
  assert.deepEqual(
    call.operations.find((o) => o[0] === "range"),
    ["range", 25, 50],
  );
  assert.ok(call.operations.some((o) => o[0] === "eq" && o[1] === "is_demo" && o[2] === false));
});
test("preparar tarefa retorna link revisável, sem escrever no banco", async () => {
  const f = fixture();
  const response = await f.handle(
    req({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "preparar_tarefa",
        arguments: { title: "Conferir BM 211", dueDate: "2026-11-10" },
      },
    }),
  );
  const result = JSON.parse((await response.json()).result.content[0].text);
  assert.equal(result.salvo, false);
  const url = new URL(result.revisarEm);
  assert.equal(url.origin, cfg.origin);
  assert.equal(access.parseChatGptDraft(url.searchParams.get("rascunho")).title, "Conferir BM 211");
  assert.ok(f.calls.every((c) => ["user_roles", "profiles"].includes(c.table)));
});
test("não confirma rascunho para cliente inexistente ou params inválidos", async () => {
  const f = fixture();
  const response = await f.handle(
    req({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "preparar_tarefa", arguments: { title: "Teste", dueDate: "2026-02-30" } },
    }),
  );
  assert.equal((await response.json()).result.isError, true);
});

test("atalho abre nova conversa com o plugin explícito, sem enviar automaticamente ou aceitar URL arbitrária", () => {
  const link = access.buildJacobyAssistantLink("jacoby@personal", "Explique o BM 211");
  const url = new URL(link);
  assert.equal(url.protocol, "codex:");
  assert.equal(url.hostname, "new");
  assert.equal(
    url.searchParams.get("prompt"),
    "[@Jacoby](plugin://jacoby@personal) Explique o BM 211",
  );
  for (const plugin of [undefined, "https://evil.test", "a) injected", "x/other"])
    assert.equal(access.buildJacobyAssistantLink(plugin, "Olá"), null);
  assert.equal(access.buildJacobyAssistantLink("jacoby", ""), null);
  assert.equal(access.buildJacobyAssistantLink("jacoby", "x".repeat(2001)), null);
});

test("descoberta pública anuncia somente schemas, sem acessar tabelas; execução segue bloqueada", async () => {
  const f = fixture();
  const response = await f.handle(
    req({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { token: null }),
  );
  assert.equal(response.status, 200);
  const tools = (await response.json()).result.tools;
  assert.equal(tools.length, 6);
  assert.equal(f.calls.length, 0);
  assert.ok(tools.every((t) => t.securitySchemes[0].type === "oauth2"));
  assert.equal((await f.handle(req(undefined, { token: null }))).status, 401);
});

test("primeira página começa em 1 e não ignora o primeiro BM", async () => {
  for (const pagina of [undefined, 0, 1]) {
    const f = fixture({ records: { billing_v2_cycles: [{ bulletin_number: 211 }] } });
    const response = await f.handle(
      req({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "buscar_boletins",
          arguments: { numero: "211", ...(pagina === undefined ? {} : { pagina }) },
        },
      }),
    );
    const result = JSON.parse((await response.json()).result.content[0].text);
    assert.equal(result.pagina, 1);
    assert.equal(result.boletins[0].bulletin_number, 211);
    assert.deepEqual(
      f.calls.find((c) => c.table === "billing_v2_cycles").operations.find((o) => o[0] === "range"),
      ["range", 0, 25],
    );
  }
});

test("rascunho sobrevive ao parser JSON de busca do TanStack", () => {
  const draft = { title: "Teste de revisão", dueDate: "2026-11-10", priority: "medium" };
  assert.equal(access.normalizeChatGptDraftSearch(draft), JSON.stringify(draft));
  assert.equal(access.normalizeChatGptDraftSearch(JSON.stringify(draft)), JSON.stringify(draft));
  assert.equal(
    access.normalizeChatGptDraftSearch({ title: "Teste", assigneeId: "other" }),
    undefined,
  );
  assert.equal(access.normalizeChatGptDraftSearch(undefined), undefined);
});
