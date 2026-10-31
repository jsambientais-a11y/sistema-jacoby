export type FinanceKind = "payable" | "receivable";
export type FinanceAccount = {
  id: string;
  kind: FinanceKind;
  description: string;
  counterparty: string;
  category: string;
  cost_center_id?: string | null;
  bank_account_id?: string | null;
  amount_cents: number;
  due_on: string;
  settled_on: string | null;
  notes: string;
  deleted_at: string | null;
  updated_at: string;
};
export type FinanceRow = {
  id: string;
  kind: FinanceKind;
  description: string;
  counterparty: string;
  category: string;
  amountCents: number;
  dueOn: string | null;
  settledOn: string | null;
  source: "manual" | "billing";
  canSettle: boolean;
  costCenterId?: string | null;
  bankAccountId?: string | null;
  provisional?: boolean;
  manual?: FinanceAccount;
};
export function localFinanceToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parseFinanceMoney(text: string) {
  const normalized = text.trim().replace(/R\$/g, "").replace(/\s/g, "");
  if (!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(normalized))
    throw new Error("Informe um valor positivo em reais, por exemplo 1.500,00.");
  const [whole, fraction = ""] = normalized.replaceAll(".", "").split(",");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 1_000_000_000_000)
    throw new Error("Valor fora do limite permitido.");
  return cents;
}
export function financeStatus(row: FinanceRow, today: string) {
  return row.settledOn
    ? row.kind === "payable"
      ? "Pago"
      : "Recebido"
    : !row.dueOn
      ? "Sem previsão"
      : row.dueOn < today
        ? "Vencido"
        : row.kind === "payable"
          ? "A pagar"
          : "A receber";
}
export function summarizeFinance(rows: FinanceRow[]) {
  let expectedIn = 0,
    expectedOut = 0,
    received = 0,
    paid = 0;
  for (const r of rows) {
    if (r.kind === "receivable") {
      expectedIn += r.amountCents;
      if (r.settledOn) received += r.amountCents;
    } else {
      expectedOut += r.amountCents;
      if (r.settledOn) paid += r.amountCents;
    }
  }
  return {
    expectedIn,
    expectedOut,
    received,
    paid,
    openIn: expectedIn - received,
    openOut: expectedOut - paid,
    expectedNet: expectedIn - expectedOut,
    realizedNet: received - paid,
  };
}
export function manualFinanceRow(a: FinanceAccount): FinanceRow {
  return {
    id: `manual:${a.id}`,
    kind: a.kind,
    description: a.description,
    counterparty: a.counterparty,
    category: a.category,
    amountCents: Number(a.amount_cents),
    dueOn: a.due_on,
    settledOn: a.settled_on,
    source: "manual",
    canSettle: true,
    costCenterId: a.cost_center_id,
    bankAccountId: a.bank_account_id,
    manual: a,
  };
}
