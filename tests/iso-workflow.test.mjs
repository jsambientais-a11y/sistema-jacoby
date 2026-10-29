import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const { outputText } = ts.transpileModule(
  readFileSync(new URL("../src/lib/iso-workflow.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
);
const { prepareIsoPlan, isPlanOverdue, isoReportChecks, blankIsoReport, isIsoDate } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const plan = () => ({
  id: "p",
  ncId: "nc-a",
  title: " Corrigir rastreabilidade ",
  standard: "ISO 14001",
  clause: "8.1",
  finding: "Documento ausente",
  cause: "Conferência incompleta",
  action: "Reconciliar documentos",
  responsible: "Luana",
  dueDate: "2026-11-15",
  status: "Aberto",
  closingEvidence: "",
  effectiveness: "",
  closedOn: "",
  createdAt: "now",
});
const audit = () => ({
  organization: "Empresa",
  standards: ["ISO 14001"],
  scope: "Resíduos",
  objective: "Verificar controles",
  processes: "Logística",
  selectedQuestions: ["q"],
  statuses: {},
  answers: { q: { status: "conforme", observation: "Verificado", evidence: "Registro 123" } },
  ncs: [{ id: "nc-a", finding: "Documento ausente", evidence: "MTR 123", status: "Aberta" }],
  plans: [plan()],
  report: {
    ...blankIsoReport(),
    startDate: "2026-10-29",
    endDate: "2026-10-30",
    leadAuditor: "Juliana",
    strengths: "Rastreabilidade da amostra",
    conclusion: "Conclusão registrada pelo auditor",
  },
});
test("auditorias antigas sem PAC ou relatório podem ser revisadas sem alterar seus dados", () => {
  const legacy = audit();
  delete legacy.plans;
  delete legacy.report;
  const before = structuredClone(legacy);
  const checks = isoReportChecks(legacy);
  assert.ok(checks.some((c) => c.id === "plans" && !c.ok));
  assert.deepEqual(legacy, before);
  assert.equal("report" in legacy, false);
});
test("plano só pode ser vinculado a NC da auditoria selecionada", () => {
  assert.throws(() => prepareIsoPlan(plan(), ["nc-outra"]), /não pertence/);
  assert.equal(prepareIsoPlan({ ...plan(), ncId: null }, []).ncId, null);
});
test("editar plano não modifica a NC nem outra auditoria", () => {
  const a = audit(),
    b = audit();
  a.plans[0] = prepareIsoPlan({ ...a.plans[0], responsible: "Angela" }, ["nc-a"]);
  assert.equal(b.plans[0].responsible, "Luana");
  assert.equal(a.ncs[0].status, "Aberta");
});
test("concluir exige evidência e reabrir remove data de fechamento", () => {
  assert.throws(() => prepareIsoPlan({ ...plan(), status: "Concluído" }, ["nc-a"]), /evidência/);
  const done = prepareIsoPlan(
    { ...plan(), status: "Concluído", closingEvidence: "Conciliação 15" },
    ["nc-a"],
    "2026-10-29",
  );
  assert.equal(done.closedOn, "2026-10-29");
  assert.equal(prepareIsoPlan({ ...done, status: "Em andamento" }, ["nc-a"]).closedOn, "");
});
test("atraso usa dia local fornecido e exclui concluídos e planos sem prazo", () => {
  assert.equal(isPlanOverdue(plan(), "2026-11-15"), false);
  assert.equal(isPlanOverdue(plan(), "2026-11-16"), true);
  assert.equal(isPlanOverdue({ ...plan(), status: "Concluído" }, "2026-11-16"), false);
  assert.equal(isPlanOverdue({ ...plan(), dueDate: "" }, "2026-11-16"), false);
});
test("relatório exige período válido, entrevistas, evidências e conclusão real", () => {
  assert.ok(isoReportChecks(audit()).every((c) => c.ok));
  const a = audit();
  a.report.endDate = "2026-10-28";
  a.report.conclusion = "";
  a.answers.q.evidence = "";
  const failed = isoReportChecks(a)
    .filter((c) => !c.ok)
    .map((c) => c.id);
  assert.ok(failed.includes("period"));
  assert.ok(failed.includes("conclusion"));
  assert.ok(failed.includes("evidence"));
});
test("ausência de NCs não inventa conclusão positiva nem plano fictício", () => {
  const a = audit();
  a.ncs = [];
  a.plans = [];
  a.report.conclusion = "";
  const checks = isoReportChecks(a);
  assert.equal(checks.find((c) => c.id === "plans").ok, true);
  assert.equal(checks.find((c) => c.id === "conclusion").ok, false);
  assert.equal(blankIsoReport().conclusion, "");
});
test("datas impossíveis, títulos vazios e status inválidos são recusados", () => {
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("2028-02-29"), true);
  assert.throws(() => prepareIsoPlan({ ...plan(), dueDate: "2026-02-30" }, ["nc-a"]), /prazo/);
  assert.throws(() => prepareIsoPlan({ ...plan(), title: " " }, ["nc-a"]), /título/);
  assert.throws(() => prepareIsoPlan({ ...plan(), status: "inválido" }, ["nc-a"]), /Status/);
});

test("PDF pagina textos longos e inclui NC, plano, evidência e conclusão sem inventar conformidade", async () => {
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const require = createRequire(import.meta.url);
  const jspdfUrl = pathToFileURL(require.resolve("jspdf")).href;
  const helperUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
  let source = readFileSync(new URL("../src/lib/iso-report-pdf.ts", import.meta.url), "utf8");
  let code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  code = code
    .replace('"./iso-workflow"', JSON.stringify(helperUrl))
    .replace('import("jspdf")', `import(${JSON.stringify(jspdfUrl)})`);
  const { createIsoReportPdf } = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  const a = {
    ...audit(),
    name: "Auditoria de teste",
    type: "Interna",
    criteria: "Critérios de teste",
  };
  a.plans[0].action = "Verificar documento e reconciliar a amostra. ".repeat(280);
  const pdf = await createIsoReportPdf(
    a,
    [
      {
        id: "q",
        question: "A rastreabilidade foi demonstrada?",
        process: "Logística",
        standard: "ISO 14001",
        clause: "8.1",
      },
    ],
    [],
  );
  assert.ok(pdf.getNumberOfPages() > 2);
  const bytes = pdf.output();
  assert.ok(bytes.startsWith("%PDF-"));
  assert.ok(bytes.includes("TESTE") === false);
  assert.ok(bytes.includes("Reconciliar") || bytes.includes("Verificar documento"));
  assert.ok(bytes.includes("NC vinculada"));
  assert.ok(bytes.includes("MTR 123"));
});
