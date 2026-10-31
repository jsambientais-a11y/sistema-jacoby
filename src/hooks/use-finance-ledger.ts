import { useFinanceAccounts } from "./use-finance-accounts";
import { useBillingFlowData } from "./use-billing-flow";
import { useReceiptDetails } from "./use-receipt-details";
import { toReceivable } from "@/lib/receivables";
import { billingAgreement } from "@/lib/billing-agreement";
import { manualFinanceRow, localFinanceToday, type FinanceRow } from "@/lib/enterprise-finance";
export function useFinanceLedger() {
  const accounts = useFinanceAccounts();
  const flow = useBillingFlowData();
  const details = useReceiptDetails();
  const metadata = new Map(details.data?.map((d) => [d.entry_id, d]));
  const today = localFinanceToday();
  const rows: FinanceRow[] = [
    ...(accounts.data || []).filter((a) => !a.deleted_at).map(manualFinanceRow),
    ...flow.billingFlowEntries.map((entry) => {
      const r = toReceivable(entry, today, billingAgreement(entry).requiresAgreement);
      const d = metadata.get(entry.id);
      return {
        id: `billing:${r.id}`,
        kind: "receivable" as const,
        description: `BM ${entry.bulletin} · ${entry.description}`,
        counterparty: entry.client,
        category: "Faturamento",
        amountCents: Math.round(r.amount * 100),
        dueOn: r.expectedOn || r.invoiceDueOn,
        settledOn: r.receivedOn,
        source: "billing" as const,
        canSettle: r.canSettle,
        provisional: !r.confirmed,
        costCenterId: d?.cost_center_id,
        bankAccountId: d?.bank_account_id,
      };
    }),
  ];
  const queries = [
    accounts,
    details,
    flow.servicesQuery,
    flow.movementCommissionsQuery,
    flow.cyclesQuery,
    flow.directBillingDataQuery,
    flow.billingTrackingQuery,
    flow.companiesQuery,
    flow.branchesQuery,
  ];
  return {
    rows,
    isLoading: queries.some((q) => q.isLoading),
    error: queries.find((q) => q.error)?.error,
  };
}
