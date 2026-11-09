import { createFileRoute } from "@tanstack/react-router";
import { WasteManagementModule } from "@/components/WasteManagementModule";

/** Client-safe read-only report area. Database policies expose published reports only. */
type WasteSearch = { aba?: "relatorios" | "faturamento" | "faturamento2" | "configuracoes" };
export const Route = createFileRoute("/_app/portal/residuos")({
  component: ClientResidueReportsPage,
  validateSearch: (search: Record<string, unknown>): WasteSearch => ({
    aba: ["relatorios", "faturamento", "faturamento2", "configuracoes"].includes(String(search.aba))
      ? search.aba as WasteSearch["aba"] : undefined,
  }),
});
function ClientResidueReportsPage() { return <WasteManagementModule portal />; }
