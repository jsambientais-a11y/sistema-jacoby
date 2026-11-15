import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const code = ts.transpileModule(
  readFileSync(new URL("../src/lib/finance-calculation-detail.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const { financeCalculationDetail: detail } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const entry = {
  category: "rental",
  baseAmount: 999,
  tracking: {
    rule_type: "percent",
    rule_value: 10,
    net_invoice_amount: 1000,
    base_amount_snapshot: 900,
    invoice_number: "123",
  },
};
test("percentual usa líquido informado; zero difere de ausência e snapshot é histórico", () => {
  assert.equal(detail(entry).baseCents, 100000);
  assert.equal(
    detail({ ...entry, tracking: { ...entry.tracking, net_invoice_amount: 0 } }).baseCents,
    0,
  );
  const historical = detail({
    ...entry,
    tracking: { ...entry.tracking, net_invoice_amount: null },
  });
  assert.equal(historical.baseCents, 90000);
  assert.match(historical.baseOrigin, /Histórica/);
});
test("fixo não inventa base a partir de snapshot ou valor de comissão", () => {
  const fixed = {
    ...entry,
    tracking: { ...entry.tracking, rule_type: "fixed", net_invoice_amount: null },
  };
  assert.equal(detail(fixed).baseCents, null);
  assert.equal(
    detail({ ...fixed, tracking: { ...fixed.tracking, net_invoice_amount: 0 } }).baseCents,
    0,
  );
  assert.match(detail(fixed).baseOrigin, /independe/);
});
test("base atual é estimativa; serviço pendente não tem base e ausente não vira zero", () => {
  assert.equal(detail({ ...entry, tracking: undefined }).baseCents, 99900);
  assert.match(detail({ ...entry, tracking: undefined }).baseOrigin, /Estimada/);
  assert.equal(detail({ ...entry, tracking: undefined, pendingService: true }).baseCents, null);
  assert.equal(detail({ ...entry, baseAmount: undefined, tracking: undefined }).baseCents, null);
});
test("nota compartilhada e empresas distintas mantêm evidência por categoria sem agregação", () => {
  const inputs = [
    entry,
    { ...entry, category: "exchange" },
    { ...entry, companyId: "other", category: "service" },
  ];
  const snapshot = structuredClone(inputs);
  const result = inputs.map(detail);
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((r) => r.baseCents),
    [100000, 100000, 100000],
  );
  assert.deepEqual(
    result.map((r) => r.category),
    ["Locação", "Troca", "Serviços"],
  );
  assert.deepEqual(inputs, snapshot);
});
