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
const actionsUrl = compile("../src/lib/chatgpt-actions.ts", {
  '"zod"': JSON.stringify(pathToFileURL(require.resolve("zod")).href),
});
const invoicesUrl = compile("../src/lib/cycle-invoices.ts");
const receivablesUrl = compile("../src/lib/receivables.ts");
const agreementUrl = compile("../src/lib/billing-agreement.ts");
const invoiceEntriesUrl = compile("../src/lib/service-invoice-entries.ts");
const modelUrl = compile("../src/lib/billing-flow-model.ts", {
  '"./service-invoice-entries"': JSON.stringify(invoiceEntriesUrl),
});
const systemUrl = compile("../src/server/chatgpt-system.ts", {
  '"zod"': JSON.stringify(pathToFileURL(require.resolve("zod")).href),
  '"../lib/chatgpt-actions"': JSON.stringify(actionsUrl),
  '"../lib/cycle-invoices"': JSON.stringify(invoicesUrl),
  '"../lib/receivables"': JSON.stringify(receivablesUrl),
  '"../lib/billing-agreement"': JSON.stringify(agreementUrl),
  '"../lib/billing-flow-model"': JSON.stringify(modelUrl),
});
const actions = await import(actionsUrl);
const model = await import(modelUrl);
const serverUrl = compile("../src/server/chatgpt-mcp.ts", {
  '"./chatgpt-system"': JSON.stringify(systemUrl),
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
  queryErrors = [],
  isoState = null,
} = {}) {
  const calls = [];
  const client = {
    storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
    rpc: async (name) => {
      assert.equal(name, "iso_open_workspace");
      calls.push({ rpc: name });
      return { data: { state: isoState, revision: 1 }, error: null };
    },
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
              return (resolve, reject) => {
                let data =
                  table === "user_roles"
                    ? roles
                    : table === "profiles"
                      ? { is_active: active }
                      : records[table] || [];
                if (Array.isArray(data)) {
                  const range = call.operations.findLast((o) => o[0] === "range");
                  const limit = call.operations.findLast((o) => o[0] === "limit");
                  if (range) data = data.slice(range[1], range[2] + 1);
                  else if (limit) data = data.slice(0, limit[1]);
                }
                return Promise.resolve({
                  data,
                  error: queryErrors.includes(table) ? new Error("query_failed") : null,
                }).then(resolve, reject);
              };
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
  assert.equal(tools.length, 12);
  assert.ok(tools.every((t) => t.annotations.readOnlyHint));
});
test("paginação de BMs pede só 26 linhas e devolve 25 com indicação de mais", async () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ id: String(i) }));
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
  assert.equal(tools.length, 12);
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

