import { useCreditCards } from "@/hooks/use-credit-cards";
import { useFinanceAccounts } from "@/hooks/use-finance-accounts";
import { aggregateCardInvoices } from "@/lib/credit-cards";
import { localFinanceToday } from "@/lib/enterprise-finance";
import { urgentPayables } from "@/lib/finance-access";

// Fonte única dos avisos: faturas entram pelo saldo em aberto, nunca compra a compra.
export function usePayableAlerts() {
  const accounts = useFinanceAccounts();
  const credit = useCreditCards();
  const today = localFinanceToday();
  const items = [
    ...(accounts.data || []).filter((a) => !a.credit_card_id),
    ...aggregateCardInvoices(accounts.data || [], credit.cards.data || []).map((r) => ({
      id: r.id,
      kind: r.kind,
      description: r.description,
      counterparty: r.counterparty,
      amount_cents: r.amountCents - (r.paidCents || 0),
      due_on: r.dueOn!,
      settled_on: r.settledOn,
      deleted_at: null,
    })),
  ];
  const urgent = urgentPayables(items, today);
  return {
    urgent,
    today,
    overdueCount: urgent.filter((a) => a.due_on < today).length,
    dueTodayCount: urgent.filter((a) => a.due_on === today).length,
    totalCents: urgent.reduce((sum, a) => sum + Number(a.amount_cents), 0),
    isLoading: accounts.isLoading || credit.cards.isLoading,
    isFetching: accounts.isFetching || credit.cards.isFetching,
    error: accounts.error || credit.cards.error,
    refetch: () => Promise.all([accounts.refetch(), credit.cards.refetch()]),
  };
}
