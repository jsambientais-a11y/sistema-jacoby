export const RECURRENCE_FREQUENCIES = {
  weekly: "Semanal",
  fortnightly: "A cada 15 dias",
  monthly: "Mensal",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  yearly: "Anual",
} as const;
export type RecurrenceFrequency = keyof typeof RECURRENCE_FREQUENCIES;
export type FinanceRecurrence = {
  credit_card_id?: string | null;
  id: string;
  description: string;
  counterparty: string;
  category: string;
  amount_cents: number;
  frequency: RecurrenceFrequency;
  start_on: string;
  end_on: string | null;
  cost_center_id: string | null;
  bank_account_id: string | null;
  notes: string;
  active: boolean;
  updated_at: string;
};
export function recurrenceDue(start: string, frequency: RecurrenceFrequency, index: number) {
  const [y, m, d] = start.split("-").map(Number);
  if (!Number.isInteger(index) || index < 0) throw new Error("Ocorrência inválida.");
  let date: Date;
  if (frequency === "weekly" || frequency === "fortnightly") {
    date = new Date(y, m - 1, d + index * (frequency === "weekly" ? 7 : 15), 12);
  } else {
    const steps = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12 };
    const target = new Date(y, m - 1 + steps[frequency] * index, 1, 12);
    date = new Date(
      target.getFullYear(),
      target.getMonth(),
      Math.min(d, new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate()),
      12,
    );
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function recurrencePreview(
  start: string,
  frequency: RecurrenceFrequency,
  end: string | null,
  count = 4,
) {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const date = recurrenceDue(start, frequency, i);
    if (end && date > end) break;
    out.push(date);
  }
  return out;
}

export type InlineRecurrence = {
  enabled: boolean;
  frequency: RecurrenceFrequency;
  end_on: string;
  scope: "one" | "future";
  rule_updated_at?: string;
};
export function inlineRecurrence(rule?: FinanceRecurrence): InlineRecurrence {
  return {
    enabled: rule?.active ?? false,
    frequency: rule?.frequency || "monthly",
    end_on: rule?.end_on || "",
    scope: "one",
    rule_updated_at: rule?.updated_at,
  };
}
