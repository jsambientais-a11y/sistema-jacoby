export type CreditCard = {
  id: string;
  name: string;
  bank_label: string;
  theme: string;
  last_four: string;
  closing_day: number;
  due_day: number;
  limit_cents: number | null;
  bank_account_id: string | null;
  active: boolean;
  updated_at: string;
};
export type CardPurchase = {
  id: string;
  card_id: string;
  description: string;
  merchant: string;
  category: string;
  amount_cents: number;
  purchased_on: string;
  installments: number;
  first_invoice_month: string;
  cost_center_id: string | null;
  notes: string;
  deleted_at: string | null;
  updated_at: string;
};
export const CARD_BANKS = [
  { name: "Itaú", theme: "itau", color: "#ea580c", mark: "itaú" },
  { name: "Inter", theme: "inter", color: "#f97316", mark: "inter" },
  { name: "Nubank", theme: "nubank", color: "#7e22ce", mark: "nu" },
  { name: "Santander", theme: "santander", color: "#dc2626", mark: "S" },
  { name: "Bradesco", theme: "bradesco", color: "#b91c1c", mark: "B" },
  { name: "Banco do Brasil", theme: "bb", color: "#1d4ed8", mark: "BB" },
  { name: "Caixa", theme: "caixa", color: "#0369a1", mark: "CAIXA" },
  { name: "Outro banco", theme: "other", color: "#334155", mark: "●" },
] as const;
export const cardMoney = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
export function cardDate(month: string, day: number) {
  const [y, m] = month.split("-").map(Number);
  const d = Math.min(day, new Date(y, m, 0, 12).getDate());
  return `${month}-${String(d).padStart(2, "0")}`;
}
export function shiftCardMonth(month: string, offset: number) {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(y, m - 1 + offset, 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
export function firstCardInvoice(purchasedOn: string, closingDay: number, dueDay: number) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(purchasedOn) ||
    closingDay < 1 ||
    closingDay > 31 ||
    dueDay < 1 ||
    dueDay > 31
  )
    throw new Error("Datas do cartão inválidas.");
  const month = purchasedOn.slice(0, 7);
  let offset = purchasedOn > cardDate(month, closingDay) ? 1 : 0;
  if (dueDay <= closingDay) offset++;
  return shiftCardMonth(month, offset);
}
export function splitCardInstallments(cents: number, count: number) {
  if (
    !Number.isSafeInteger(cents) ||
    cents < 1 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 60 ||
    cents < count
  )
    throw new Error("Valor ou parcelamento inválido.");
  const base = Math.floor(cents / count),
    extra = cents % count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

export function aggregateCardInvoices(
  accounts: import("./enterprise-finance").FinanceAccount[],
  cards: CreditCard[],
): import("./enterprise-finance").FinanceRow[] {
  const groups = new Map<string, import("./enterprise-finance").FinanceAccount[]>();
  for (const a of accounts) {
    if (a.deleted_at || !a.credit_card_id || !a.invoice_month) continue;
    const key = `${a.credit_card_id}:${a.invoice_month}`;
    groups.set(key, [...(groups.get(key) || []), a]);
  }
  return [...groups.entries()].map(([key, items]) => {
    const first = items[0],
      card = cards.find((c) => c.id === first.credit_card_id);
    const paid = items.filter((a) => a.settled_on);
    return {
      id: `card:${key}`,
      kind: "payable",
      description: `Fatura ${card?.name || "Cartão"} · ${first.invoice_month!.slice(0, 7).split("-").reverse().join("/")}`,
      counterparty: card?.bank_label || "Cartão de crédito",
      category: "Fatura do cartão",
      amountCents: items.reduce((s, a) => s + Number(a.amount_cents), 0),
      paidCents: paid.reduce((s, a) => s + Number(a.amount_cents), 0),
      dueOn: first.due_on,
      settledOn:
        paid.length === items.length
          ? paid
              .map((a) => a.settled_on!)
              .sort()
              .at(-1)!
          : null,
      source: "card",
      canSettle: false,
      cardId: first.credit_card_id!,
      invoiceMonth: first.invoice_month!.slice(0, 7),
      bankAccountId: items.every((a) => a.bank_account_id === first.bank_account_id)
        ? first.bank_account_id
        : null,
    };
  });
}
