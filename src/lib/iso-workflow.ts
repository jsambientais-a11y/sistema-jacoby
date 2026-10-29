export type IsoActionPlan = {
  id: string;
  ncId: string | null;
  title: string;
  standard: string;
  clause: string;
  finding: string;
  cause: string;
  action: string;
  responsible: string;
  dueDate: string;
  status: "Aberto" | "Em andamento" | "Concluído";
  closingEvidence: string;
  effectiveness: string;
  closedOn: string;
  createdAt: string;
};
export type IsoReport = {
  unit: string;
  startDate: string;
  endDate: string;
  leadAuditor: string;
  team: string;
  issuer: string;
  methodology: string;
  strengths: string;
  conclusion: string;
};
export const blankIsoReport = (): IsoReport => ({
  unit: "",
  startDate: "",
  endDate: "",
  leadAuditor: "",
  team: "",
  issuer: "Jacoby Soluções",
  methodology:
    "Análise documental, entrevistas e verificação por amostragem de evidências objetivas.",
  strengths: "",
  conclusion: "",
});
export const isoToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export const isIsoDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
export const isPlanOverdue = (plan: IsoActionPlan, today = isoToday()) =>
  Boolean(plan.status !== "Concluído" && plan.dueDate && plan.dueDate < today);
export function prepareIsoPlan(
  plan: IsoActionPlan,
  ncIds: string[],
  today = isoToday(),
): IsoActionPlan {
  if (!plan.title.trim()) throw new Error("Informe o título do plano.");
  if (plan.ncId && !ncIds.includes(plan.ncId))
    throw new Error("A NC vinculada não pertence a esta auditoria.");
  if (plan.dueDate && !isIsoDate(plan.dueDate)) throw new Error("Informe um prazo válido.");
  if (!["Aberto", "Em andamento", "Concluído"].includes(plan.status))
    throw new Error("Status inválido.");
  if (plan.status === "Concluído" && !plan.closingEvidence.trim())
    throw new Error("Registre a evidência de fechamento para concluir o plano.");
  return {
    ...plan,
    title: plan.title.trim(),
    closedOn: plan.status === "Concluído" ? plan.closedOn || today : "",
  };
}
type AuditReviewInput = {
  organization: string;
  standards: string[];
  scope: string;
  objective: string;
  processes: string;
  selectedQuestions: string[];
  statuses: Record<string, string>;
  answers?: Record<string, { status: string; observation: string; evidence: string }>;
  ncs?: { id: string; finding: string; evidence: string; status: string }[];
  plans?: IsoActionPlan[];
  report?: Partial<IsoReport>;
};
export function isoReportChecks(audit: AuditReviewInput) {
  const report = { ...blankIsoReport(), ...audit.report };
  const ncs = audit.ncs || [];
  const plans = audit.plans || [];
  const answered = (id: string) => audit.answers?.[id];
  return [
    {
      id: "company",
      label: "Empresa auditada informada",
      ok: Boolean(audit.organization.trim()),
      section: "dados",
    },
    {
      id: "standards",
      label: "Normas auditadas definidas",
      ok: audit.standards.length > 0,
      section: "dados",
    },
    {
      id: "period",
      label: "Período da auditoria válido",
      ok:
        isIsoDate(report.startDate) &&
        isIsoDate(report.endDate) &&
        report.endDate >= report.startDate,
      section: "dados",
    },
    {
      id: "auditor",
      label: "Auditor líder informado",
      ok: Boolean(report.leadAuditor.trim()),
      section: "dados",
    },
    {
      id: "scope",
      label: "Escopo e objetivo descritos",
      ok: Boolean(audit.scope.trim() && audit.objective.trim()),
      section: "dados",
    },
    {
      id: "processes",
      label: "Processos auditados informados",
      ok: Boolean(audit.processes.trim()),
      section: "dados",
    },
    {
      id: "questions",
      label: "Entrevistas selecionadas",
      ok: audit.selectedQuestions.length > 0,
      section: "entrevistas",
    },
    {
      id: "answers",
      label: "Todas as entrevistas avaliadas",
      ok:
        audit.selectedQuestions.length > 0 &&
        audit.selectedQuestions.every((id) => answered(id) && answered(id)?.status !== "pending"),
      section: "entrevistas",
    },
    {
      id: "evidence",
      label: "Evidências registradas nas entrevistas",
      ok:
        audit.selectedQuestions.length > 0 &&
        audit.selectedQuestions.every((id) => Boolean(answered(id)?.evidence.trim())),
      section: "entrevistas",
    },
    {
      id: "findings",
      label: "NCs com constatação e evidência",
      ok: ncs.every((nc) => Boolean(nc.finding.trim() && nc.evidence.trim())),
      section: "constatacoes",
    },
    {
      id: "plans",
      label: "Cada NC tem um plano de ação",
      ok: ncs.every((nc) => plans.some((plan) => plan.ncId === nc.id)),
      section: "planos",
    },
    {
      id: "owners",
      label: "Planos com ação, responsável e prazo",
      ok: plans.every((plan) =>
        Boolean(plan.action.trim() && plan.responsible.trim() && isIsoDate(plan.dueDate)),
      ),
      section: "planos",
    },
    {
      id: "closure",
      label: "Planos concluídos têm evidência de fechamento",
      ok: plans.every(
        (plan) => plan.status !== "Concluído" || Boolean(plan.closingEvidence.trim()),
      ),
      section: "planos",
    },
    {
      id: "strengths",
      label: "Pontos fortes registrados",
      ok: Boolean(report.strengths.trim()),
      section: "encerramento",
    },
    {
      id: "conclusion",
      label: "Conclusão escrita pelo auditor",
      ok: Boolean(report.conclusion.trim()),
      section: "encerramento",
    },
  ];
}
