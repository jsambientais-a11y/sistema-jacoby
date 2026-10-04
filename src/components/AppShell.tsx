/**
 * Moldura compartilhada das telas internas: menu, identidade Jacoby, tema e notificações.
 * Não contém regras de uma tela específica; novas áreas devem ser adicionadas em `allNav`.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useTasks } from "@/hooks/use-data";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  ListChecks,
  Users,
  Building2,
  Factory,
  Settings,
  LogOut,
  Moon,
  Sun,
  PanelLeft,
  PanelRight,
  Trash2,
  PanelsTopLeft,
  ChevronDown,
  FileText,
  Recycle,
  MapPinned,
  KeyRound,
  FolderOpen,
  AlertTriangle,
  ClipboardCheck,
  HandCoins,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { AssignmentPopup } from "@/components/AssignmentPopup";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import jacobyLogo from "@/assets/jacoby-logo.webp";
import jacobyLogoFull from "@/assets/jacoby-logo-transparent.png";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { FILES_OWNER_ID } from "@/lib/files-access";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  ownerOnly?: boolean;
  permission?: string;
  tab?: "faturamento2" | "configuracoes";
};
const allNav: readonly NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard" },
  { to: "/tasks", label: "Gestão de Projetos", icon: ListChecks, permission: "tasks" },
  { to: "/portal/residuos", label: "Faturamento", icon: Recycle, permission: "billing", tab: "faturamento2" },
  { to: "/clients", label: "Clientes", icon: Building2, permission: "clients" },
  { to: "/terceirizados", label: "Terceirizados", icon: Factory, permission: "outsourced" },
  { to: "/portal/documentos", label: "Documentos", icon: FileText, permission: "documents" },
  { to: "/arquivos", label: "Arquivos", icon: FolderOpen, adminOnly: true, ownerOnly: true },
  { to: "/portal", label: "Portal do Cliente", icon: PanelsTopLeft },
  { to: "/financeiro", label: "Financeiro", icon: HandCoins, permission: "billing" },
  { to: "/portal/residuos", label: "Configurações de movimentação", icon: Settings, permission: "movement_settings", tab: "configuracoes" },
  { to: "/users", label: "Usuários", icon: Users, adminOnly: true },
  { to: "/trash", label: "Lixeira", icon: Trash2, permission: "trash" },
  { to: "/settings", label: "Personalizar", icon: Settings, permission: "settings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, user, signOut, isAdmin, isClient, hasPermission } = useAuth();
  const nav = useMemo(() => {
    const visibleItems = allNav.filter(
      (item) =>
        (!item.adminOnly || isAdmin) &&
        (!item.ownerOnly || user?.id === FILES_OWNER_ID) &&
        (item.to === "/portal" ? isClient || hasPermission("portal_units") || hasPermission("portal_reports") : !item.permission || hasPermission(item.permission)),
    );
    // Para a equipe interna, o Portal do Cliente é um bloco auxiliar e fica no
    // fim do menu, depois de Personalizar. No perfil Cliente preservamos a
    // ordem original, pois o portal é a navegação principal desse usuário.
    if (isClient) return visibleItems;
    const portalItem = visibleItems.find((item) => item.to === "/portal");
    return portalItem
      ? [...visibleItems.filter((item) => item.to !== "/portal"), portalItem]
      : visibleItems;
  }, [isAdmin, isClient, hasPermission, user?.id]);

  useEffect(() => {
    if (isAdmin) void (supabase.rpc("jacoby_process_document_alerts") as any);
  }, [isAdmin, user?.id]);

  const { theme, toggle } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("sidebar-open");
    return stored === null ? true : stored === "true";
  });
  useEffect(() => {
    localStorage.setItem("sidebar-open", String(sidebarOpen));
  }, [sidebarOpen]);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeWasteTab = useRouterState({
    select: (s) => (s.location.search as { aba?: string }).aba,
  });
  const portalActive =
    pathname === "/portal/unidades" ||
    pathname === "/portal/conta" ||
    pathname === "/portal/documentos" ||
    pathname === "/portal/movimentacoes" ||
    pathname === "/portal/projetos" ||
    (pathname === "/portal/residuos" && activeWasteTab === "relatorios");
  const initials = (profile?.full_name || user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={`hidden shrink-0 flex-col text-sidebar-foreground transition-all duration-300 md:flex ${
          sidebarOpen ? "w-56" : "w-16 items-center"
        }`}
        style={{ background: "var(--gradient-sidebar)" }}
      >
        <div className={`jacoby-sidebar-brand ${sidebarOpen ? "px-4 py-5" : "px-2 py-5"}`}>
          {sidebarOpen ? (
            <>
              <img
                src={jacobyLogoFull}
                alt="Jacoby Soluções Ambientais"
                className="jacoby-sidebar-brand__full"
              />
              <span className="jacoby-sidebar-brand__caption">Gestão ambiental integrada</span>
            </>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-black">
              <img
                src={jacobyLogo}
                alt="Jacoby Soluções"
                className="h-full w-full object-contain"
              />
            </div>
          )}
        </div>

        <div className={`flex ${sidebarOpen ? "justify-end px-3" : "justify-center"} mb-2`}>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => setSidebarOpen((o) => !o)}
            title={sidebarOpen ? "Recolher menu" : "Expandir menu"}
          >
            {sidebarOpen ? <PanelLeft className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {nav.map((n) => {
            if (n.to === "/portal")
              return (
                <PortalNavGroup expanded={sidebarOpen} active={portalActive} isClient={isClient} hasPermission={hasPermission} />
              );
            const Active = n.tab
              ? pathname === n.to && activeWasteTab === n.tab
              : pathname === n.to || pathname.startsWith(n.to + "/");
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                search={n.tab ? { aba: n.tab } : undefined}
                className={`flex items-center gap-3 rounded-lg transition ${
                  sidebarOpen ? "px-3 py-2 text-sm" : "justify-center px-2 py-2 text-sm"
                } ${
                  Active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
                title={n.label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {sidebarOpen && <span className="truncate">{n.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div
          className={`border-t border-sidebar-border p-3 ${sidebarOpen ? "" : "flex flex-col items-center gap-2"}`}
        >
          <div
            className={`flex items-center gap-3 rounded-lg p-2 ${sidebarOpen ? "" : "flex-col"}`}
          >
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={profile?.avatar_url || undefined}
                alt={profile?.full_name || user?.email || "Usuário"}
              />
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            {sidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{profile?.full_name || user?.email}</p>
                <p className="truncate text-xs text-sidebar-foreground/60">{user?.email}</p>
              </div>
            )}
            <div className={`flex ${sidebarOpen ? "gap-1" : "flex-col gap-2"}`}>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={toggle}
                title={theme === "dark" ? "Modo claro" : "Modo escuro"}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={signOut}
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar toggle header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between bg-background border-b px-3 py-2">
        <Button size="icon" variant="ghost" onClick={() => setSidebarOpen((o) => !o)}>
          <PanelLeft className="h-5 w-5" />
        </Button>
        <span className="font-semibold">Jacoby</span>
        <NotificationBell />
      </div>

      {/* Mobile overlay sidebar */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="w-56 bg-background border-r flex flex-col"
            style={{ background: "var(--gradient-sidebar)" }}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black h-9 w-9">
                  <img
                    src={jacobyLogo}
                    alt="Jacoby Soluções"
                    className="h-full w-full object-contain"
                  />
                </div>
                <span className="text-lg font-semibold">Jacoby</span>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setSidebarOpen(false)}>
                <PanelLeft className="h-5 w-5" />
              </Button>
            </div>
            <nav className="flex-1 space-y-1 px-3">
              {nav.map((n) => {
                if (n.to === "/portal")
                  return (
                    <PortalNavGroup
                      expanded
                      active={portalActive}
                      isClient={isClient}
                      hasPermission={hasPermission}
                      onNavigate={() => setSidebarOpen(false)}
                    />
                  );
                const Active = n.tab
                  ? pathname === n.to && activeWasteTab === n.tab
                  : pathname === n.to || pathname.startsWith(n.to + "/");
                const Icon = n.icon;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    search={n.tab ? { aba: n.tab } : undefined}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      Active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-sidebar-border p-3">
              <div className="flex items-center gap-3 rounded-lg p-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={profile?.avatar_url || undefined}
                    alt={profile?.full_name || user?.email || "Usuário"}
                  />
                  <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {profile?.full_name || user?.email}
                  </p>
                  <p className="truncate text-xs text-sidebar-foreground/60">{user?.email}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={toggle}
                  title={theme === "dark" ? "Modo claro" : "Modo escuro"}
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={signOut}
                  title="Sair"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <main className="flex-1 overflow-x-hidden md:pt-0 pt-12">
        <div className="hidden md:flex sticky top-0 z-30 items-center justify-between px-4 py-2 bg-background/80 backdrop-blur border-b">
          {isAdmin || hasPermission("dashboard") ? <Link to="/dashboard" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-destructive transition hover:bg-destructive/10" title="Alertas de documentos"><AlertTriangle className="h-5 w-5" /></Link> : <span />}
          <NotificationBell />
        </div>
        {children}
      </main>
      <AssignmentPopup />
    </div>
  );
}

function PortalNavGroup({
  expanded,
  active,
  isClient,
  hasPermission,
  onNavigate,
}: {
  expanded: boolean;
  active: boolean;
  isClient: boolean;
  hasPermission: (permission: string) => boolean;
  onNavigate?: () => void;
}) {
  const { data: portalTasks = [] } = useTasks();
  const hasPendingRequests = isClient && portalTasks.some((task) => task.client_portal_visible && task.client_document_request && task.status !== "done");
  const item =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50";
  if (!expanded)
    return (
      <div
        title="Portal do Cliente"
        className={`flex justify-center rounded-lg px-2 py-2 ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground"}`}
      >
        <PanelsTopLeft className="h-4 w-4" />
      </div>
    );
  return (
    <Collapsible defaultOpen={active} className="space-y-1">
      <CollapsibleTrigger
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50"}`}
      >
        <PanelsTopLeft className="h-4 w-4" />
        <span className="flex-1 text-left">Portal do Cliente</span>
        <ChevronDown className="h-4 w-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 pl-4">
        {isClient && <Link to="/portal/movimentacoes" onClick={onNavigate} className={item}>
          <ClipboardCheck className="h-4 w-4" />
          Movimentações
        </Link>}
        {isClient && <Link to="/portal/projetos" onClick={onNavigate} className={item}>
          <ListChecks className="h-4 w-4" />
          Gestão de projetos
        </Link>}
        {isClient && <Link to="/portal/documentos" onClick={onNavigate} className={item}>
          <FileText className="h-4 w-4" />
          Documentos
        </Link>}
        {isClient && <Link to="/portal/entregas" onClick={onNavigate} className={item}>
          <ClipboardCheck className="h-4 w-4" />
          <span className="flex-1">Solicitações</span>
          {hasPendingRequests && <span className="h-2 w-2 rounded-full bg-destructive" aria-label="Há solicitações pendentes" />}
        </Link>}
        {isClient && <Link to="/portal/boletins" onClick={onNavigate} className={item}>
          <FileText className="h-4 w-4" />
          Boletins emitidos
        </Link>}
        {(isClient || hasPermission("portal_units")) && <Link to="/portal/unidades" onClick={onNavigate} className={item}>
          <MapPinned className="h-4 w-4" />
          Unidades e pátios
        </Link>}
        {(isClient || hasPermission("portal_reports")) && <Link
          to="/portal/residuos"
          search={{ aba: "relatorios" }}
          onClick={onNavigate}
          className={item}
        >
          Relatórios
        </Link>}
        {isClient && (
          <Link to="/portal/conta" onClick={onNavigate} className={item}>
            <KeyRound className="h-4 w-4" />
            Minha conta
          </Link>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
