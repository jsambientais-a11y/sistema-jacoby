/**
 * Contas a receber da aba Financeiro, derivadas dos lançamentos do Faturamento
 * (BM × categoria × empresa). A baixa grava em billing_receivable_tracking, o mesmo
 * registro usado pelo Faturamento, preservando o que já foi conferido lá.
 */
type Tracking = {
  rule_type: "percent" | "fixed";
  rule_value: number;
  net_invoice_amount: number | null;
  commission_amount: number;
  invoice_number: string | null;
  invoice_issued_on: string | null;
  invoice_due_on: string | null;
  expected_basis: "issue" | "due" | "manual";
  expected_on: string | null;
  received_on: string | null;
  notes: string | null;
};
export type ReceivableEntry = {
  id: string;
  cycleId: string;
  companyId: string | null;
  category: string;
  bulletin: string;
  client: string;
  branch: string;
  company: string;
  description: string;
  baseAmount: number;
  currentCommission: number;
  pendingService?: boolean;
  tracking?: Tracking;
  legacyInvoiceNumber?: string | null;
  legacyIssuedOn?: string | null;
  legacyDueOn?: string | null;
  legacyExpectedOn?: string | null;
  legacyPaidOn?: string | null;
};
export type ReceivableStatus = "overdue" | "due_soon" | "upcoming" | "no_date" | "received";
export type Receivable<E extends ReceivableEntry = ReceivableEntry> = {
  id: string;
  entry: E;
  amount: number;
  /** true quando o valor já foi conferido no Faturamento. */
  confirmed: boolean;
  expectedOn: string | null;
  invoiceNumber: string | null;
  invoiceDueOn: string | null;
  receivedOn: string | null;
  status: ReceivableStatus;
  /** false quando é preciso conferir o repasse no Faturamento antes da baixa. */
  canSettle: boolean;
};

const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function toReceivable<E extends ReceivableEntry>(entry: E, today: string, requiresAgreement: boolean): Receivable<E> {
  const saved = entry.tracking;
  const receivedOn = saved ? saved.received_on : entry.legacyPaidOn ?? null;
  const expectedOn = saved ? saved.expected_on : entry.legacyExpectedOn ?? null;
  const received = Boolean(receivedOn && receivedOn <= today);
  const status: ReceivableStatus = received ? "received"
    : !expectedOn ? "no_date"
    : expectedOn < today ? "overdue"
    : expectedOn <= addDays(today, 7) ? "due_soon"
    : "upcoming";
  return {
    id: entry.id,
    entry,
    amount: Number(saved ? saved.commission_amount : entry.currentCommission) || 0,
    confirmed: Boolean(saved),
    expectedOn,
    invoiceNumber: saved ? saved.invoice_number : entry.legacyInvoiceNumber ?? null,
    invoiceDueOn: saved ? saved.invoice_due_on : entry.legacyDueOn ?? null,
    receivedOn: received ? receivedOn : null,
    status,
    canSettle: Boolean(saved) || (!entry.pendingService && !requiresAgreement),
  };
}

const STATUS_RANK: Record<ReceivableStatus, number> = { overdue: 0, due_soon: 1, upcoming: 2, no_date: 3, received: 4 };

/** Vencidos no topo; depois por previsão; sem previsão; recebidos por último (mais recentes primeiro). */
export function sortReceivables<R extends Receivable>(list: R[]): R[] {
  return [...list].sort((a, b) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    (a.status === "received"
      ? String(b.receivedOn).localeCompare(String(a.receivedOn))
      : String(a.expectedOn || "").localeCompare(String(b.expectedOn || ""))) ||
    b.amount - a.amount);
}

export function summarizeReceivables(list: Receivable[], today: string) {
  const sum = (items: Receivable[]) => round2(items.reduce((total, item) => total + item.amount, 0));
  const open = list.filter((item) => item.status !== "received");
  const month = today.slice(0, 7);
  return {
    open: sum(open),
    overdue: sum(open.filter((item) => item.status === "overdue")),
    nextSevenDays: sum(open.filter((item) => item.status === "due_soon")),
    receivedThisMonth: sum(list.filter((item) => item.status === "received" && String(item.receivedOn).slice(0, 7) === month)),
    withoutDate: open.filter((item) => item.status === "no_date").length,
  };
}

/**
 * Campos para gravar a baixa (ou desfazê-la com receivedOn = null) no registro de conferência.
 * Retorna null quando o repasse ainda precisa ser conferido no Faturamento.
 */
