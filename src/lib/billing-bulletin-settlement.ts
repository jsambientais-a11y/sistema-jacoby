import type { BillingFlowEntry, BillingFlowSaveInput } from "@/components/BillingFlowPreview";
import type { Receivable } from "./receivables";
import { settlementInput } from "./receivables";
import { billingAgreement } from "./billing-agreement";
import { validBillingDate } from "./billing-dates";

export function prepareBulletinSettlement(
  rows: Receivable<BillingFlowEntry>[],
  receivedOn: string,
  today: string,
): BillingFlowSaveInput[] {
  if (!validBillingDate(receivedOn) || receivedOn > today)
    throw new Error("Informe uma data de recebimento válida, até hoje.");
  if (new Set(rows.map((row) => row.entry.cycleId)).size > 1)
    throw new Error("Dê baixa em um BM por vez.");
  return [...new Map(rows.map((row) => [row.id, row])).values()].flatMap((row) => {
    if (row.status === "received") return [];
    // An attachment alone has no financial source. It remains pending for review.
    if (row.entry.pendingService || Math.round(row.amount * 100) === 0) return [];
    const values = settlementInput(
      row.entry,
      receivedOn,
      billingAgreement(row.entry).requiresAgreement,
    );
    if (!row.canSettle || !values || !Number.isFinite(row.amount) || row.amount < 0)
      throw new Error(
        "Confira os valores de todas as categorias no Faturamento antes de baixar o BM.",
      );
    return [{ entry: row.entry, ...values }];
  });
}
