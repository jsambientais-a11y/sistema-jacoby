/** Painel inicial Jacoby: indicadores compactos de documentos e boletins em aberto. */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BellRing, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, FileText, Search, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClients } from "@/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });
type Doc = { id: string; client_id: string; branch_id: string | null; title: string; file_name: string; expires_at: string | null; notify_days_before: number; active: boolean };
type Branch = { id: string; client_id: string; name: string; cnpj: string | null };
type Cycle = { id: string; client_id: string; branch_id: string | null; bulletin_number: number; period_start: string; period_end: string };
type OpenCycle = Cycle & { movements: number; unconfirmedMovements: number; services: number; servicesAmount: number };
type PendingMovement = { id: string; cycle: Cycle; branch_id: string | null; occurred_on: string; service_order: string | null; mtr_number: string | null; observation: string | null; weight_kg: number; residue_name: string | null };
type Panel = "valid" | "overdue" | "soon" | "alerts" | "cycles" | "movements";
type Item = { key: string; title: string; subtitle: string; badge?: string; tone?: "danger" | "warning" | "ok"; group: string; search?: string; open: () => void };

const day = 86_400_000;
// Busca sem acento e sem diferença de maiúsculas, com as palavras em qualquer ordem.
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const todayIso = () => new Date().toISOString().slice(0, 10);
function daysUntil(date: string) { return Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${todayIso()}T00:00:00`)) / day); }
// Datas digitadas com o ano errado (ex.: 0026 em vez de 2026) geravam "vencido há 730 mil dias".
const isValidDate = (date: string | null) => { const year = Number(date?.slice(0, 4)); return !!date && year >= 2000 && year <= 2200; };
const formatDate = (date: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(`${date}T00:00:00`));
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;
const docState = (doc: Doc) => {
  if (!doc.expires_at) return "Sem vencimento";
  if (!isValidDate(doc.expires_at)) return "Data de vencimento inválida";
  const days = daysUntil(doc.expires_at);
  return days < 0 ? `Vencido há ${plural(Math.abs(days), "dia")}` : days === 0 ? "Vence hoje" : `Faltam ${plural(days, "dia")}`;
};
const docTone = (doc: Doc): Item["tone"] => {
  if (!doc.expires_at) return "ok";
  if (!isValidDate(doc.expires_at)) return "danger";
  const days = daysUntil(doc.expires_at);
  return days < 0 ? "danger" : days <= 30 ? "warning" : "ok";
};
const docOrder = (doc: Doc) => !doc.expires_at ? Number.MAX_SAFE_INTEGER : !isValidDate(doc.expires_at) ? Number.MIN_SAFE_INTEGER : daysUntil(doc.expires_at);
const isAlert = (doc: Doc) => !!doc.expires_at && (!isValidDate(doc.expires_at) || daysUntil(doc.expires_at) <= Number(doc.notify_days_before || 0));
const toneClass = { danger: "text-destructive bg-destructive/10", warning: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-950/30", ok: "text-primary bg-primary/10" };

function Stat({ label, hint, value, icon: Icon, color, onClick }: { label: string; hint: string; value: number; icon: typeof FileText; color: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="group text-left">
    <Card className="flex h-full items-center gap-3 p-4 transition group-hover:shadow-md group-hover:ring-1 group-hover:ring-primary/40">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${color}20`, color }}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1"><p className="text-2xl font-bold leading-tight tracking-tight">{value}</p><p className="truncate text-sm font-medium">{label}</p><p className="truncate text-xs text-muted-foreground">{hint}</p></div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
    </Card>
  </button>;
}

