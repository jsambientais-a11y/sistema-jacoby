import type { IsoAudit, IsoQuestion } from "@/components/iso/IsoWorkspace";
import { blankIsoReport, isoReportChecks } from "./iso-workflow";

export async function createIsoReportPdf(
  audit: IsoAudit,
  questions: IsoQuestion[],
  checklist: { id: string; title: string }[],
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const report = { ...blankIsoReport(), ...audit.report };
  const checks = isoReportChecks(audit);
  const missing = checks.filter((c) => !c.ok);
  let y = 30;
  const page = () => {
    doc.addPage();
    y = 30;
  };
  const text = (content: string, heading = false) => {
    doc.setFont("helvetica", heading ? "bold" : "normal");
    doc.setFontSize(heading ? 12 : 10);
    const lines = doc.splitTextToSize(content || "Não informado", 178) as string[];
    for (const line of lines) {
      if (y > 276) page();
      doc.text(line, 16, y);
      y += heading ? 6.5 : 5;
    }
    y += heading ? 2 : 3;
  };
  text(audit.name, true);
  text(`${audit.organization || "Empresa não informada"}${report.unit ? ` · ${report.unit}` : ""}`);
  text(
    `Situação do documento: ${missing.length ? `Rascunho — ${missing.length} item(ns) para revisão` : "Revisado conforme os campos preenchidos"}`,
  );
  if (missing.length) {
    text("Pendências para revisão", true);
    text(missing.map((c) => `- ${c.label}`).join("\n"));
  }
  text("1. Dados da auditoria", true);
  for (const [label, value] of [
    ["Emitido por", report.issuer],
    ["Período", `${report.startDate || "Não informado"} a ${report.endDate || "Não informado"}`],
    ["Normas", audit.standards.join(", ")],
    ["Tipo", audit.type],
    ["Auditor líder", report.leadAuditor],
    ["Equipe", report.team],
    ["Escopo", audit.scope],
    ["Objetivo", audit.objective],
    ["Processos", audit.processes],
    ["Critérios", audit.criteria],
    ["Metodologia", report.methodology],
  ])
    text(`${label}: ${value || "Não informado"}`);
  text("2. Entrevistas e evidências", true);
  if (!audit.selectedQuestions.length) text("Nenhuma entrevista selecionada.");
  const labels: Record<string, string> = {
    pending: "Pendente",
    conforme: "Conforme",
    parcial: "Parcial",
    nao_conforme: "Não conforme",
  };
  for (const [index, id] of audit.selectedQuestions.entries()) {
    const question = questions.find((q) => q.id === id);
    const answer = audit.answers?.[id];
    text(`${index + 1}. ${question?.question || `Pergunta não localizada (${id})`}`, true);
    text(
      `${question?.process || "Processo não informado"} · ${question?.standard || ""} ${question?.clause || ""}`,
    );
    text(`Resultado: ${labels[answer?.status || "pending"] || "Pendente"}`);
    text(`Resposta / observação: ${answer?.observation || "Não informada"}`);
    text(`Evidência: ${answer?.evidence || "Não informada"}`);
  }
  text("3. Constatações e não conformidades", true);
  if (!audit.ncs?.length)
    text(
      "Nenhuma NC registrada. A ausência de registro não equivale a uma declaração de conformidade.",
    );
  for (const [index, nc] of (audit.ncs || []).entries()) {
    text(`NC ${index + 1}: ${nc.title}`, true);
    text(`${nc.standard} ${nc.clause} · ${nc.classification} · ${nc.status}`);
    text(`Constatação: ${nc.finding}`);
    text(`Evidência objetiva: ${nc.evidence || "Não informada"}`);
    text(`Causa raiz: ${nc.cause || "Não informada"}`);
  }
  text("4. Planos de ação", true);
  if (!audit.plans?.length) text("Nenhum plano de ação registrado.");
  for (const plan of audit.plans || []) {
    text(plan.title, true);
    text(`${plan.standard} ${plan.clause} · ${plan.status}`);
    text(
      `NC vinculada: ${audit.ncs?.find((nc) => nc.id === plan.ncId)?.title || (plan.ncId ? "NC não localizada" : "Plano independente")}`,
    );
    text(`Ação: ${plan.action || "Não informada"}`);
    text(`Responsável: ${plan.responsible || "A definir"} · Prazo: ${plan.dueDate || "A definir"}`);
    text(`Evidência de fechamento: ${plan.closingEvidence || "Não informada"}`);
    text(`Eficácia: ${plan.effectiveness || "Não avaliada"}`);
    if (plan.closedOn) text(`Fechamento do plano: ${plan.closedOn}`);
  }
  text("5. Checklist de preparação", true);
  const items = checklist.filter((item) => audit.statuses[item.id]);
  if (!items.length) text("Nenhum item de preparação atualizado.");
  for (const item of items)
    text(
      `${audit.statuses[item.id] === "done" ? "Concluído" : audit.statuses[item.id] === "in_progress" ? "Em andamento" : "Pendente"} — ${item.title}`,
    );
  text("Anexos locais — índice", true);
  for (const file of audit.files || [])
    text(`${file.name} · ${Math.ceil(file.size / 1024)} KB · ${file.type}`);
  if (!audit.files?.length) text("Nenhum arquivo anexado.");
  text("6. Encerramento", true);
  text(`Pontos fortes: ${report.strengths || "Não informados"}`);
  text(`Conclusão do auditor: ${report.conclusion || "Não informada — documento em rascunho."}`);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(39, 107, 55);
    doc.text("Jacoby Gestão ISO · Relatório de Auditoria", 16, 16);
    doc.setDrawColor(213, 228, 214);
    doc.line(16, 21, 194, 21);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(
      `${report.issuer || "Jacoby Soluções"} · Gerado em ${new Date().toLocaleDateString("pt-BR")}`,
      16,
      289,
    );
    doc.text(`${i} / ${pages}`, 194, 289, { align: "right" });
    doc.setTextColor(0);
  }
  return doc;
}