export function settlementInput(entry: ReceivableEntry, receivedOn: string | null, requiresAgreement: boolean) {
  const saved = entry.tracking;
  if (saved) {
    return {
      rule_type: saved.rule_type,
      rule_value: saved.rule_value,
      net_invoice_amount: saved.net_invoice_amount,
      invoice_number: saved.invoice_number,
      invoice_issued_on: saved.invoice_issued_on,
      invoice_due_on: saved.invoice_due_on,
      expected_basis: saved.expected_basis,
      expected_on: saved.expected_on,
      received_on: receivedOn,
      notes: saved.notes,
    };
  }
  if (entry.pendingService || requiresAgreement) return null;
  return {
    rule_type: "fixed" as const,
    rule_value: round2(Number(entry.currentCommission) || 0),
    net_invoice_amount: null,
    invoice_number: entry.legacyInvoiceNumber || null,
    invoice_issued_on: entry.legacyIssuedOn || null,
    invoice_due_on: entry.legacyDueOn || null,
    expected_basis: entry.legacyExpectedOn ? ("manual" as const) : ("issue" as const),
    expected_on: entry.legacyExpectedOn || null,
    received_on: receivedOn,
    notes: null,
  };
}

export type ReceivableDetail = { label: string; formula: string; value: number };
export type ReceivableSources = {
  movementCommissions: { cycle_id: string; outsourced_company_id: string; source_type: string; waste_residue_id: string | null; execution_date: string | null; base_amount: number; commission_rate: number; gross_commission_amount: number; tax_withheld_amount: number; net_commission_amount: number }[];
  services: { cycle_id: string; outsourced_company_id: string | null; waste_service_id: string | null; amount: number; net_invoice_amount: number | null; commission_rate: number; invoice_number: string | null; execution_date: string | null; description: string | null }[];
  placements: { cycle_id: string; quantity: number; monthly_rental_rate: number }[];
  movements: { cycle_id: string; confirmed: boolean; removed_quantity: number; weight_kg: number; exchange_rate: number; treatment_rate: number; waste_residue_id: string | null; occurred_on?: string | null; service_order?: string | null }[];
  directServices: { cycle_id: string; amount: number; waste_service_id?: string | null }[];
  residues: { id: string; name?: string; jacoby_pays_client?: boolean }[];
  catalog: { id: string; name?: string }[];
};

