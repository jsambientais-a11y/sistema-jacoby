import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/despesas-recorrentes")({
  beforeLoad: () => {
    throw redirect({ to: "/contas-a-receber", search: { view: "payable" } });
  },
});
