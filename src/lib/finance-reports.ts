import type { FinanceRow } from "./enterprise-finance";
export type BankBalance = {
  id: string;
  name: string;
  active: boolean;
  opening_balance_cents?: number | null;
  opening_on?: string | null;
};
export function parseBankBalance(text: string) {
  const value = text.trim();
  const negative = value.startsWith("-");
  const unsigned = (negative ? value.slice(1) : value).replace(/\s|R\$/g, "");
  if (!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(unsigned))
    throw new Error("Informe o saldo em reais, por exemplo 1.500,00 ou -250,00.");
  const [whole, fraction = ""] = unsigned.replaceAll(".", "").split(",");
  const cents = (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) * (negative ? -1 : 1);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 1e12)
    throw new Error("Saldo fora do limite permitido.");
  return cents;
}
export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Selecione um mês válido.");
  const [y, m] = month.split("-").map(Number);
  return { start: `${month}-01`, end: `${month}-${new Date(y, m, 0, 12).getDate()}` };
}
const signed = (r: FinanceRow) => (r.kind === "receivable" ? r.amountCents : -r.amountCents);
export function bankMonthlyBalance(
  bank: BankBalance,
  rows: FinanceRow[],
  month: string,
  today: string,
) {
  const { start, end } = monthBounds(month);
  const reference = bank.opening_on;
  const opening = bank.opening_balance_cents;
  if (!reference || opening == null || reference > end)
    return {
      available: false,
      opening: null,
      current: null,
      projected: null,
      overdue: 0,
      provisional: 0,
    };
  const assigned = rows.filter((r) => r.bankAccountId === bank.id);
  const actual = assigned.filter(
    (r) => r.settledOn && r.settledOn >= reference && r.settledOn <= end && r.settledOn <= today,
  );
  const before = actual.filter((r) => r.settledOn! < start).reduce((s, r) => s + signed(r), 0);
  const pending =
    end < today ? [] : assigned.filter((r) => !r.settledOn && r.dueOn && r.dueOn <= end);
  const current = Number(opening) + actual.reduce((s, r) => s + signed(r), 0);
  return {
    available: true,
    opening: reference <= start ? Number(opening) + before : null,
    current,
    projected: current + pending.reduce((s, r) => s + signed(r), 0),
    overdue: pending.filter((r) => r.dueOn! < start).length,
    provisional: pending.filter((r) => r.provisional).length,
  };
}
export function costCenterMonthly(rows: FinanceRow[], month: string) {
  const { start, end } = monthBounds(month);
  const result = new Map<
    string,
    { id: string; received: number; paid: number; pendingIn: number; pendingOut: number }
  >();
  for (const row of rows) {
    const date = row.settledOn || row.dueOn;
    if (!date || date < start || date > end) continue;
    const id = row.costCenterId || "none";
    const group = result.get(id) || { id, received: 0, paid: 0, pendingIn: 0, pendingOut: 0 };
    if (row.settledOn) {
      if (row.kind === "receivable") group.received += row.amountCents;
      else group.paid += row.amountCents;
    } else {
      if (row.kind === "receivable") group.pendingIn += row.amountCents;
      else group.pendingOut += row.amountCents;
    }
    result.set(id, group);
  }
  return [...result.values()];
}
