import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const load = async (name) => {
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
};
const {
  billingFinanceIssuer,
  financeIssuer,
  financeIssuerOptions,
  matchesFinanceIssuer,
  searchFinanceIssuers,
} = await load("finance-issuer");
const { manualFinanceRow, summarizeFinance } = await load("enterprise-finance");
const { inPeriod } = await load("receivables");
const row = (id, issuer, amount = 10000, extra = {}) => ({
  id,
  kind: "receivable",
  source: "billing",
  billingIssuer: issuer,
  amountCents: amount,
  dueOn: "2026-11-20",
  settledOn: null,
  costCenterId: "center",
  bankAccountId: "bank",
  ...extra,
});
const outsourced = billingFinanceIssuer(
  { companyId: "a", company: "Águas e Resíduos" },
  { issuer_type: "jacoby" },
);
const direct = billingFinanceIssuer(
  { companyId: null, company: "arbitrary" },
  { issuer_type: "jacoby" },
);
test("emissor usa o vínculo do lançamento; Jacoby exige BM direto explícito", () => {
  assert.deepEqual(outsourced, { id: "outsourced:a", name: "Águas e Resíduos" });
  assert.deepEqual(direct, { id: "jacoby", name: "Jacoby" });
  for (const cycle of [undefined, { issuer_type: "outsourced" }, { issuer_type: "unexpected" }])
    assert.equal(
      billingFinanceIssuer({ companyId: null, company: "Jacoby" }, cycle).id,
      "unlinked",
    );
  assert.equal(
    billingFinanceIssuer({ companyId: "missing", company: "" }).id,
    "outsourced:missing",
  );
  assert.match(billingFinanceIssuer({ companyId: "missing", company: "" }).name, /sem nome/);
});
test("manual não infere emissor pelo nome, notas, ID ou metadado estranho", () => {
  const original = {
    id: "a",
    kind: "receivable",
    description: "BM 001 Jacoby",
    counterparty: "Águas e Resíduos",
    amount_cents: 50000,
    due_on: "2026-11-01",
    settled_on: null,
    notes: "company a",
    category: "Faturamento",
  };
  const manual = manualFinanceRow(original);
  assert.equal(financeIssuer(manual).id, "unlinked");
  assert.equal(financeIssuer({ ...manual, billingIssuer: outsourced }).id, "unlinked");
  assert.equal(manual.manual, original);
  assert.equal(matchesFinanceIssuer(manual, "outsourced:a"), false);
});
test("opções deduplicam por ID, preservam homônimos e incluem sem vínculo", () => {
  const inputs = [
    row("a", outsourced),
    row("b", outsourced),
    row("c", direct),
    row("d", { id: "outsourced:b", name: outsourced.name }),
    row("e", null),
    row("pay", direct, 100, { kind: "payable" }),
  ];
  assert.deepEqual(
    financeIssuerOptions(inputs).map((x) => x.id),
    ["jacoby", "outsourced:a", "outsourced:b", "unlinked"],
  );
  assert.equal(searchFinanceIssuers(financeIssuerOptions(inputs), "  AGUAS ").length, 2);
  assert.equal(searchFinanceIssuers(financeIssuerOptions(inputs), "jAcObY")[0].id, "jacoby");
  assert.equal(searchFinanceIssuers(financeIssuerOptions(inputs), "nao existe").length, 0);
});
test("seleção/limpeza combinam com período, banco e centro sem alterar valores ou duplicar linhas", () => {
  const rows = [
    row("a", outsourced),
    row("b", outsourced, 25000, { settledOn: "2026-11-10" }),
    row("c", direct, 50000),
    row("d", null, 15000),
    row("future", outsourced, 90000, { dueOn: "2026-12-20" }),
    row("different", outsourced, 11000, { bankAccountId: "other" }),
  ];
  const snapshot = structuredClone(rows);
  const scope = (issuer) =>
    rows.filter(
      (r) =>
        matchesFinanceIssuer(r, issuer) &&
        inPeriod(r.settledOn || r.dueOn, { kind: "month", month: "2026-11" }) &&
        r.bankAccountId === "bank" &&
        r.costCenterId === "center",
    );
  assert.deepEqual(
    scope("outsourced:a").map((r) => r.id),
    ["a", "b"],
  );
  assert.equal(summarizeFinance(scope("outsourced:a")).openIn, 10000);
  assert.equal(summarizeFinance(scope("outsourced:a")).received, 25000);
  assert.equal(summarizeFinance(scope("all")).expectedIn, 100000);
  assert.equal(summarizeFinance(scope("unlinked")).expectedIn, 15000);
  assert.deepEqual(rows, snapshot);
});