function Dashboard() {
  const { isAdmin, hasPermission, profile, user } = useAuth();
  const navigate = useNavigate();
  const { data: clients = [] } = useClients();
  const canViewDashboard = isAdmin || hasPermission("dashboard");
  const canViewBilling = hasPermission("billing");
  const [clientFilter, setClientFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [search, setSearch] = useState("");
  const { data: documents = [] } = useQuery({
    queryKey: ["dashboard-client-documents"], enabled: canViewDashboard,
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_documents") as any).select("id,client_id,branch_id,title,file_name,expires_at,notify_days_before,active").eq("active", true);
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["dashboard-client-branches"], enabled: canViewDashboard,
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_branches") as any).select("id,client_id,name,cnpj").order("name");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });
  const { data: billing = { cycles: [], pending: [] } } = useQuery<{ cycles: OpenCycle[]; pending: PendingMovement[] }>({
    queryKey: ["dashboard-open-cycles"], enabled: canViewDashboard && canViewBilling,
    queryFn: async () => {
      const { data: cycles, error } = await (supabase.from("billing_v2_cycles" as any) as any)
        .select("id,client_id,branch_id,bulletin_number,period_start,period_end")
        .eq("status", "draft").eq("is_demo", false).order("bulletin_number");
      if (error) throw error;
      if (!cycles?.length) return { cycles: [], pending: [] };
      const ids = cycles.map((cycle: Cycle) => cycle.id);
      const [movementsRes, servicesRes] = await Promise.all([
        (supabase.from("billing_v2_movements" as any) as any).select("id,cycle_id,branch_id,confirmed,occurred_on,service_order,mtr_number,observation,weight_kg,waste_residue_id").in("cycle_id", ids),
        (supabase.from("billing_v2_cycle_services" as any) as any).select("cycle_id,amount").in("cycle_id", ids),
      ]);
      if (movementsRes.error) throw movementsRes.error;
      if (servicesRes.error) throw servicesRes.error;
      const movements = (movementsRes.data ?? []) as any[];
      const services = (servicesRes.data ?? []) as any[];
      const byId = new Map<string, Cycle>(cycles.map((cycle: Cycle) => [cycle.id, cycle]));
      const residueIds = Array.from(new Set(movements.map((item) => item.waste_residue_id).filter(Boolean)));
      const { data: residueRows } = residueIds.length
        ? await (supabase.from("waste_residues" as any) as any).select("id,name").in("id", residueIds)
        : { data: [] };
      const residueNames = new Map<string, string>((residueRows ?? []).map((item: { id: string; name: string }) => [item.id, item.name]));
      return {
        cycles: cycles.map((cycle: Cycle) => {
          const own = movements.filter((item) => item.cycle_id === cycle.id);
          const ownServices = services.filter((item) => item.cycle_id === cycle.id);
          return { ...cycle, movements: own.length, unconfirmedMovements: own.filter((item) => !item.confirmed).length, services: ownServices.length, servicesAmount: ownServices.reduce((sum, item) => sum + Number(item.amount || 0), 0) };
        }),
        pending: movements.filter((item) => !item.confirmed).map((item) => ({ ...item, residue_name: residueNames.get(item.waste_residue_id) ?? null, cycle: byId.get(item.cycle_id)! })),
      };
    },
  });

  const clientBranches = branches.filter((branch) => branch.client_id === clientFilter);
  const inScope = (clientId: string, branchId: string | null) =>
    (clientFilter === "all" || clientId === clientFilter) &&
    (unitFilter === "all" || (unitFilter === "matrix" ? !branchId : branchId === unitFilter));
  const clientName = (id: string) => clients.find((client) => client.id === id)?.name ?? "Cliente";
  const unitName = (id: string | null) => id ? branches.find((branch) => branch.id === id)?.name ?? "Filial" : "Matriz";

  const data = useMemo(() => {
    const docs = documents.filter((doc) => inScope(doc.client_id, doc.branch_id)).sort((a, b) => docOrder(a) - docOrder(b));
    const cycles = billing.cycles.filter((cycle) => inScope(cycle.client_id, cycle.branch_id));
    const pending = billing.pending.filter((item) => inScope(item.cycle.client_id, item.branch_id ?? item.cycle.branch_id)).sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
    return {
      valid: docs.filter((doc) => !doc.expires_at || (isValidDate(doc.expires_at) && daysUntil(doc.expires_at) >= 0)),
      overdue: docs.filter((doc) => !!doc.expires_at && (!isValidDate(doc.expires_at) || daysUntil(doc.expires_at) < 0)),
      soon: docs.filter((doc) => isValidDate(doc.expires_at) && daysUntil(doc.expires_at!) >= 0 && daysUntil(doc.expires_at!) <= 30),
      alerts: docs.filter(isAlert),
      cycles, pending,
    };
  }, [documents, billing, clientFilter, unitFilter]);

  // O faturamento restaura o boletim aberto a partir do hash do endereço.
  // Com uma movimentação informada, o BM abre filtrado no pátio e com ela destacada.
  const openCycle = (cycle: Cycle, focus?: { movementId: string; branchId: string | null }) => navigate({
    to: "/portal/residuos", search: { aba: "faturamento2" } as any,
    hash: new URLSearchParams({
      cliente: cycle.client_id, inicio: cycle.period_start, fim: cycle.period_end, patio: cycle.branch_id || "__matriz__", boletim: cycle.id, subaba: "movimentos", residuo: "all",
      ...(focus ? { foco: focus.movementId, foco_patio: focus.branchId || "__matriz__" } : {}),
    }).toString(),
  });
  const openDocument = (doc: Doc) => navigate({ to: "/clients/$clientId/edit", params: { clientId: doc.client_id }, search: { aba: "documentos" } as any });
  const docItems = (docs: Doc[]): Item[] => docs.map((doc) => ({
    key: doc.id, title: doc.title, group: `${clientName(doc.client_id)} · ${unitName(doc.branch_id)}`,
    subtitle: doc.expires_at && isValidDate(doc.expires_at) ? `Vencimento ${formatDate(doc.expires_at)}` : doc.expires_at ? `Data cadastrada: ${doc.expires_at} — corrigir` : doc.file_name,
    badge: docState(doc), tone: docTone(doc), open: () => openDocument(doc),
  }));
  const panels: Record<Panel, { title: string; description: string; items: Item[] }> = {
    valid: { title: "Documentos vigentes", description: "Dentro da validade ou sem vencimento.", items: docItems(data.valid) },
    overdue: { title: "Documentos vencidos", description: "Vencimento já passou ou data inválida.", items: docItems(data.overdue) },
    soon: { title: "Vencem em até 30 dias", description: "Documentos que precisam de renovação em breve.", items: docItems(data.soon) },
    alerts: { title: "Alertas de documentos", description: "Dentro do prazo de aviso definido em cada documento.", items: docItems(data.alerts) },
    cycles: {
      title: "Boletins em aberto", description: "Boletins ainda não finalizados.",
      items: data.cycles.map((cycle) => ({
        key: cycle.id, title: `BM #${cycle.bulletin_number}`, group: `${clientName(cycle.client_id)} · ${unitName(cycle.branch_id)}`,
        subtitle: `${formatDate(cycle.period_start)} a ${formatDate(cycle.period_end)} · ${plural(cycle.movements, "movimentação", "movimentações")} · ${plural(cycle.services, "serviço")}${cycle.servicesAmount ? ` (${money(cycle.servicesAmount)})` : ""}`,
        search: `${cycle.bulletin_number} ${cycle.period_start} ${cycle.period_end}`,
        badge: cycle.unconfirmedMovements ? `${cycle.unconfirmedMovements} sem confirmação` : "Tudo confirmado", tone: cycle.unconfirmedMovements ? "warning" : "ok", open: () => openCycle(cycle),
      })),
    },
    movements: {
      title: "Movimentações sem confirmação", description: "Lançadas em boletins abertos e ainda não confirmadas.",
      items: data.pending.map((item) => {
        const unit = unitName(item.branch_id ?? item.cycle.branch_id);
        const kg = Number(item.weight_kg) ? `${Number(item.weight_kg).toLocaleString("pt-BR")} kg` : null;
        return {
          key: item.id, title: `${formatDate(item.occurred_on)} · ${item.residue_name || "Resíduo não informado"} · BM #${item.cycle.bulletin_number}`, group: `${clientName(item.cycle.client_id)} · ${unit}`,
          subtitle: [item.service_order && `OS ${item.service_order}`, item.mtr_number && `MTR ${item.mtr_number}`, kg, item.observation].filter(Boolean).join(" · ") || "Sem OS informada",
          search: [item.occurred_on, item.cycle.bulletin_number, item.residue_name, item.service_order, item.mtr_number, item.observation, unit].filter(Boolean).join(" "),
          badge: "Não confirmada", tone: "warning", open: () => openCycle(item.cycle, { movementId: item.id, branchId: item.branch_id ?? item.cycle.branch_id }),
        };
      }),
    },
  };
  const current = panel ? panels[panel] : null;
  const terms = normalize(search).split(/\s+/).filter(Boolean);
  const shownItems = (current?.items ?? []).filter((item) => {
    if (!terms.length) return true;
    const haystack = normalize(`${item.title} ${item.subtitle} ${item.group} ${item.search ?? ""}`);
    return terms.every((term) => haystack.includes(term));
  });
  const groups = shownItems.reduce((map, item) => map.set(item.group, [...(map.get(item.group) ?? []), item]), new Map<string, Item[]>());
  const openPanel = (next: Panel) => { setSearch(""); setPanel(next); };

  const greeting = profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0];
  if (!canViewDashboard) return <div className="space-y-6 p-6"><header><h1 className="text-3xl font-bold tracking-tight">Olá, {greeting}</h1><p className="text-muted-foreground">Acompanhamento de documentos.</p></header><Card className="p-6 text-sm text-muted-foreground">Você não possui acesso ao painel de validade documental.</Card></div>;

  return <div className="mx-auto max-w-6xl space-y-5 p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm font-medium text-primary">Jacoby Soluções Ambientais</p><h1 className="text-3xl font-bold tracking-tight">Painel</h1><p className="text-muted-foreground">Clique em um indicador para ver o detalhamento.</p></div>
      <div className="flex flex-wrap gap-3">
        <div className="w-56 space-y-1"><Label className="text-xs">Cliente</Label><Select value={clientFilter} onValueChange={(value) => { setClientFilter(value); setUnitFilter("all"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os clientes</SelectItem>{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="w-56 space-y-1"><Label className="text-xs">Matriz / filial</Label><Select value={unitFilter} onValueChange={setUnitFilter} disabled={clientFilter === "all"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as unidades</SelectItem><SelectItem value="matrix">Matriz</SelectItem>{clientBranches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
      </div>
    </header>
    <section className="space-y-2"><h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Documentos</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Vigentes" hint="Dentro da validade" value={data.valid.length} icon={CheckCircle2} color="#059669" onClick={() => openPanel("valid")} />
        <Stat label="Vencidos" hint="Precisam de regularização" value={data.overdue.length} icon={AlertTriangle} color="#dc2626" onClick={() => openPanel("overdue")} />
        <Stat label="Vencem em até 30 dias" hint="Renovar em breve" value={data.soon.length} icon={CalendarClock} color="#d97706" onClick={() => openPanel("soon")} />
        <Stat label="Em alerta" hint="Dentro do prazo de aviso" value={data.alerts.length} icon={BellRing} color="#7c3aed" onClick={() => openPanel("alerts")} />
      </div>
    </section>
    {canViewBilling && <section className="space-y-2"><h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Faturamento</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Boletins em aberto" hint="Pendentes de finalização" value={data.cycles.length} icon={ClipboardList} color="#2563eb" onClick={() => openPanel("cycles")} />
        <Stat label="Movimentações sem confirmação" hint="Em boletins abertos" value={data.pending.length} icon={Truck} color="#d97706" onClick={() => openPanel("movements")} />
      </div>
    </section>}
    <Dialog open={!!current} onOpenChange={(open) => !open && setPanel(null)}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-3">
        <DialogHeader><DialogTitle>{current?.title} ({current?.items.length ?? 0})</DialogTitle><DialogDescription>{current?.description} Clique em um item para abrir.</DialogDescription></DialogHeader>
        {(current?.items.length ?? 0) > 6 && <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por pátio, cliente, resíduo, OS, BM, data..." /></div>}
        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
          {!shownItems.length ? <p className="py-10 text-center text-sm text-muted-foreground">Nada por aqui.</p> : [...groups.entries()].map(([group, items]) => <div key={group} className="mb-3">
            <p className="sticky top-0 bg-background py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
            <div className="divide-y rounded-lg border">{items.map((item) => <button key={item.key} type="button" onClick={() => { setPanel(null); item.open(); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted/50">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="truncate text-xs text-muted-foreground">{item.subtitle}</p></div>
              {item.badge && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClass[item.tone ?? "ok"]}`}>{item.badge}</span>}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>)}</div>
          </div>)}
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
