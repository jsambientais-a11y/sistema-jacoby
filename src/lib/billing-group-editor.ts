import type { BillingFlowEntry, BillingFlowSaveInput } from "@/components/BillingFlowPreview";
import { billingAgreement, billingCommission } from "./billing-agreement";
import { billingExpectedOn, validBillingDate, type BillingExpectedBasis } from "./billing-dates";
import { billingEntryHasCharge } from "./billing-flow-navigation";

export const sharedBillingKeys = [
  "invoice_number",
  "invoice_issued_on",
  "invoice_due_on",
  "expected_basis",
  "expected_on",
  "received_on",
  "notes",
] as const;
export type SharedBillingKey = (typeof sharedBillingKeys)[number];
export type SharedBillingFields = Record<SharedBillingKey, string>;
export type BillingRowDraft = {
  selected: boolean;
  rule: "fixed" | "percent";
  value: string;
  net: string;
};
export function billingSavedFields(entry: BillingFlowEntry): SharedBillingFields {
  const saved = entry.tracking;
  return {
    invoice_number: (saved ? saved.invoice_number : entry.legacyInvoiceNumber) || "",
    invoice_issued_on: (saved ? saved.invoice_issued_on : entry.legacyIssuedOn) || "",
    invoice_due_on: (saved ? saved.invoice_due_on : entry.legacyDueOn) || "",
    expected_basis: saved?.expected_basis || (entry.legacyExpectedOn ? "manual" : "issue"),
    expected_on: (saved ? saved.expected_on : entry.legacyExpectedOn) || "",
    received_on: (saved ? saved.received_on : entry.legacyPaidOn) || "",
    notes: saved?.notes || "",
  };
}
export function commonBillingFields(entries: BillingFlowEntry[]) {
  const originals = entries.map(billingSavedFields);
  const fields = {} as SharedBillingFields;
  const mixed = new Set<SharedBillingKey>();
  for (const key of sharedBillingKeys) {
    const values = new Set(originals.map((item) => item[key]));
    fields[key] = values.size === 1 ? originals[0][key] : "";
    if (values.size > 1) mixed.add(key);
  }
  return { fields, mixed };
}
export function createBillingRow(entry: BillingFlowEntry): BillingRowDraft {
  const agreement = billingAgreement(entry);
  return {
    selected: billingEntryHasCharge(entry),
    rule: entry.tracking?.rule_type || agreement.defaultRule,
    value: entry.tracking
      ? String(entry.tracking.rule_value)
      : !billingEntryHasCharge(entry)
        ? "0"
        : agreement.requiresAgreement || entry.pendingService
          ? ""
          : String(entry.currentCommission),
    net:
      entry.tracking?.net_invoice_amount == null ? "" : String(entry.tracking.net_invoice_amount),
  };
}
export function prepareBillingGroupSave(
  entries: BillingFlowEntry[],
  rows: Record<string, BillingRowDraft>,
  fields: SharedBillingFields,
  changed: Set<SharedBillingKey>,
  today: string,
): BillingFlowSaveInput[] {
  const first = entries[0];
  if (
    entries.some(
      (entry) => entry.cycleId !== first?.cycleId || entry.companyId !== first?.companyId,
    )
  )
    throw new Error("Notas de BMs ou emissores diferentes devem ser conferidas separadamente.");
  return entries.flatMap((entry) => {
    const row = rows[entry.id];
    if (!row?.selected) return [];
    const original = billingSavedFields(entry);
    const merged = { ...original };
    for (const key of changed) merged[key] = fields[key];
    const value = row.value.trim() === "" ? NaN : Number(row.value.replace(",", "."));
    const net = row.net.trim() === "" ? null : Number(row.net.replace(",", "."));
    if (net != null && (!Number.isFinite(net) || net < 0))
      throw new Error(`${entry.description}: informe um líquido válido.`);
    if (billingCommission(row.rule, value, net) == null)
      throw new Error(
        `${entry.description}: confira o valor/percentual e informe o líquido desta categoria quando usar percentual.`,
      );
    for (const key of [
      "invoice_issued_on",
      "invoice_due_on",
      "expected_on",
      "received_on",
    ] as const)
      if (changed.has(key) && merged[key] && !validBillingDate(merged[key]))
        throw new Error("Informe datas válidas.");
    if (
      (changed.has("invoice_issued_on") || changed.has("invoice_due_on")) &&
      merged.invoice_issued_on &&
      merged.invoice_due_on &&
      merged.invoice_due_on < merged.invoice_issued_on
    )
      throw new Error("O vencimento da nota não pode ser anterior à emissão.");
    if (changed.has("received_on") && merged.received_on > today)
      throw new Error("O recebimento não pode estar no futuro.");
    const basis = merged.expected_basis as BillingExpectedBasis;
    if (!["issue", "due", "issue_15", "due_15", "manual"].includes(basis))
      throw new Error("Escolha a regra da previsão.");
    // Preserve existing forecasts unless the relevant rule/date was explicitly edited.
    const anchor = basis === "due" || basis === "due_15" ? "invoice_due_on" : "invoice_issued_on";
    const ruleChanged = changed.has("expected_basis") && basis !== original.expected_basis;
    const anchorChanged = changed.has(anchor) && merged[anchor] !== original[anchor];
    if (
      basis !== "manual" &&
      (ruleChanged || anchorChanged || (!entry.tracking && !merged.expected_on))
    )
      merged.expected_on = billingExpectedOn(
        basis,
        merged.invoice_issued_on,
        merged.invoice_due_on,
      );
    if (basis === "manual" && !merged.expected_on)
      throw new Error("Informe a previsão manual de recebimento.");
    const input: BillingFlowSaveInput = {
      entry,
      rule_type: row.rule,
      rule_value: value,
      net_invoice_amount: net,
      invoice_number: merged.invoice_number.trim() || null,
      invoice_issued_on: merged.invoice_issued_on || null,
      invoice_due_on: merged.invoice_due_on || null,
      expected_basis: basis,
      expected_on: merged.expected_on || null,
      received_on: merged.received_on || null,
      notes: merged.notes || null,
    };
    const saved = entry.tracking;
    const unchanged =
      saved &&
      Object.entries(input).every(
        ([key, val]) => key === "entry" || saved[key as keyof typeof saved] === val,
      );
    return unchanged ? [] : [input];
  });
}
