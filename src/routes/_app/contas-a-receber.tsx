import { createFileRoute, redirect } from "@tanstack/react-router";
import { EnterpriseFinance } from "@/components/EnterpriseFinance";

export const Route = createFileRoute("/_app/contas-a-receber")({
  validateSearch: (search: Record<string, unknown>): { view?: "payable"; status?: "overdue" } => ({
    view: search.view === "payable" ? "payable" : undefined,
    status: search.status === "overdue" ? "overdue" : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.view === "payable") {
      throw redirect({ to: "/contas-a-pagar", search: { status: search.status }, replace: true });
    }
  },
  component: () => <EnterpriseFinance kind="receivable" />,
});
