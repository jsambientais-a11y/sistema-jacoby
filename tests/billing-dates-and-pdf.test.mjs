import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const load = async (path) => {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
};
const dates = await load("../src/lib/billing-dates.ts");
const { buildBulletinPdfItems: items, bulletinItemDate } = await load(
  "../src/lib/bulletin-pdf-items.ts",
);
test("15 dias corridos após emissão/vencimento, inclusive virada de mês/ano e ano bissexto", () => {
  assert.equal(dates.billingExpectedOn("issue_15", "2026-11-20", ""), "2026-12-05");
  assert.equal(dates.billingExpectedOn("issue_15", "2026-12-25", ""), "2027-01-09");
  assert.equal(dates.billingExpectedOn("issue_15", "2028-02-20", ""), "2028-03-06");
  assert.equal(dates.billingExpectedOn("due_15", "2026-01-01", "2026-01-20"), "2026-02-04");
  for (const bad of ["", "2026-02-31", "2026-13-01"])
    assert.equal(dates.billingExpectedOn("issue_15", bad, ""), "");
});
test("exceções antigas continuam dia 10 do mês seguinte; conferência salva é preservada ao abrir", () => {
  assert.equal(dates.billingExpectedOn("issue", "2026-12-31", ""), "2027-01-10");
  const saved = {
    expected_basis: "issue",
    expected_on: "2026-12-17",
    invoice_issued_on: "2026-11-01",
    invoice_due_on: null,
  };
  assert.equal(
    dates.preserveSavedBillingForecast({
      saved,
      basis: "issue",
      issuedOn: "2026-11-01",
      dueOn: "",
    }),
    "2026-12-17",
  );
  assert.equal(
    dates.preserveSavedBillingForecast({
      saved,
      basis: "issue_15",
      issuedOn: "2026-11-01",
      dueOn: "",
    }),
    "2026-11-16",
  );
  assert.equal(
    dates.preserveSavedBillingForecast({
      saved,
      basis: "issue",
      issuedOn: "2026-11-02",
      dueOn: "",
    }),
    "2026-12-10",
  );
});
const base = {
  placements: [],
  movements: [],
  services: [],
  equipment: [],
  residues: [{ id: "sucata", name: "SUCATA MISTA" }],
  wasteServices: [{ id: "service", name: "Limpeza" }],
};
const movement = (date, weight = 1100) => ({
  occurred_on: date,
  confirmed: true,
  waste_residue_id: "sucata",
  weight_kg: weight,
  treatment_rate: 0.6,
  removed_quantity: 0,
  exchange_rate: 0,
});
test("PDF mantém a data de cada operação de sucata e o total original", () => {
  const rows = items({ ...base, movements: [movement("2026-11-01"), movement("2026-11-03", 500)] });
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.date),
    ["2026-11-01", "2026-11-03"],
  );
  assert.equal(
    rows.reduce((s, r) => s + r.value, 0),
    960,
  );
  assert.equal(rows[0].value, 660);
});
test("agrupa resíduo e taxa somente no mesmo dia; operação não confirmada fica fora", () => {
  const rows = items({
    ...base,
    movements: [
      movement("2026-11-01", 100),
      movement("2026-11-01", 200),
      { ...movement("2026-11-02"), confirmed: false },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, 180);
});
test("locação usa início, troca usa movimentação, serviço usa execução; datas ausentes não são inventadas", () => {
  const rows = items({
    ...base,
    placements: [
      { started_on: "2026-11-01", equipment_id: "e", quantity: 1, monthly_rental_rate: 100 },
    ],
    movements: [{ ...movement("2026-11-02"), removed_quantity: 1, exchange_rate: 20 }],
    services: [
      { waste_service_id: "service", execution_date: "2026-11-03", amount: 30, quantity: 1 },
    ],
  });
  assert.deepEqual(
    rows.map((r) => r.date),
    ["2026-11-01", "2026-11-02", "2026-11-02", "2026-11-03"],
  );
  assert.equal(bulletinItemDate("2026-11-03"), "03/11/2026");
  assert.equal(bulletinItemDate(null), "-");
  const [missing] = items({ ...base, movements: [movement(undefined)] });
  assert.equal(missing.date, null);
});
