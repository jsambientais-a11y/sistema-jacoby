import { createFileRoute } from "@tanstack/react-router";
import { FinanceRegistry } from "./centros-de-custo";
export const Route = createFileRoute("/_app/bancos")({ component: () => <FinanceRegistry bank /> });
