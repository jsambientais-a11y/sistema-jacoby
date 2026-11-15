import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const { outputText } = ts.transpileModule(
  readFileSync(
    new URL("../supabase/functions/send-billing-emails/recipients.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.ESNext } },
);
const { billingEmailRecipients: recipients } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
test("envio do cliente inclui Juliana em cópia explícita", () =>
  assert.deepEqual(recipients(" Cliente@exemplo.com "), {
    to: ["cliente@exemplo.com"],
    cc: ["js.ambientais@gmail.com"],
  }));
test("destinatária Juliana não recebe cópia duplicada, ignorando espaços e caixa", () =>
  assert.deepEqual(recipients(" JS.AMBIENTAIS@GMAIL.COM "), {
    to: ["js.ambientais@gmail.com"],
    cc: [],
  }));
test("envio central da fila, reenvio e emissão por resíduo aplica mesmos destinatários", () => {
  const source = readFileSync(
    new URL("../supabase/functions/send-billing-emails/index.ts", import.meta.url),
    "utf8",
  );
  assert.equal((source.match(/fetch\("https:\/\/api.resend.com\/emails"/g) || []).length, 1);
  assert.match(source, /\.\.\.billingEmailRecipients\(delivery.recipient_email\)/);
  assert.match(source, /billingEmailPreviewRecipients\(recipients\)/);
});

test("handler envia cópia nos caminhos publicação, reenvio, fila e resíduo com provedor simulado", async () => {
  let source = readFileSync(
    new URL("../supabase/functions/send-billing-emails/index.ts", import.meta.url),
    "utf8",
  );
  source = source
    .replace(/^import "jsr:.*;\n/m, "")
    .replace(/^import .*createClient.*;\n/m, "const createClient = globalThis.__copyTestClient;\n");
  source = source.replace(
    '"./recipients.ts"',
    JSON.stringify(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`),
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const old = {
    Deno: globalThis.Deno,
    fetch: globalThis.fetch,
    client: globalThis.__copyTestClient,
  };
  const messages = [];
  globalThis.Deno = {
    env: {
      get: (key) =>
        ({
          SUPABASE_URL: "https://example.invalid",
          SUPABASE_ANON_KEY: "anon",
          SUPABASE_SERVICE_ROLE_KEY: "server",
          RESEND_API_KEY: "fake",
          BILLING_EMAIL_FROM: "billing@example.invalid",
        })[key],
    },
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    messages.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: "mock-provider" }), { status: 200 });
  };
  let residue = false;
  const query = (table) => {
    let updating = false,
      single = false;
    const result = () => ({
      data:
        table === "billing_email_deliveries"
          ? updating
            ? { id: "delivery" }
            : [
                {
                  id: "delivery",
                  cycle_id: "cycle",
                  residue_emission_id: residue ? "emission" : null,
                  recipient_email: "client@example.invalid",
                  status: "failed",
                  attempts: 1,
                },
              ]
          : table === "billing_v2_cycles"
            ? {
                id: "cycle",
                client_id: "client",
                branch_id: null,
                bulletin_number: 165,
                period_start: "2026-11-01",
                period_end: "2026-11-15",
                client_portal_visible: true,
              }
            : table === "billing_v2_residue_emissions"
              ? {
                  display_number: "165-1",
                  waste_residue_id: "residue",
                  client_portal_visible: true,
                }
              : { name: "Teste" },
      error: null,
    });
    const builder = new Proxy(
      {},
      {
        get: (_, key) =>
          key === "then"
            ? (resolve, reject) => Promise.resolve(result()).then(resolve, reject)
            : (...args) => {
                if (key === "update") updating = true;
                if (key === "single" || key === "maybeSingle") {
                  single = true;
                  return Promise.resolve(result());
                }
                return builder;
              },
      },
    );
    return builder;
  };
  globalThis.__copyTestClient = (_url, key) =>
    key === "server"
      ? { from: query, rpc: async () => ({ error: null }) }
      : {
          auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
          rpc: async (name) => ({ data: name === "has_app_permission", error: null }),
        };
  try {
    const handler = (
      await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`)
    ).default;
    for (const body of [
      { cycleId: "cycle" },
      { deliveryId: "delivery" },
      {},
      { cycleId: "cycle", residueEmissionId: "emission" },
    ]) {
      residue = !!body.residueEmissionId;
      const response = await handler.fetch(
        new Request("https://example.invalid", {
          method: "POST",
          headers: { Authorization: "Bearer fake" },
          body: JSON.stringify(body),
        }),
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).sent, 1);
    }
    assert.equal(messages.length, 4);
    for (const message of messages) {
      assert.deepEqual(message.to, ["client@example.invalid"]);
      assert.deepEqual(message.cc, ["js.ambientais@gmail.com"]);
    }
  } finally {
    globalThis.Deno = old.Deno;
    globalThis.fetch = old.fetch;
    globalThis.__copyTestClient = old.client;
  }
});
