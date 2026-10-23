export type MapEditField = {
  key: string;
  label: string;
  kind: "text" | "number" | "boolean" | "select";
  nullable?: boolean;
  emptyLabel?: string;
  max?: number;
  options?: { value: string; label: string }[];
};
export type MapEditTarget = {
  table:
    | "waste_residues"
    | "waste_residue_types"
    | "client_branches"
    | "outsourced_treatment_commission_rates"
    | "outsourced_treatment_commission_template_rates"
    | "outsourced_commission_settings"
    | "outsourced_commission_templates"
    | "waste_equipment";
  id: string;
  title: string;
  context: string;
  record: Record<string, unknown>;
  fields: MapEditField[];
  impact: string[];
};
export function mapEditPayload(target: MapEditTarget, draft: Record<string, string | boolean>) {
  const payload: Record<string, unknown> = {};
  for (const field of target.fields) {
    const value = draft[field.key];
    if (field.key === "id" || field.key === "client_id")
      throw new Error("O identificador e a empresa não podem ser alterados.");
    let parsed: unknown;
    if (field.kind === "boolean") parsed = Boolean(value);
    else if (field.nullable && String(value ?? "").trim() === "") parsed = null;
    else if (field.kind === "number") {
      if (String(value ?? "").trim() === "") throw new Error(`Preencha ${field.label}.`);
      parsed = Number(String(value).replace(",", "."));
      if (
        !Number.isFinite(parsed) ||
        Number(parsed) < 0 ||
        (field.max !== undefined && Number(parsed) > field.max)
      )
        throw new Error(`Valor inválido para ${field.label}.`);
    } else {
      parsed = String(value ?? "").trim();
      if (!parsed && !field.nullable) throw new Error(`Preencha ${field.label}.`);
      if (field.kind === "select" && !field.options?.some((option) => option.value === parsed))
        throw new Error(`Selecione uma opção válida para ${field.label}.`);
    }
    const original = target.record[field.key] ?? null;
    if (
      field.kind === "number" && parsed !== null
        ? original === null || Number(original) !== parsed
        : original !== parsed
    )
      payload[field.key] = parsed;
  }
  return payload;
}

export function mapEditConditions(target: MapEditTarget): [string, unknown][] {
  const conditions = new Map<string, unknown>([["id", target.id]]);
  for (const key of ["client_id", "updated_at"])
    if (target.record[key] !== undefined) conditions.set(key, target.record[key]);
  for (const field of target.fields) conditions.set(field.key, target.record[field.key] ?? null);
  return [...conditions.entries()];
}
