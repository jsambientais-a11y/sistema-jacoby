import { createFileRoute } from "@tanstack/react-router";
import { EnterpriseFinance } from "@/components/EnterpriseFinance";

export const Route = createFileRoute("/_app/contas-a-pagar")({
  validateSearch: (search: Record<string, unknown>): { status?: "overdue" | "urgent" } => ({
    status: search.status === "overdue" || search.status === "urgent" ? search.status : undefined,
  }),
  component: PayablesPage,
});

function PayablesPage() {
  const { status } = Route.useSearch();
  return <EnterpriseFinance kind="payable" focus={status} />;
}
