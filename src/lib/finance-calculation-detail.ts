import type { BillingFlowEntry } from "@/components/BillingFlowPreview";
export type FinanceCalculationDetail = {
  category: string;
  invoiceNumber: string | null;
  baseCents: number | null;
  baseOrigin: string;
  rule: string;
};
const categories: Record<string, string> = {
  rental: "Locação",
  exchange: "Troca",
  treatment: "Tratamento",
  service: "Serviços",
};
const cents = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value)) ? null : Math.round(Number(value) * 100);
/** Per-entry evidence only. Never sum or deduplicate invoice bases. */
export function financeCalculationDetail(entry: BillingFlowEntry): FinanceCalculationDetail {
  const saved = entry.tracking;
  const common = {
    category: categories[entry.category] || entry.category,
    invoiceNumber: saved ? saved.invoice_number : entry.legacyInvoiceNumber || null,
  };
  if (!saved)
    return {
      ...common,
      baseCents: entry.pendingService ? null : cents(entry.baseAmount),
      baseOrigin: entry.pendingService
        ? "Ausente · serviço pendente"
        : "Estimada · cálculo atual do BM",
      rule: "Regra ainda não conferida",
    };
  if (saved.rule_type === "fixed")
    return {
      ...common,
      baseCents: cents(saved.net_invoice_amount),
      baseOrigin:
        saved.net_invoice_amount == null
          ? "Ausente · acordo fixo independe da base"
          : "Informada · líquido da categoria; não calcula o acordo fixo",
      rule: "Valor fixo",
    };
  return {
    ...common,
    baseCents: cents(saved.net_invoice_amount ?? saved.base_amount_snapshot),
    baseOrigin:
      saved.net_invoice_amount == null
        ? "Histórica · base do BM salva; líquido não informado"
        : "Informada · líquido da categoria",
    rule: `Percentual: ${saved.rule_value}%`,
  };
}