const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const brlUnit = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value || 0);
const qty = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value || 0);
const dateBr = (value?: string | null) => (value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)} · ` : "");

/** Explica, item a item, de onde vem o valor de um lançamento do Financeiro. */
export function receivableDetails(entry: ReceivableEntry, sources: ReceivableSources): ReceivableDetail[] {
  const residue = (id: string | null) => sources.residues.find((item) => item.id === id);
  const serviceName = (id?: string | null) => sources.catalog.find((item) => item.id === id)?.name || "Serviço";
  const sameCycle = <T extends { cycle_id: string }>(list: T[]) => list.filter((item) => item.cycle_id === entry.cycleId);

  if (entry.companyId && entry.category === "service") {
    return sameCycle(sources.services).filter((item) => item.outsourced_company_id === entry.companyId).map((item) => {
      const base = Number(item.net_invoice_amount ?? item.amount ?? 0);
      const rate = Number(item.commission_rate || 0);
      return {
        label: `${dateBr(item.execution_date)}${serviceName(item.waste_service_id)}${item.invoice_number ? ` · NF ${item.invoice_number}` : ""}`,
        formula: `${brl(base)} (${item.net_invoice_amount != null ? "líquido da NF" : "valor do serviço"}) × ${qty(rate)}%`,
        value: round2(base * rate / 100),
      };
    });
  }
  if (entry.companyId) {
    return sameCycle(sources.movementCommissions)
      .filter((item) => item.outsourced_company_id === entry.companyId && item.source_type === entry.category)
      .sort((a, b) => String(a.execution_date).localeCompare(String(b.execution_date)))
      .map((item) => {
        const what = item.source_type === "treatment" ? `Tratamento de ${residue(item.waste_residue_id)?.name || "resíduo"}` : item.source_type === "exchange" ? "Troca de equipamento" : "Locação de equipamento";
        const tax = Number(item.tax_withheld_amount || 0);
        const gross = Number(item.gross_commission_amount || 0);
        const rate = Number(item.commission_rate || 0);
        // No tratamento a comissão é R$/kg: o peso vem da própria comissão (bruto ÷ taxa).
        const base = item.source_type === "treatment"
          ? `${rate ? `${qty(gross / rate)} kg × ` : ""}${brlUnit(rate)}/kg = ${brl(gross)} (tratamento no BM: ${brl(Number(item.base_amount))})`
          : `${brl(Number(item.base_amount))} × ${qty(rate)}% = ${brl(gross)}`;
        return {
          label: `${dateBr(item.execution_date)}${what}`,
          formula: `${base}${tax ? ` − retenção ${brl(tax)}` : ""}`,
          value: Number(item.net_commission_amount || 0),
        };
      });
  }
  const confirmed = sameCycle(sources.movements).filter((item) => item.confirmed);
  const movementLabel = (item: ReceivableSources["movements"][number], text: string) =>
    `${dateBr(item.occurred_on)}${text}${item.service_order ? ` · OS ${item.service_order}` : ""}`;
  if (entry.category === "rental") {
    return sameCycle(sources.placements).map((item) => ({
      label: "Locação de equipamento",
      formula: `${qty(Number(item.quantity))} un. × ${brlUnit(Number(item.monthly_rental_rate))}/mês`,
      value: round2(Number(item.quantity || 0) * Number(item.monthly_rental_rate || 0)),
    }));
  }
  if (entry.category === "exchange") {
    return confirmed.filter((item) => Number(item.removed_quantity || 0) > 0 && Number(item.exchange_rate || 0) > 0).map((item) => ({
      label: movementLabel(item, "Troca de equipamento"),
      formula: `${qty(Number(item.removed_quantity))} troca(s) × ${brlUnit(Number(item.exchange_rate))}`,
      value: round2(Number(item.removed_quantity || 0) * Number(item.exchange_rate || 0)),
    }));
  }
  if (entry.category === "treatment") {
    return confirmed.filter((item) => Number(item.weight_kg || 0) > 0 && Number(item.treatment_rate || 0) > 0).map((item) => {
      const info = residue(item.waste_residue_id);
      const value = round2(Number(item.weight_kg || 0) * Number(item.treatment_rate || 0));
      // Sucata comprada do cliente é paga pela Jacoby: entra abatendo o total.
      return info?.jacoby_pays_client
        ? { label: movementLabel(item, `Sucata comprada do cliente (${info.name || "sucata"}) · abatida`), formula: `${qty(Number(item.weight_kg))} kg × ${brlUnit(Number(item.treatment_rate))}/kg`, value: -value }
        : { label: movementLabel(item, `Tratamento de ${info?.name || "resíduo"}`), formula: `${qty(Number(item.weight_kg))} kg × ${brlUnit(Number(item.treatment_rate))}/kg`, value };
    });
  }
  return sameCycle(sources.directServices).map((item) => ({
    label: serviceName(item.waste_service_id),
    formula: "Serviço lançado no BM",
    value: Number(item.amount || 0),
  }));
}

/** Filtro de datas do Financeiro e do Faturamento. */
export type Period = { kind: "all" } | { kind: "month"; month: string } | { kind: "range"; from: string; to: string };

export function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split("-").map(Number);
  const index = year * 12 + (value - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Sem período tudo entra; com período, só o que tem data dentro dele. */
export function inPeriod(date: string | null | undefined, period: Period) {
  if (period.kind === "all") return true;
  if (!date) return false;
  const day = date.slice(0, 10);
  if (period.kind === "month") return day.slice(0, 7) === period.month;
  return (!period.from || day >= period.from) && (!period.to || day <= period.to);
}

/** Data que posiciona o valor no tempo: quando foi recebido ou, se ainda não foi, a previsão. */
export const referenceDate = (item: Receivable) => item.receivedOn ?? item.expectedOn;

/** Quanto está previsto (em aberto) e quanto foi recebido em cada mês. */
export function monthlyTotals(list: Receivable[], months: string[]) {
  return months.map((month) => ({
    month,
    expected: round2(list.filter((item) => item.status !== "received" && item.expectedOn?.slice(0, 7) === month).reduce((total, item) => total + item.amount, 0)),
    received: round2(list.filter((item) => item.status === "received" && item.receivedOn?.slice(0, 7) === month).reduce((total, item) => total + item.amount, 0)),
  }));
}
