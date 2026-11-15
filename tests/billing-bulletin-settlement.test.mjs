import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const urls = {};
for (const name of [
  "billing-dates",
  "receivables",
  "billing-agreement",
  "billing-bulletin-settlement",
  "billing-write-lock",
]) {
  let { outputText } = ts.transpileModule(
    readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  );
  for (const [dep, url] of Object.entries(urls))
    outputText = outputText.replaceAll(`"./${dep}"`, JSON.stringify(url));
  urls[name] = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const { prepareBulletinSettlement: prepare } = await import(urls["billing-bulletin-settlement"]);
const { createBillingWriteLock: lock } = await import(urls["billing-write-lock"]);
const saved = {
  rule_type: "fixed",
  rule_value: 133.72,
  net_invoice_amount: null,
  commission_amount: 133.72,
  invoice_number: "11",
  invoice_issued_on: "2026-11-01",
  invoice_due_on: "2026-11-10",
  expected_basis: "manual",
  expected_on: "2026-11-12",
  received_on: null,
  notes: "Preservar acordo",
};
const row = (id, amount, extra = {}) => ({
  id,
  amount,
  canSettle: true,
  status: "upcoming",
  entry: {
    id,
    cycleId: "bm165",
    category: "service",
    companyId: "cortes",
    company: "Cortes",
    description: id,
    baseAmount: amount,
    currentCommission: amount,
    tracking: { ...saved, rule_value: amount, commission_amount: amount },
  },
  ...extra,
});
const today = "2026-11-15";
test("BM165: baixa serviços e ignora categorias zeradas sem criar registros", () => {
  const rows = [row("service", 133.72), row("rental", 0), row("exchange", 0), row("treatment", 0)];
  const before = structuredClone(rows);
  const inputs = prepare(rows, today, today);
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].received_on, today);
  assert.equal(inputs[0].rule_value, 133.72);
  assert.deepEqual(rows, before);
});
test("baixa somente saldo de BM parcial e preserva notas, datas e valores por origem", () => {
  const paid = row("paid", 50, { status: "received" });
  paid.entry.tracking.received_on = "2026-11-05";
  const pending = row("pending", 100);
  const inputs = prepare([paid, pending, pending], today, today);
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].entry.id, "pending");
  for (const key of [
    "invoice_number",
    "invoice_issued_on",
    "invoice_due_on",
    "expected_basis",
    "expected_on",
    "notes",
    "rule_type",
    "rule_value",
    "net_invoice_amount",
  ])
    assert.equal(inputs[0][key], pending.entry.tracking[key]);
  assert.equal(paid.entry.tracking.received_on, "2026-11-05");
  assert.deepEqual(prepare([paid], today, today), []);
});
test("anexo sem serviço fica pendente sem impedir baixa das categorias existentes", () => {
  const pending = row("note", 0);
  pending.entry.pendingService = true;
  assert.equal(prepare([pending, row("rental", 100)], today, today).length, 1);
});
test("valida todas as origens antes de escrever: recusa acordo pendente, datas inválidas e outro BM", () => {
  assert.throws(
    () => prepare([row("ok", 100), row("unconfirmed", 100, { canSettle: false })], today, today),
    /Confira/,
  );
  for (const date of ["2026-11-16", "2026-02-30", ""])
    assert.throws(() => prepare([row("a", 10)], date, today), /data/);
  const other = row("other", 100);
  other.entry.cycleId = "bm166";
  assert.throws(() => prepare([row("a", 10), other], today, today), /um BM/);
});
test("dupla ação de BM ou categoria não inicia segunda escrita; libera após sucesso e falha", async () => {
  const exclusive = lock();
  let release;
  let writes = 0;
  const first = exclusive(async () => {
    writes++;
    await new Promise((resolve) => {
      release = resolve;
    });
    return "ok";
  });
  await assert.rejects(
    exclusive(async () => {
      writes++;
    }),
    /Aguarde/,
  );
  assert.equal(writes, 1);
  release();
  assert.equal(await first, "ok");
  await assert.rejects(
    exclusive(async () => {
      throw new Error("banco recusou");
    }),
    /recusou/,
  );
  assert.equal(await exclusive(async () => 42), 42);
});
