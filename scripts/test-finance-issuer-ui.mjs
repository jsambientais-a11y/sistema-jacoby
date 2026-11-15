// Start: npx vite --config tests/fixtures/vite.finance-issuer.config.ts
// Run: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test-finance-issuer-ui.mjs
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1450, height: 1000 } });
const errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.clock.install({ time: new Date("2026-11-15T15:00:00Z") });
await page.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === "127.0.0.1") return route.continue();
  external.push(url.origin);
  return route.abort();
});
const count = async (n) => {
  await page.getByRole("heading", { name: `Contas a receber (${n})`, exact: true }).waitFor();
};
const totals = async (open, received) => {
  const text = (
    await page.getByRole("region", { name: "Resumo do período" }).innerText()
  ).replaceAll("\u00a0", " ");
  assert.ok(text.includes(`R$ ${open}`), text);
  assert.ok(text.includes(`R$ ${received}`), text);
};
const choose = async (query, name, index = 0) => {
  await page.getByRole("combobox", { name: "Quem fatura", exact: true }).click();
  await page.getByRole("combobox", { name: "Pesquisar quem fatura" }).fill(query);
  await page.getByRole("option", { name, exact: true }).nth(index).click();
};
try {
  await page.goto("http://127.0.0.1:5177/tests/fixtures/finance-issuer.html");
  await count(7);
  const first=page.getByRole("row").filter({hasText:"BM #001 · Serviço 001"});
  const second=page.getByRole("row").filter({hasText:"BM #002 · Serviço 002"});
  for (const item of [first,second]) {
    assert.ok((await item.innerText()).includes("NF 123"));
    assert.ok((await item.innerText()).includes("Informada · líquido da categoria"));
    assert.ok((await item.innerText()).includes("Comissão confirmada"));
    assert.ok((await item.innerText()).replaceAll("\u00a0"," ").includes("R$ 1.000,00"));
  }
  const zero=page.getByRole("row").filter({hasText:"BM #001 · Serviço 005"});
  assert.ok((await zero.innerText()).replaceAll("\u00a0"," ").includes("R$ 0,00"));
  const manual=page.getByRole("row").filter({hasText:"Manual Águas e Resíduos"});
  assert.ok((await manual.innerText()).includes("Sem vínculo de cálculo · cadastro manual"));
  assert.ok((await manual.innerText()).includes("Receita manual"));
  await page.screenshot({path:"/tmp/jacoby-calculation-desktop.png",fullPage:true});

  await totals("630,00", "200,00");
  await choose("AGUAS", "Águas e Resíduos");
  await count(2);
  await totals("100,00", "200,00");
  assert.equal(await page.getByText("Manual Águas e Resíduos", { exact: true }).count(), 0);
  await page.getByLabel("Filtrar por centro de custo").selectOption("center");
  await page.getByLabel("Filtrar por banco", { exact: true }).selectOption("bank");
  await page.getByLabel("Situação da conta").selectOption("settled");
  await count(1);
  await totals("100,00", "200,00");
  await page.getByLabel("Buscar conta").fill("001");
  await count(0);
  await totals("100,00", "200,00"); // Search/status intentionally only affect the list.
  await page.getByLabel("Situação da conta").selectOption("all");
  await count(1);
  await page.getByRole("button", { name: "Limpar emissor" }).click();
  await count(1); // Clearing only issuer preserves search/center/bank/status/period.
  assert.equal(await page.getByLabel("Buscar conta").inputValue(), "001");
  assert.equal(await page.getByLabel("Filtrar por centro de custo").inputValue(), "center");
  await page.getByLabel("Buscar conta").fill("");
  await page.getByLabel("Filtrar por centro de custo").selectOption("");
  await page.getByLabel("Filtrar por banco", { exact: true }).selectOption("");
  await count(7);
  await choose("jAcObY", "Jacoby");
  await count(1);
  await totals("300,00", "0,00");
  await choose("AGUAS", "Águas e Resíduos", 1);
  await count(1);
  await totals("60,00", "0,00");
  await choose("sem emissor", "Sem emissor vinculado");
  await count(2);
  await totals("90,00", "0,00");
  assert.equal(await page.getByText("Manual Águas e Resíduos", { exact: true }).count(), 1);
  await page.getByRole("button", { name: "Excluídas", exact: true }).click();
  await count(1);
  await totals("90,00", "0,00"); // Deleted accounts never enter active summaries.
  await page.getByRole("button", { name: "Ver ativas" }).click();
  await choose("não identificada", "Terceirizada não identificada");
  await count(1);
  await totals("80,00", "0,00");
  await page.getByRole("combobox", { name: "Quem fatura", exact: true }).click();
  await page.getByRole("combobox", { name: "Pesquisar quem fatura" }).fill("nenhum resultado");
  await page.getByRole("status").filter({ hasText: "Nenhum emissor encontrado." }).waitFor();
  await page.getByRole("option", { name: "Quem fatura: todos", exact: true }).click();
  await count(7);
  await choose("aguas", "Águas e Resíduos");
  await page.getByRole("combobox", { name: "Período", exact: true }).click();
  await page.getByRole("option", { name: "Todos os períodos", exact: true }).click();
  await count(3);
  await totals("1.000,00", "200,00");
  await page.getByRole("combobox", { name: "Período", exact: true }).click();
  await page.getByRole("option", { name: "Período personalizado" }).click();
  await page.getByLabel("Data inicial").fill("2026-12-01");
  await page.getByLabel("Data final").fill("2026-12-31");
  await count(1);
  await totals("900,00", "0,00");
  await page.getByRole("button", { name: "Limpar emissor" }).click();
  assert.equal(await page.getByLabel("Data inicial").inputValue(), "2026-12-01");
  await page.getByRole("button", { name: "Alternar pagar/receber" }).click();
  await page.getByRole("heading", { name: "Contas a pagar (1)", exact: true }).waitFor();
  assert.equal(await page.getByRole("combobox", { name: "Quem fatura", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Alternar pagar/receber" }).click();
  await count(7);
  await page.setViewportSize({ width: 390, height: 844 });
  await choose("jacoby", "Jacoby");
  await count(1);
  await page.screenshot({ path: "/tmp/jacoby-issuer-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS: actual EnterpriseFinance UI; search, accents, IDs, selection, clearing, period/range, bank, center, status, totals, manual/unlinked/deleted rows, payer isolation, mobile. No remote requests.",
  );
} finally {
  await browser.close();
}
