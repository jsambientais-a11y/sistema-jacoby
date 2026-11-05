import { createFileRoute } from "@tanstack/react-router";
import { EnterpriseFinance } from "@/components/EnterpriseFinance";

export const Route = createFileRoute("/_app/contas-a-pagar")({
  validateSearch: (search: Record<string, unknown>): { status?: "overdue" } => ({
    status: search.status === "overdue" ? "overdue" : undefined,
  }),
  component: PayablesPage,
});

function PayablesPage() {
  const { status } = Route.useSearch();
  return <EnterpriseFinance kind="payable" overdue={status === "overdue"} />;
}
