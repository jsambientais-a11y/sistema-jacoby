import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode, type FormEvent } from "react";
import {
  CalendarDays,
  CheckSquare2,
  ClipboardList,
  FileCheck2,
  Menu,
  Plus,
  TriangleAlert,
  LayoutDashboard,
  ListChecks,
  FileText,
  BookOpen,
  Library,
  Sparkles,
  History,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { EnvironmentSwitch } from "@/components/EnvironmentSwitch";
import { IsoWorkspace, useIsoWorkspace, type IsoAudit } from "./IsoWorkspace";
import jacobyLogo from "@/assets/jacoby-symbol.svg";

const links = [
  { title: "Kit Pré-Auditoria", url: "/iso", icon: CheckSquare2 },
  { title: "Plano de Auditoria", url: "/iso/plano", icon: CalendarDays },
  { title: "Roteiros de Entrevista", url: "/iso/roteiros", icon: ClipboardList },
];
const nextLinks = [
  {
    section: "2. Auditar",
    title: "Biblioteca de Evidências",
    url: "/iso/evidencias",
    icon: FileCheck2,
  },
  {
    section: "3. Registrar",
    title: "Banco de NCs",
    url: "/iso/nao-conformidades",
    icon: TriangleAlert,
  },
  { section: "4. Tratar", title: "Planos de Ação (PAC)", url: "/iso/pac", icon: ListChecks },
  {
    section: "5. Entregar",
    title: "Relatório de Auditoria",
    url: "/iso/relatorio",
    icon: FileText,
  },
];
const supportLinks = [
  { title: "Manual de Uso", url: "/iso/manual", icon: BookOpen },
  { title: "Prompts de IA", url: "/iso/prompts-ia", icon: Sparkles },
  { title: "Minha biblioteca", url: "/iso/biblioteca", icon: Library },
  { title: "Log do Auditor", url: "/iso/log-auditor", icon: History },
];
const stages = ["Planejar", "Auditar", "Registrar", "Tratar", "Entregar"];

export function IsoShell({ children }: { children: ReactNode }) {
  return (
    <IsoWorkspace>
      <Body>{children}</Body>
    </IsoWorkspace>
  );
}

function Body({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const {
    audits,
    selected,
    selectedId,
    setSelectedId,
    createAudit,
    remote,
    syncStatus,
    access,
    storageError,
    reloadServer,
    archivedAuditIds,
    archivedIds,
    processes,
    criteria,
  } = useIsoWorkspace();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<IsoAudit>>({
    name: "",
    organization: "",
    scheduledFor: "",
    type: "Interna",
    standards: [],
    scope: "",
  });
  const [guideOpen, setGuideOpen] = useState(false);
  const page =
    [{ title: "Dashboard", url: "/iso/dashboard" }, ...links, ...nextLinks, ...supportLinks].find(
      (link) => link.url === pathname,
    )?.title || "Kit Pré-Auditoria";
  const activeStage = pathname.includes("evidencias")
    ? 1
    : pathname.includes("nao-conformidades")
      ? 2
      : pathname.includes("pac")
        ? 3
        : pathname.includes("relatorio")
          ? 4
          : 0;
  const submitAudit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name?.trim()) return;
    if (!createAudit({ ...draft, name: draft.name.trim() })) return;
    setNewOpen(false);
    setDraft({ name: "", organization: "", scheduledFor: "", type: "Interna", standards: [] });
  };
  const nav = (
    <>
      <div className="flex items-center gap-3 border-b border-white/15 px-4 py-5">
        <img
          src={jacobyLogo}
          alt="Jacoby"
          className="h-10 w-10 rounded-lg bg-white object-contain p-1"
        />
        <div>
          <b className="block text-sm text-white">Jacoby Gestão ISO</b>
          <span className="block text-[11px] text-white/60">9001 · 14001 · 45001</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-5 text-sm" aria-label="Navegação ISO">
        <p className="px-2 pb-2 text-xs font-semibold text-white/55">Visão geral</p>
        <Link
          to="/iso/dashboard"
          onClick={() => setMenuOpen(false)}
          className={`mb-5 flex items-center gap-3 rounded-lg px-3 py-2.5 ${pathname === "/iso/dashboard" ? "bg-[#e6f0e0] font-semibold text-[#204f2c]" : "text-white/85 hover:bg-white/10"}`}
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>
        <p className="px-2 pb-2 text-xs font-semibold text-white/55">1. Planejar</p>
        {links.map(({ title, url, icon: Icon }) => (
          <Link
            key={url}
            to={url}
            onClick={() => setMenuOpen(false)}
            className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 ${pathname === url ? "bg-[#e6f0e0] font-semibold text-[#204f2c]" : "text-white/85 hover:bg-white/10"}`}
          >
            <Icon className="h-4 w-4" />
            {title}
          </Link>
        ))}
        {nextLinks.map(({ section, title, url, icon: Icon }) => (
          <div key={url} className="mt-5">
            <p className="px-2 pb-2 text-xs font-semibold text-white/55">{section}</p>
            <Link
              to={url}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${pathname === url ? "bg-[#e6f0e0] font-semibold text-[#204f2c]" : "text-white/85 hover:bg-white/10"}`}
            >
              <Icon className="h-4 w-4" />
              {title}
            </Link>
          </div>
        ))}
        <p className="mt-5 px-2 pb-2 text-xs font-semibold text-white/55">Apoio</p>
        {supportLinks.map(({ title, url, icon: Icon }) => (
          <Link
            key={url}
            to={url}
            onClick={() => setMenuOpen(false)}
            className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 ${pathname === url ? "bg-[#e6f0e0] font-semibold text-[#204f2c]" : "text-white/85 hover:bg-white/10"}`}
          >
            <Icon className="h-4 w-4" />
            {title}
          </Link>
        ))}
      </nav>
    </>
  );
  return (
    <div
      className="iso-layout grid min-h-screen w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] bg-[#f5f8f5] text-[#20382a] md:grid-cols-[var(--iso-menu-width)_minmax(0,1fr)]"
      style={{ "--iso-menu-width": collapsed ? "0px" : "16rem" } as React.CSSProperties}
    >
      <aside
        className={`sticky top-0 z-30 hidden h-dvh min-w-0 self-start flex-col bg-[#193f2b] md:flex ${collapsed ? "w-0 overflow-hidden" : "w-64"}`}
      >
        {nav}
      </aside>
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <aside className="flex h-full w-64 flex-col bg-[#193f2b]">{nav}</aside>
          <button
            type="button"
            className="flex-1 bg-black/40"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
          />
        </div>
      )}
      <div className="w-full min-w-0 max-w-full">
        {remote && (
          <div
            role="status"
            className="min-w-0 border-b bg-blue-50 px-4 py-3 text-sm text-blue-900 [overflow-wrap:anywhere] sm:px-6"
          >
            {syncStatus} · Acesso:{" "}
            {access === "admin"
              ? "administração"
              : access === "editor"
                ? "edição"
                : access === "viewer"
                  ? "leitura"
                  : "verificando"}
            {storageError && (
              <button type="button" className="ml-3 underline" onClick={reloadServer}>
                Preservar cópia e recarregar servidor
              </button>
            )}
          </div>
        )}
        <header className="sticky top-0 z-20 border-b border-[#dbe5db] bg-white">
          <div className="flex min-h-16 min-w-0 flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
            <button
              type="button"
              aria-label="Alternar menu"
              onClick={() => {
                if (window.innerWidth < 768) setMenuOpen(true);
                else setCollapsed(!collapsed);
              }}
              className="rounded-lg p-2 hover:bg-[#eef5ec]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <b className="hidden whitespace-nowrap text-sm lg:block">Jacoby Gestão ISO</b>
            <span className="hidden text-sm text-[#718275] lg:inline">Auditoria ativa:</span>
            <select
              aria-label="Auditoria ativa"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              title={selected.name}
              className="h-10 min-w-0 max-w-full flex-1 rounded-lg border border-[#d8e2d6] bg-white px-3 text-sm shadow-sm sm:max-w-[min(100%,24rem)]"
            >
              {audits
                .filter((audit) => !archivedAuditIds.includes(audit.id) || audit.id === selectedId)
                .map((audit) => (
                  <option key={audit.id} value={audit.id}>
                    {audit.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="inline-flex h-10 items-center gap-1 rounded-lg border border-[#d8e2d6] px-3 text-sm font-semibold hover:bg-[#eef5ec]"
            >
              <Plus className="h-4 w-4" />
              Nova
            </button>
            <span className="hidden whitespace-nowrap text-xs text-[#68786b] xl:inline">
              {selected.selectedQuestions?.length || 0} perguntas · {selected.ncs?.length || 0} NCs
              no relatório
            </span>
            <button
              type="button"
              onClick={() => setGuideOpen(!guideOpen)}
              className="rounded-lg px-2 py-2 text-xs font-semibold text-[#506953] hover:bg-[#eef5ec]"
            >
              Guia da tela
            </button>
            <span className="hidden max-w-44 truncate text-xs text-[#647767] xl:inline">
              {user?.email}
            </span>
            <div id="app-updates-desktop" className="ml-auto" />
            <EnvironmentSwitch
              active="iso"
              onNavigate={() => setMenuOpen(false)}
              className="ml-auto"
            />
          </div>
          <div
            className="border-t border-[#e5ece3] px-4 py-2 text-sm [overflow-wrap:anywhere] sm:px-6"
            aria-label="Nome completo da auditoria ativa"
          >
            <span className="text-[#718275]">Auditoria ativa: </span>
            <strong>{selected.name}</strong>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-[#e5ece3] bg-[#edf5ef] px-4 py-2 sm:px-6">
            <span className="mr-2 text-xs text-[#62766b]">Etapa {activeStage + 1} de 5</span>
            {stages.map((stage, index) => {
              const url =
                index === 0
                  ? "/iso"
                  : index === 1
                    ? "/iso/evidencias"
                    : index === 2
                      ? "/iso/nao-conformidades"
                      : index === 3
                        ? "/iso/pac"
                        : "/iso/relatorio";
              return url ? (
                <Link
                  key={stage}
                  to={url}
                  className={`rounded-full border px-3 py-1 text-xs ${index === activeStage ? "border-[#b9d9b7] bg-white font-semibold text-[#28713a]" : "border-[#dae5dc] bg-[#f6faf6] text-[#6d806f] hover:bg-white"}`}
                >
                  {index + 1} &nbsp;{stage}
                </Link>
              ) : (
                <span
                  key={stage}
                  className="rounded-full border border-[#dae5dc] bg-[#f6faf6] px-3 py-1 text-xs text-[#89998c]"
                >
                  {index + 1} &nbsp;{stage}
                </span>
              );
            })}
            <span className="ml-auto text-xs font-medium text-[#4d6854]">{page}</span>
          </div>
        </header>
        {guideOpen && (
          <div className="border-b border-[#d6e5d6] bg-[#f1f8ee] px-6 py-3 text-sm">
            {activeStage === 0
              ? "Planejar: prepare o checklist, monte o plano e selecione perguntas para o roteiro."
              : activeStage === 1
                ? "Auditar: registre evidências e responda às perguntas selecionadas."
                : activeStage === 2
                  ? "Registrar: formalize os desvios e não conformidades encontrados."
                  : activeStage === 3
                    ? "Tratar: vincule os planos às NCs, defina ações, responsáveis, prazos e evidências de fechamento."
                    : "Entregar: revise os dados e a conclusão do auditor antes de gerar o relatório em PDF."}{" "}
            <button type="button" onClick={() => setGuideOpen(false)} className="ml-3 font-bold">
              Fechar
            </button>
          </div>
        )}
        <div className="border-b border-[#e0eae0] bg-[#f8fbf7] px-6 py-1.5 text-xs text-[#788a7b]">
          {remote
            ? "ISO compartilhado · dados e anexos privados no Supabase da Jacoby. Confira o status de salvamento antes de sair."
            : "Prévia local · os dados deste ambiente ISO ficam apenas neste navegador e ainda não são sincronizados entre usuários."}
        </div>
        <main className="min-w-0 max-w-full [overflow-wrap:anywhere]">{children}</main>
      </div>
      {newOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setNewOpen(false);
          }}
        >
          <form
            onSubmit={submitAudit}
            role="dialog"
            aria-label="Nova auditoria"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Nova auditoria</h2>
                <p className="text-sm text-[#708274]">Dados iniciais do planejamento.</p>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setNewOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Nome da auditoria
                <input
                  required
                  value={draft.name || ""}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="mt-1 block h-10 w-full rounded-lg border px-3 font-normal"
                />
              </label>
              <label className="text-sm font-semibold">
                Organização / unidade
                <input
                  value={draft.organization || ""}
                  onChange={(e) => setDraft({ ...draft, organization: e.target.value })}
                  className="mt-1 block h-10 w-full rounded-lg border px-3 font-normal"
                />
              </label>
              <label className="text-sm font-semibold">
                Tipo
                <select
                  value={draft.type || "Interna"}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                  className="mt-1 block h-10 w-full rounded-lg border px-3 font-normal"
                >
                  <option>Interna</option>
                  <option>Externa</option>
                  <option>Certificação</option>
                  <option>Recertificação</option>
                </select>
              </label>
              <label className="text-sm font-semibold">
                Data prevista
                <input
                  type="date"
                  value={draft.scheduledFor || ""}
                  onChange={(e) => setDraft({ ...draft, scheduledFor: e.target.value })}
                  className="mt-1 block h-10 w-full rounded-lg border px-3 font-normal"
                />
              </label>
            </div>
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold">Normas aplicáveis</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {[
                  ...new Set([
                    "ISO 9001",
                    "ISO 14001",
                    "ISO 45001",
                    "ISO 27001",
                    "ISO 28000",
                    "ISO 31000",
                    "IATF 16949",
                    ...criteria.filter((c) => !archivedIds.includes(c.id)).map((c) => c.name),
                  ]),
                ].map((standard) => (
                  <label key={standard} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.standards?.includes(standard) || false}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          standards: e.target.checked
                            ? [...(draft.standards || []), standard]
                            : (draft.standards || []).filter((item) => item !== standard),
                        })
                      }
                    />
                    {standard}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mt-4 block text-sm font-semibold">
              Escopo
              <textarea
                value={draft.scope || ""}
                onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
                className="mt-1 block min-h-20 w-full rounded-lg border p-3 font-normal"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewOpen(false)}
                className="rounded-lg px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#287735] px-4 py-2 text-sm font-semibold text-white"
              >
                Criar auditoria
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