async function callTool(f, name, args = {}) {
  const r = await f.handle(
    req({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name, arguments: args } }),
  );
  const envelope = await r.json();
  return {
    status: r.status,
    envelope,
    data: envelope.result?.content?.[0]?.text ? JSON.parse(envelope.result.content[0].text) : null,
  };
}
const cycleId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const baseCycle = {
  id: cycleId,
  client_id: clientId,
  branch_id: null,
  bulletin_number: 211,
  status: "closed",
  issuer_type: "jacoby",
  period_start: "2026-10-01",
  period_end: "2026-10-31",
};
const recordsForFlow = {
  billing_v2_cycles: [baseCycle],
  clients: [{ id: clientId, name: "Empresa Teste" }],
  billing_v2_cycle_services: [
    {
      id: "s",
      cycle_id: cycleId,
      amount: 1500,
      waste_service_id: "catalog",
      outsourced_company_id: null,
    },
  ],
};
test("cruza BM fechado, Faturamento e recebimento sem inferir baixa nem duplicar receita", async () => {
  const f = fixture({ records: recordsForFlow });
  const r = await callTool(f, "consultar_fluxo_bm", { numero: "211" });
  assert.equal(r.status, 200);
  assert.equal(r.data.completo, true);
  assert.equal(r.data.faturamento[0].baseBM, 1500);
  assert.equal(r.data.contasReceber[0].valor, 1500);
  assert.equal(r.data.contasReceber[0].conferido, false);
  assert.equal(r.data.contasReceber[0].status, "no_date");
  assert.equal(r.data.resumo.open, 1500);
  assert.equal(r.data.resumo.receivedThisMonth, 0);
  for (const c of f.calls.filter((c) =>
    [
      "billing_v2_cycle_services",
      "billing_receivable_tracking",
      "outsourced_movement_commissions",
    ].includes(c.table),
  ))
    assert.ok(c.operations.some((o) => o[0] === "eq" && o[1] === "cycle_id" && o[2] === cycleId));
  assert.equal(
    f.calls.some((c) => c.table === "enterprise_finance_accounts"),
    false,
  );
});
test("recebível usa conferência salva inclusive valor diferente do BM e data de baixa", async () => {
  const f = fixture({
    records: {
      ...recordsForFlow,
      billing_receivable_tracking: [
        {
          id: "saved",
          cycle_id: cycleId,
          category: "service",
          source_key: "jacoby",
          commission_amount: 1300,
          invoice_number: "NF123",
          received_on: "2026-01-01",
          expected_on: "2026-01-01",
        },
      ],
    },
  });
  const r = await callTool(f, "consultar_fluxo_bm", { id: cycleId });
  assert.equal(r.data.contasReceber[0].valor, 1300);
  assert.equal(r.data.contasReceber[0].status, "received");
  assert.equal(r.data.contasReceber[0].nota, "NF123");
  assert.equal(r.data.faturamento[0].notaInformada, true);
});
test("falha de uma fonte ou limite excedido nunca gera total financeiro incompleto", async () => {
  for (const options of [
    { queryErrors: ["billing_receivable_tracking"], records: recordsForFlow },
    {
      records: {
        ...recordsForFlow,
        billing_v2_movements: Array.from({ length: 1001 }, () => ({ cycle_id: cycleId })),
      },
    },
  ]) {
    const r = await callTool(fixture(options), "consultar_fluxo_bm", { id: cycleId });
    assert.equal(r.data.completo, false);
    assert.equal(r.data.resumo, undefined);
    assert.equal(r.data.contasReceber, undefined);
  }
});
test("BM ambíguo exige escolha antes de cruzar registros de clientes diferentes", async () => {
  const f = fixture({
    records: { billing_v2_cycles: [baseCycle, { ...baseCycle, id: taskId, client_id: taskId }] },
  });
  const r = await callTool(f, "consultar_fluxo_bm", { numero: "211" });
  assert.equal(r.data.ambiguo, true);
  assert.equal(r.data.candidatos.length, 2);
  assert.equal(
    f.calls.some((c) => c.table === "billing_receivable_tracking"),
    false,
  );
});
test("cadastros ativos por padrão, texto escapado, página delimitada e filtros incompatíveis recusados", async () => {
  const f = fixture();
  await callTool(f, "buscar_registros", {
    area: "residuos",
    texto: "LIXO%_",
    cliente_id: clientId,
    pagina: 2,
  });
  const q = f.calls.find((c) => c.table === "waste_residues");
  assert.ok(q.operations.some((o) => o[0] === "eq" && o[1] === "active" && o[2] === true));
  assert.ok(q.operations.some((o) => o[0] === "ilike" && o[2] === "%LIXO\\%\\_%"));
  assert.ok(q.operations.some((o) => o[0] === "range" && o[1] === 25 && o[2] === 50));
  const bad = await callTool(f, "buscar_registros", {
    area: "contas_receber",
    cliente_id: clientId,
  });
  assert.match(bad.data.erro, /vínculo direto/);
  const unknown = await f.handle(
    req({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "buscar_registros", arguments: { area: "auth.users" } },
    }),
  );
  assert.equal((await unknown.json()).result.isError, true);
});
test("ISO usa apenas RPC de leitura e pagina a auditoria escolhida sem acessar arquivos", async () => {
  const f = fixture({
    isoState: {
      selectedId: "auditA",
      audits: [
        { id: "auditA", plans: [{ title: "A" }] },
        { id: "auditB", plans: [{ title: "B" }] },
      ],
    },
  });
  const r = await callTool(f, "consultar_iso", { secao: "planos", auditoria_id: "auditB" });
  assert.equal(r.data.registros.length, 1);
  assert.equal(r.data.registros[0].title, "B");
  assert.deepEqual(
    f.calls.filter((c) => c.rpc).map((c) => c.rpc),
    ["iso_open_workspace"],
  );
});
test("prepara alteração com snapshot atual e proposta financeira sem gravar", async () => {
  const current = {
    id: taskId,
    title: "Conferir BM",
    due_date: null,
    priority: "medium",
    updated_at: "2026-11-07T12:00:00Z",
  };
  const f = fixture({ records: { tasks: [current] } });
  const r = await callTool(f, "preparar_acao", {
    tipo: "editar_tarefa",
    id: taskId,
    prazo: "2026-11-15",
    prioridade: "high",
  });
  assert.equal(r.data.salvo, false);
  assert.equal(r.data.proposta.anterior.updated_at, current.updated_at);
  const link = new URL(r.data.revisarEm);
  assert.ok(actions.normalizeAssistantAction(link.searchParams.get("acao")));
  const c = await callTool(f, "preparar_acao", {
    tipo: "criar_conta",
    natureza: "payable",
    descricao: "Despesa de teste",
    valor_centavos: 150000,
    vencimento: "2026-12-10",
  });
  assert.equal(c.data.salvo, false);
  assert.equal(c.data.proposta.pedido.valor_centavos, 150000);
  assert.equal(
    f.calls.some((c) => c.table === "enterprise_finance_accounts"),
    false,
  );
});
test("ação estrita rejeita pagamento, SQL, valor fracionário e data impossível", () => {
  const base = {
    tipo: "criar_conta",
    natureza: "payable",
    descricao: "Teste",
    valor_centavos: 100,
    vencimento: "2026-12-10",
  };
  for (const patch of [
    { settled_on: "2026-11-07" },
    { valor_centavos: 1.2 },
    { vencimento: "2026-02-31" },
    { tipo: "pagar" },
    { sql: "drop table" },
  ])
    assert.equal(actions.assistantActionInput.safeParse({ ...base, ...patch }).success, false);
});
test("gravação revisada é idempotente na conta e exige versão da tarefa; proposta expirada não escreve", async () => {
  const operations = [];
  let response = { data: [{ id: taskId }], error: null };
  const db = {
    from(table) {
      operations.push(["table", table]);
      const q = new Proxy(
        {},
        {
          get(_, p) {
            if (p === "then") return (resolve) => resolve(response);
            return (...args) => {
              operations.push([p, ...args]);
              return q;
            };
          },
        },
      );
      return q;
    },
  };
  const now = Date.now();
  const action = {
    version: 1,
    requestId: cycleId,
    expiresAt: now + 10000,
    pedido: { tipo: "editar_tarefa", id: taskId, prazo: "2026-12-10" },
    anterior: {
      title: "Teste",
      due_date: null,
      priority: "medium",
      updated_at: "2026-11-07T12:00:00Z",
    },
  };
  await actions.applyAssistantAction(db, action, access.CHATGPT_OWNER_ID, now);
  assert.ok(
    operations.some(
      (o) => o[0] === "eq" && o[1] === "updated_at" && o[2] === action.anterior.updated_at,
    ),
  );
  assert.deepEqual(operations.find((o) => o[0] === "update")[1], { due_date: "2026-12-10" });
  response = { data: [], error: null };
  await assert.rejects(
    () => actions.applyAssistantAction(db, action, access.CHATGPT_OWNER_ID, now),
    /mudou/,
  );
  operations.length = 0;
  await assert.rejects(
    () =>
      actions.applyAssistantAction(
        db,
        { ...action, expiresAt: now - 1 },
        access.CHATGPT_OWNER_ID,
        now,
      ),
    /expirou/,
  );
  assert.equal(operations.length, 0);
  response = { data: [{ id: cycleId }], error: null };
  const create = {
    version: 1,
    requestId: cycleId,
    expiresAt: now + 10000,
    pedido: {
      tipo: "criar_conta",
      natureza: "receivable",
      descricao: "Receita",
      valor_centavos: 12345,
      vencimento: "2026-12-10",
    },
  };
  await actions.applyAssistantAction(db, create, access.CHATGPT_OWNER_ID, now);
  assert.equal(operations.find((o) => o[0] === "insert")[1].id, cycleId);
  assert.equal(operations.find((o) => o[0] === "insert")[1].settled_on, null);
  response = { data: null, error: { code: "23505" } };
  await assert.rejects(
    () => actions.applyAssistantAction(db, create, access.CHATGPT_OWNER_ID, now),
    /já foi salva/,
  );
});
test("cálculo compartilhado abate sucata e ignora movimentação sem confirmação", () => {
  const result = model.buildBillingFlowEntries({
    cycles: [baseCycle],
    clients: [],
    companies: [],
    branches: [],
    catalog: [],
    residues: [{ id: "scrap", name: "Sucata", jacoby_pays_client: true }],
    services: [],
    commissions: [],
    placements: [],
    movements: [
      { cycle_id: cycleId, confirmed: true, weight_kg: 100, treatment_rate: 2 },
      {
        cycle_id: cycleId,
        confirmed: true,
        weight_kg: 10,
        treatment_rate: 3,
        waste_residue_id: "scrap",
      },
      { cycle_id: cycleId, confirmed: false, weight_kg: 9999, treatment_rate: 99 },
    ],
    directServices: [],
    tracking: [],
    notes: [],
    links: [],
  });
  assert.equal(result.find((e) => e.category === "treatment").baseAmount, 170);
});
