import { z } from "zod";
import type { IsoAudit, IsoQuestion, IsoEvidence, IsoNc } from "@/components/iso/IsoWorkspace";
import type { IsoPrompt } from "@/components/iso/IsoExtendedCatalog";
export type IsoNamedItem = { id: string; name: string; description: string };
export type IsoLogEntry = {
  id: string;
  at: string;
  auditId: string | null;
  action: string;
  detail: string;
};
export type IsoSavedFilter = { id: string; name: string; values: Record<string, string> };
export type IsoLocalState = {
  audits: IsoAudit[];
  selectedId: string;
  questions: IsoQuestion[];
  evidence: IsoEvidence[];
  customNcs: IsoNc[];
  prompts: IsoPrompt[];
  processes: IsoNamedItem[];
  criteria: IsoNamedItem[];
  favorites: string[];
  archivedIds: string[];
  archivedAuditIds: string[];
  filters: IsoSavedFilter[];
  activity: IsoLogEntry[];
  auditorName: string;
};
const str = z.string();
const ids = z.array(str);
const named = z.object({ id: str, name: str, description: str });
const question = z.object({
  id: str,
  standard: str,
  clause: str,
  process: str,
  question: str,
  objective: str,
  expected: str,
  alert: str,
  custom: z.boolean().optional(),
});
const evidence = z.object({
  id: str,
  standard: str,
  clause: str,
  title: str,
  type: str,
  risk: str,
  description: str,
  example: str,
  custom: z.boolean().optional(),
});
const nc = z.object({
  id: str,
  standard: str,
  clause: str,
  title: str,
  finding: str,
  evidence: str,
  classification: str,
  cause: str,
  action: str,
  closingEvidence: str,
  status: str,
  questionId: str.optional(),
});
const plan = z.object({
  id: str,
  ncId: str.nullable(),
  title: str,
  standard: str,
  clause: str,
  finding: str,
  cause: str,
  action: str,
  responsible: str,
  dueDate: str,
  status: z.enum(["Aberto", "Em andamento", "Concluído"]),
  closingEvidence: str,
  effectiveness: str,
  closedOn: str,
  createdAt: str,
});
const report = z
  .object({
    unit: str,
    startDate: str,
    endDate: str,
    leadAuditor: str,
    team: str,
    issuer: str,
    methodology: str,
    strengths: str,
    conclusion: str,
  })
  .partial();
const file = z.object({
  id: str.regex(/^[a-zA-Z0-9-]+$/),
  name: str,
  size: z.number().nonnegative(),
  type: str,
  ownerId: str,
  addedAt: str,
});
const audit = z
  .object({
    id: str,
    name: str,
    organization: str,
    scheduledFor: str,
    type: str,
    standards: ids,
    scope: str,
    objective: str,
    processes: str,
    statuses: z.record(z.enum(["pending", "in_progress", "done"])),
    criteria: str,
    auditorRole: str,
    hours: str,
    schedule: z.array(
      z.object({ id: str, start: str, end: str, process: str, auditee: str, location: str }),
    ),
    auditees: z.array(z.object({ id: str, name: str, role: str, email: str })),
    room: str,
    ppe: str,
    escort: str,
    logistics: str,
    selectedQuestions: ids,
    notes: z.record(str),
    answers: z
      .record(
        z.object({
          status: z.enum(["pending", "conforme", "parcial", "nao_conforme"]),
          observation: str,
          evidence: str,
        }),
      )
      .optional(),
    evidenceRecords: z
      .array(
        z.object({
          id: str,
          evidenceId: str,
          standard: str,
          clause: str,
          title: str,
          process: str,
          status: str,
          reference: str,
          observation: str,
        }),
      )
      .optional(),
    removedNcs: z.array(nc).optional(),
    removedEvidenceRecords: z
      .array(
        z.object({
          id: str,
          evidenceId: str,
          standard: str,
          clause: str,
          title: str,
          process: str,
          status: str,
          reference: str,
          observation: str,
        }),
      )
      .optional(),
    ncs: z.array(nc).optional(),
    plans: z.array(plan).optional(),
    report: report.optional(),
    files: z.array(file).optional(),
  })
  .passthrough();
const schema = z.object({
  audits: z.array(audit).min(1),
  selectedId: str,
  questions: z.array(question).default([]),
  evidence: z.array(evidence).default([]),
  customNcs: z.array(nc).default([]),
  prompts: z
    .array(
      z.object({
        id: str,
        title: str,
        standard: str,
        clause: str,
        process: str,
        category: str,
        body: str,
        tip: str,
      }),
    )
    .default([]),
  processes: z.array(named).default([]),
  criteria: z.array(named).default([]),
  favorites: ids.default([]),
  archivedIds: ids.default([]),
  archivedAuditIds: ids.default([]),
  filters: z.array(z.object({ id: str, name: str, values: z.record(str) })).default([]),
  activity: z
    .array(z.object({ id: str, at: str, auditId: str.nullable(), action: str, detail: str }))
    .default([]),
  auditorName: str.default(""),
});
export function parseIsoState(raw: string): IsoLocalState {
  if (raw.length > 30_000_000) throw new Error("O arquivo de dados excede 30 MB.");
  const data = JSON.parse(raw, (key, value) => {
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw new Error("Estrutura de dados inválida.");
    return value;
  });
  const result = schema.safeParse(data);
  if (!result.success)
    throw new Error(
      `Dados ISO inválidos: ${result.error.issues[0]?.path.join(".") || "estrutura"}. Nenhum dado foi substituído.`,
    );
  const state = result.data as IsoLocalState;
  const auditIds = new Set(state.audits.map((a) => a.id));
  if (auditIds.size !== state.audits.length)
    throw new Error("O arquivo contém auditorias com IDs repetidos.");
  for (const a of state.audits) {
    const unique = (rows: { id: string }[]) => new Set(rows.map((r) => r.id)).size === rows.length;
    if (!unique(a.ncs || []) || !unique(a.plans || []))
      throw new Error("O arquivo contém registros repetidos na auditoria.");
    if ((a.plans || []).some((p) => p.ncId && !(a.ncs || []).some((n) => n.id === p.ncId)))
      throw new Error("O arquivo contém plano vinculado a uma NC ausente.");
  }
  if (!auditIds.has(state.selectedId)) state.selectedId = state.audits[0].id;
  return state;
}
export function initializeIsoState(first: IsoAudit): IsoLocalState {
  return {
    audits: [first],
    selectedId: first.id,
    questions: [],
    evidence: [],
    customNcs: [],
    prompts: [],
    processes: [],
    criteria: [],
    favorites: [],
    archivedIds: [],
    archivedAuditIds: [],
    filters: [],
    activity: [],
    auditorName: "",
  };
}
export function appendIsoLog(state: IsoLocalState, entry: IsoLogEntry): IsoLocalState {
  const previous = state.activity[0];
  const merge =
    previous &&
    previous.auditId === entry.auditId &&
    previous.action === entry.action &&
    previous.detail === entry.detail &&
    Date.parse(entry.at) - Date.parse(previous.at) < 30_000;
  return {
    ...state,
    activity: merge
      ? [{ ...previous, at: entry.at }, ...state.activity.slice(1)]
      : [entry, ...state.activity],
  };
}
export function upsertIsoItem<T extends { id: string }>(items: T[], item: T) {
  return items.some((i) => i.id === item.id)
    ? items.map((i) => (i.id === item.id ? item : i))
    : [...items, item];
}
export function isoBackupText(state: IsoLocalState) {
  return JSON.stringify(
    {
      ...schema.parse(state),
      format: "jacoby-iso-local",
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}
