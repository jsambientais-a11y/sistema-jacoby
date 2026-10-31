import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { OverduePayablesAlert } from "@/components/OverduePayablesAlert";
import { AppShell } from "@/components/AppShell";
import { isoRemoteEnabled } from "@/lib/iso-remote";
import { IsoShell } from "@/components/iso/IsoShell";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, isClient, hasPermission } = useAuth();
  const search = useRouterState({ select: (state) => state.location.search }) as { aba?: string };
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isIso = pathname === "/iso" || pathname.startsWith("/iso/");
  // A prévia ISO usa apenas dados deste navegador. Deixe-a acessível no Vite
  // para revisão visual sem alterar a autenticação do sistema publicado.
  if (import.meta.env.DEV && isIso && !isoRemoteEnabled)
    return (
      <IsoShell>
        <Outlet />
      </IsoShell>
    );
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" />;
  // O cliente começa pela consulta operacional e navega somente nas áreas do portal.
  if (isClient && !pathname.startsWith("/portal/"))
    return <Navigate to="/portal/movimentacoes" replace />;
  if (
    [
      "/financeiro",
      "/contas-a-receber",
      "/centros-de-custo",
      "/bancos",
      "/relatorios-financeiros",
      "/cartoes",
      "/despesas-recorrentes",
    ].some((p) => pathname === p || pathname.startsWith(p + "/")) &&
    !hasPermission("finance")
  )
    return <Navigate to="/dashboard" replace />;
  if (
    pathname === "/portal/residuos" &&
    ((search.aba === "configuracoes" && !hasPermission("movement_settings")) ||
      (search.aba === "faturamento" && !hasPermission("finance")))
  )
    return <Navigate to="/dashboard" replace />;
  if (isIso)
    return (
      <>
        <OverduePayablesAlert />
        <IsoShell>
          <Outlet />
        </IsoShell>
      </>
    );
  return (
    <AppShell>
      <OverduePayablesAlert />
      <Outlet />
    </AppShell>
  );
}
