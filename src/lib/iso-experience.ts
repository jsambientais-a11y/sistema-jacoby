import type { IsoAudit } from "@/components/iso/IsoWorkspace";
export function isoExperienceSections(audits: IsoAudit[], anonymize: boolean) {
  return audits.map((a, index) => ({
    title: `${index + 1}. ${anonymize ? `Organização ${index + 1}` : a.organization || "Organização não informada"}`,
    text: `Período: ${a.report?.startDate || a.scheduledFor || "Não informado"} a ${a.report?.endDate || a.scheduledFor || "Não informado"}\nTipo: ${a.type}\nPapel: ${a.auditorRole}\nHoras informadas: ${a.hours || "Não informadas"}\nNormas: ${a.standards.join(", ") || "Não informadas"}\nProcessos: ${a.processes || "Não informados"}`,
  }));
}
