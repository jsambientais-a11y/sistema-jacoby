import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const compile = (source, jsx = false) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      ...(jsx ? { jsx: ts.JsxEmit.React } : {}),
    },
  }).outputText;
const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const helperUrl = moduleUrl(
  compile(
    readFileSync(
      new URL("../supabase/functions/send-billing-emails/recipients.ts", import.meta.url),
      "utf8",
    ),
  ),
);
const { billingEmailPreviewRecipients: preview } = await import(helperUrl);
const copyStatusUrl = moduleUrl(
  compile(
    readFileSync(new URL("../src/lib/billing-email-copy-status.ts", import.meta.url), "utf8"),
  ),
);
const { hasConfirmedBillingCopy } = await import(copyStatusUrl);
const componentSource = readFileSync(
  new URL("../src/components/BillingEmailRecipientsPreview.tsx", import.meta.url),
  "utf8",
).replace('"@/lib/billing-email-copy-status"', JSON.stringify(copyStatusUrl));
const { BillingEmailRecipientsPreview: Component } = await import(
  moduleUrl(
    `import React from ${JSON.stringify(import.meta.resolve("react"))};\n` +
      compile(componentSource, true),
  )
);
const render = (recipients, copies, outsourcedIssuer = null) =>
  renderToStaticMarkup(React.createElement(Component, { recipients, copies, outsourcedIssuer }));

