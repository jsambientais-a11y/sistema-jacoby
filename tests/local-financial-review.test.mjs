import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
test("revisão local ignora credenciais, não envia email e upsert mantém identidade sem duplicar baixas", async () => {
  const oldReviewStore = globalThis.__reviewFileStore;
  globalThis.__reviewFileStore = {
    read: async () => undefined,
    write: async () => {},
    remove: async () => {},
    all: async () => [],
  };
  const oldWindow = globalThis.window,
    oldStorage = globalThis.localStorage;
  const data = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  let source = readFileSync(
    new URL("../src/integrations/supabase/client.ts", import.meta.url),
    "utf8",
  );
  source = source.replace(
    /^import .*createClient.*;$/m,
    'const createClient = () => { throw new Error("cliente remoto proibido"); };',
  );
  source = source.replaceAll(
    "import.meta.env",
    JSON.stringify({
      VITE_LOCAL_REVIEW: "true",
      VITE_SUPABASE_URL: "https://production.invalid",
      VITE_SUPABASE_PUBLISHABLE_KEY: "fake",
    }),
  );
  const storageSource = ts.transpileModule(
    readFileSync(new URL("../src/lib/local-review-storage.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  source = source
    .replace(
      '"@/lib/local-review-storage"',
      JSON.stringify(
        `data:text/javascript;base64,${Buffer.from(storageSource).toString("base64")}`,
      ),
    )
    .replace(
      "createLocalReviewBucket(bucket)",
      "createLocalReviewBucket(bucket, globalThis.__reviewFileStore)",
    );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  try {
    const { supabase } = await import(
      `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
    );
    const options = { onConflict: "cycle_id,category,source_key" };
    const input = {
      cycle_id: "local-bm",
      category: "service",
      source_key: "jacoby",
      invoice_number: "11",
      rule_type: "fixed",
      rule_value: 133.72,
    };
    const first = await supabase
      .from("billing_receivable_tracking")
      .upsert(input, options)
      .select("*")
      .single();
    await supabase
      .from("billing_receivable_tracking")
      .upsert({ ...input, received_on: "2026-11-15" }, options);
    const result = await supabase.from("billing_receivable_tracking").select("*");
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].id, first.data.id);
    assert.equal(result.data[0].received_on, "2026-11-15");
    assert.equal(result.data[0].invoice_number, "11");
    assert.equal(result.data[0].commission_amount, 133.72);
    assert.deepEqual(await supabase.storage.from("files").list(), { data: [], error: null });
    assert.deepEqual(await supabase.functions.invoke("send-billing-emails"), {
      data: null,
      error: null,
    });
  } finally {
    globalThis.__reviewFileStore = oldReviewStore;
    globalThis.window = oldWindow;
    globalThis.localStorage = oldStorage;
  }
});
