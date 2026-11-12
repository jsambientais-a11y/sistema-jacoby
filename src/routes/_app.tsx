import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { OverduePayablesAlert } from "@/components/OverduePayablesAlert";
import { AppShell } from "@/components/AppShell";
import { ClientImpersonationBanner } from "@/components/ClientImpersonationBanner";
import { useQuery } from "@tanstack/react-query";
import { getClientIsoWorkspaceId, isoRemoteEnabled } from "@/lib/iso-remote";
import { IsoShell } from "@/components/iso/IsoShell";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, isClient, hasPermission } = useAuth();
  const search = useRouterState({ select: (state) => state.location.search }) as { aba?: string; authorization_id?: string };
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isIso = pathname === "/iso" || pathname.startsWith("/iso/");
  const clientIso = useQuery({
    queryKey: ["client-iso-workspace", user?.id],
    queryFn: getClientIsoWorkspaceId,
    enabled: Boolean(user && isClient && !loading),
    retry: false,
    staleTime: 30_000,
  });
  const clientIsoId = !clientIso.isError ? clientIso.data ?? undefined : undefined;
  // A prévia ISO usa apenas dados deste navegador. Deixe-a acessível no Vite
  // para revisão visual sem alterar a autenticação do sistema publicado.
  if (import.meta.env.DEV && isIso && !isoRemoteEnabled && !user)
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
  if (!user) return <Navigate to="/auth" search={{ autorizacao: pathname === "/integracoes-chatgpt" ? search.authorization_id : undefined }} />;
  // O cliente começa pela consulta operacional e navega somente nas áreas do portal.
  if (isClient && isIso && clientIso.isPending)
    return <div className="p-8 text-sm">Verificando acesso ao ISO…</div>;
  if (isClient && !pathname.startsWith("/portal/") && !(isIso && clientIsoId))
    return <Navigate to="/portal/movimentacoes" replace />;
  if (
    [
      "/financeiro",
      "/contas-a-receber",
      "/contas-a-pagar",
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
        <IsoShell
          key={clientIsoId ?? "internal"}
          clientWorkspaceId={isClient ? clientIsoId : undefined}
        >
          <Outlet />
        </IsoShell>
        <ClientImpersonationBanner />
      </>
    );
  return (
    <AppShell showClientIso={isClient && Boolean(clientIsoId)}>
      <OverduePayablesAlert />
      <Outlet />
      <ClientImpersonationBanner />
    </AppShell>
  );
}