test("prévia representa um email por destinatário com CC efetivo, inclusive terceiros e Juliana como TO", () => {
  const input = ["cliente@example.invalid", "terceiro@example.invalid", "JS.JS.AMBIENTAIS@GMAIL.COM"];
  const data = preview(input);
  assert.deepEqual(data, {
    recipients: input.map((email) => email.toLowerCase()),
    cc: ["js.js.ambientais@gmail.com"],
  });
  const html = render(data.recipients, data.cc, {
    emails: ["terceiro@example.invalid"],
    companyName: "Terceirizada Teste",
  });
  assert.equal((html.match(/<strong>Para:<\/strong>/g) || []).length, 3);
  assert.equal((html.match(/<strong>CC:<\/strong> js.js.ambientais@gmail.com/g) || []).length, 2);
  assert.match(html, /Nenhuma cópia adicional nesta mensagem/);
  assert.match(html, /Terceirizada emissora:.*Terceirizada Teste/);
  assert.match(html, /várias cópias do mesmo BM/);
  assert.match(html, /Novas tentativas de envio também mantêm o CC/);
});
test("prévia de Juliana como único TO ou sem destinatários não anuncia CC inexistente", () => {
  for (const input of [[], [" JS.JS.AMBIENTAIS@GMAIL.COM "]]) {
    const data = preview(input);
    assert.deepEqual(data.cc, []);
    const html = render(data.recipients, data.cc);
    assert.doesNotMatch(html, /<strong>CC:<\/strong> js.ambientais/);
    assert.match(html, input.length ? /Nenhuma cópia adicional/ : /Nenhum e-mail válido/);
  }
  assert.match(render(["cliente@example.invalid"], null), /Não informado pelo servidor/);
});
test("modal consome data.cc, limpa prévia antiga e renderiza a apresentação testada", () => {
  const source = readFileSync(
    new URL("../src/components/BillingV2Module.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /setRecipientCopiesPreview\(Array.isArray\(data\?\.cc\) \? data.cc : null\)/,
  );
  assert.match(source, /setRecipientCopiesPreview\(null\)/);
  assert.match(
    source,
    /<BillingEmailRecipientsPreview recipients=\{recipientPreview\} copies=\{recipientCopiesPreview\}/,
  );
});

let handlerSequence = 0;
async function withHandler(run) {
  const old = {
    Deno: globalThis.Deno,
    fetch: globalThis.fetch,
    client: globalThis.__previewTestClient,
  };
  const addresses = [
    "cliente@example.invalid",
    "terceiro@example.invalid",
    "js.js.ambientais@gmail.com",
  ];
  const rows = addresses.map((email, i) => ({
    id: `delivery-${i}`,
    cycle_id: "cycle",
    residue_emission_id: null,
    recipient_email: email,
    status: "pending",
    attempts: 0,
    next_attempt_at: "2000-01-01",
    queued_at: "2000-01-01",
  }));
  const messages = [];
  let failRecipient = null;
  const query = (table) => {
    const filters = [];
    let payload,
      single = false;
    const execute = () => {
      if (table !== "billing_email_deliveries")
        return {
          data:
            table === "billing_v2_cycles"
              ? {
                  id: "cycle",
                  client_id: "client",
                  branch_id: null,
                  issuer_type: "outsourced",
                  outsourced_company_id: "third-party",
                  bulletin_number: 165,
                  period_start: "2026-11-01",
                  period_end: "2026-11-15",
                  client_portal_visible: true,
                }
              : table === "outsourced_companies"
                ? { active: true, legal_name: "Terceirizada Teste", email: addresses[1] }
                : { name: "Cliente Teste" },
          error: null,
        };
      const matched = rows.filter((row) => filters.every((filter) => filter(row)));
      if (payload) matched.forEach((row) => Object.assign(row, payload));
      return {
        data: single ? (matched[0] ?? null) : matched.map((row) => ({ ...row })),
        error: null,
      };
    };
    const builder = new Proxy(
      {},
      {
        get: (_, key) => {
          if (key === "then")
            return (resolve, reject) => Promise.resolve(execute()).then(resolve, reject);
          return (...args) => {
            if (key === "update") payload = args[0];
            if (key === "eq" || key === "is") filters.push((row) => row[args[0]] === args[1]);
            if (key === "in") filters.push((row) => args[1].includes(row[args[0]]));
            if (key === "lt") filters.push((row) => row[args[0]] < args[1]);
            if (key === "lte") filters.push((row) => row[args[0]] <= args[1]);
            if (key === "single" || key === "maybeSingle") {
              single = true;
              return Promise.resolve(execute());
            }
            return builder;
          };
        },
      },
    );
    return builder;
  };
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
  globalThis.__previewTestClient = (_, key) =>
    key === "server"
      ? {
          from: query,
          rpc: async (name) => ({
            data:
              name === "billing_portal_email_recipients"
                ? addresses.map((recipient_email) => ({ recipient_email }))
                : null,
            error: null,
          }),
        }
      : {
          auth: { getUser: async () => ({ data: { user: { id: "tester" } } }) },
          rpc: async (name) => ({ data: name === "has_app_permission", error: null }),
        };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    const message = JSON.parse(options.body);
    messages.push(message);
    return new Response(
      JSON.stringify(
        message.to[0] === failRecipient
          ? { message: "temporary failure" }
          : { id: `provider-${messages.length}` },
      ),
      { status: message.to[0] === failRecipient ? 503 : 200 },
    );
  };
  let source = readFileSync(
    new URL("../supabase/functions/send-billing-emails/index.ts", import.meta.url),
    "utf8",
  )
    .replace(/^import "jsr:.*;\n/m, "")
    .replace(
      /^import .*createClient.*;\n/m,
      "const createClient = globalThis.__previewTestClient;\n",
    )
    .replace('"./recipients.ts"', JSON.stringify(helperUrl));
  try {
    const handler = (await import(`${moduleUrl(compile(source))}#${handlerSequence++}`)).default;
    const invoke = async (body) => {
      const response = await handler.fetch(
        new Request("https://example.invalid", {
          method: "POST",
          headers: { Authorization: "Bearer fake" },
          body: JSON.stringify(body),
        }),
      );
      assert.equal(response.status, 200);
      return response.json();
    };
    await run({
      invoke,
      rows,
      messages,
      fail: (email) => {
        failRecipient = email;
      },
    });
  } finally {
    globalThis.Deno = old.Deno;
    globalThis.fetch = old.fetch;
    globalThis.__previewTestClient = old.client;
  }
}
test("handler: prévia corresponde aos TO/CC das três entregas separadas, sem envios ou mutações na prévia", async () =>
  withHandler(async ({ invoke, rows, messages }) => {
    const before = structuredClone(rows);
    const data = await invoke({ cycleId: "cycle", previewOnly: true });
    assert.equal(messages.length, 0);
    assert.deepEqual(rows, before);
    assert.deepEqual(data.cc, ["js.js.ambientais@gmail.com"]);
    assert.equal(data.recipients.length, 3);
    const result = await invoke({});
    assert.equal(result.sent, 3);
    assert.deepEqual(
      messages.map((message) => message.to),
      data.recipients.map((email) => [email]),
    );
    for (const message of messages)
      assert.deepEqual(
        message.cc,
        data.cc.filter((email) => !message.to.includes(email)),
      );
    assert.ok(rows.every((row) => row.status === "sent"));
  }));
test("handler: falha de um destinatário mantém CC no retry sem reenviar entregas concluídas", async () =>
  withHandler(async ({ invoke, rows, messages, fail }) => {
    fail("terceiro@example.invalid");
    const result = await invoke({});
    assert.equal(result.sent, 2);
    assert.equal(result.failed, 1);
    const failed = rows.find((row) => row.status === "failed");
    assert.equal(failed.recipient_email, "terceiro@example.invalid");
    assert.equal(failed.attempts, 1);
    fail(null);
    failed.next_attempt_at = "2000-01-01"; // simulate the scheduled retry becoming due
    const retried = await invoke({ deliveryId: failed.id });
    assert.equal(retried.sent, 1);
    assert.equal(messages.length, 4);
    assert.deepEqual(messages[3].to, ["terceiro@example.invalid"]);
    assert.deepEqual(messages[3].cc, ["js.js.ambientais@gmail.com"]);
    assert.equal(
      messages.filter((message) => message.to[0] === "cliente@example.invalid").length,
      1,
    );
    assert.equal(
      messages.filter((message) => message.to[0] === "js.js.ambientais@gmail.com").length,
      1,
    );
    assert.deepEqual(
      messages.find((message) => message.to[0] === "js.js.ambientais@gmail.com").cc,
      [],
    );
    assert.equal(failed.attempts, 2);
  }));

test("CC não informado/vazio/incorreto nunca é apresentado como confirmado nem habilita confirmação", () => {
  for (const copies of [null, [], ["outro@example.invalid"]]) {
    assert.equal(hasConfirmedBillingCopy(["cliente@example.invalid"], copies), false);
    const html = render(["cliente@example.invalid"], copies);
    assert.match(html, /servidor não confirmou a cópia para Juliana/);
    assert.doesNotMatch(html, /Cópia confirmada pelo servidor:/);
  }
  assert.equal(
    hasConfirmedBillingCopy(["cliente@example.invalid"], [" JS.JS.AMBIENTAIS@GMAIL.COM "]),
    true,
  );
  assert.equal(hasConfirmedBillingCopy(["JS.JS.AMBIENTAIS@GMAIL.COM"], []), true);
  assert.equal(hasConfirmedBillingCopy([], ["js.js.ambientais@gmail.com"]), false);
  const module = readFileSync(
    new URL("../src/components/BillingV2Module.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    module,
    /if \(!hasConfirmedBillingCopy\(recipientPreview, recipientCopiesPreview\)\)/,
  );
  assert.match(module, /disabled=\{recipientPreviewLoading \|\| !hasConfirmedBillingCopy/);
});
