import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/AppShell";
import { isoRemoteEnabled } from "@/lib/iso-remote";
import { IsoShell } from "@/components/iso/IsoShell";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, isClient } = useAuth();
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
  if (isIso)
    return (
      <IsoShell>
        <Outlet />
      </IsoShell>
    );
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
