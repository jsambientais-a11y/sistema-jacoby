import { EnterpriseFinance } from "@/components/EnterpriseFinance";
/**
 * Financeiro: tudo que a Jacoby tem a receber, de todos os meses, a partir dos lançamentos
 * do Faturamento. BM próprio entra com o valor cheio do cliente; BM de terceirizada entra
 * com a comissão da Jacoby. A baixa grava no mesmo registro de conferência do Faturamento.
 */
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FolderKanban,
  Link2,
  Search,
  Undo2,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTasks } from "@/hooks/use-data";
import { useBillingFlowData } from "@/hooks/use-billing-flow";
import { useReceivableTaskLinks } from "@/hooks/use-receivable-task-links";
import { billingAgreement } from "@/lib/billing-agreement";
import {
  inPeriod,
  monthlyTotals,
  receivableDetails,
  referenceDate,
  settlementInput,
  shiftMonth,
  sortReceivables,
  summarizeReceivables,
  toReceivable,
  type Period,
  type Receivable,
  type ReceivableSources,
  type ReceivableStatus,
} from "@/lib/receivables";
import { PeriodFilter } from "@/components/PeriodFilter";
import type { BillingFlowEntry } from "@/components/BillingFlowPreview";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export const Route = createFileRoute("/_app/contas-a-receber")({
  component: FinancePage,
  validateSearch: (search: Record<string, unknown>): { view?: "payable"; status?: "overdue" } => ({
    view: search.view === "payable" ? "payable" : undefined,
    status: search.status === "overdue" ? "overdue" : undefined,
  }),
});

type Row = Receivable<BillingFlowEntry>;
type View = "open" | "overdue" | "due_soon" | "no_date" | "received" | "all";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const todayIso = () => new Date().toISOString().slice(0, 10);
const formatDate = (value?: string | null) => (value ? value.split("-").reverse().join("/") : "—");
// "out. de 2026" → "Out de 2026"
const shortMonth = (month: string) => {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" })
    .format(new Date(`${month}-01T12:00:00`))
    .replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const CATEGORY_LABEL: Record<string, string> = {
  rental: "Locação",
  exchange: "Troca",
  treatment: "Tratamento",
  service: "Serviços",
};
const STATUS: Record<ReceivableStatus, { label: string; className: string }> = {
  overdue: { label: "Vencido", className: "bg-destructive/10 text-destructive" },
  due_soon: {
    label: "Vence em breve",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
  },
  upcoming: {
    label: "A receber",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200",
  },
  no_date: { label: "Sem previsão", className: "bg-muted text-muted-foreground" },
  received: { label: "Recebido", className: "bg-primary/12 text-primary" },
};
const VIEWS: { id: View; label: string }[] = [
  { id: "open", label: "Em aberto" },
  { id: "overdue", label: "Vencidos" },
  { id: "due_soon", label: "Próximos 7 dias" },
  { id: "no_date", label: "Sem previsão" },
  { id: "received", label: "Recebidos" },
  { id: "all", label: "Todos" },
];
const inView = (row: Row, view: View) =>
  view === "all" || (view === "open" ? row.status !== "received" : row.status === view);

function FinancePage() {
  const { hasPermission } = useAuth();
  if (!hasPermission("finance")) return <Navigate to="/dashboard" />;
  return <EnterpriseFinance billed={<ReceivablesPage />} />;
}
function ReceivablesPage() {
  const { hasPermission } = useAuth();
  const flow = useBillingFlowData();
  const links = useReceivableTaskLinks();
  const { data: taskData = [] } = useTasks();
  // useTasks devolve um tipo unido (tarefas ou ordem); aqui só interessam id e título.
  const tasks = taskData as unknown as { id: string; title: string | null }[];
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [client, setClient] = useState("all");
  const [issuer, setIssuer] = useState("all");
  const [category, setCategory] = useState("all");
  const [period, setPeriod] = useState<Period>({ kind: "all" });

  const today = todayIso();
  const rows = useMemo(
    () =>
      sortReceivables(
        flow.billingFlowEntries.map((entry) =>
          toReceivable(entry, today, billingAgreement(entry).requiresAgreement),
        ),
      ),
    [flow.billingFlowEntries, today],
  );
  // O período usa a data em que o valor foi recebido ou, se ainda não foi, a previsão.
  const periodRows = rows.filter((row) => inPeriod(referenceDate(row), period));
  const summary = summarizeReceivables(periodRows, today);
  const months = Array.from({ length: 6 }, (_, index) => shiftMonth(today.slice(0, 7), index - 1));
  const monthTotals = monthlyTotals(rows, months);
  const [expanded, setExpanded] = useState<string | null>(null);
  const sources = useMemo<ReceivableSources>(
    () => ({
      movementCommissions: flow.movementCommissionsQuery.data || [],
      services: flow.servicesQuery.data || [],
      placements: flow.directBillingDataQuery.data?.placements || [],
      movements: flow.directBillingDataQuery.data?.movements || [],
      directServices: flow.directBillingDataQuery.data?.services || [],
      residues: flow.residues,
      catalog: flow.catalog,
    }),
    [
      flow.movementCommissionsQuery.data,
      flow.servicesQuery.data,
      flow.directBillingDataQuery.data,
      flow.residues,
      flow.catalog,
    ],
  );
  const clients = Array.from(new Set(rows.map((row) => row.entry.client))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const issuers = Array.from(
    new Map(
      rows.map((row) => [
        row.entry.companyId || "jacoby",
        row.entry.companyId ? row.entry.company : "Jacoby",
      ]),
    ),
  ).sort((a, b) =>
    a[0] === "jacoby" ? -1 : b[0] === "jacoby" ? 1 : a[1].localeCompare(b[1], "pt-BR"),
  );
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = periodRows.filter(
    (row) =>
      (client === "all" || row.entry.client === client) &&
      (issuer === "all" || (row.entry.companyId || "jacoby") === issuer) &&
      (category === "all" || row.entry.category === category) &&
      (!query ||
        [
          row.entry.bulletin,
          row.entry.client,
          row.entry.branch,
          row.entry.company,
          row.entry.description,
          row.invoiceNumber || "",
        ]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(query)),
  );
  const shown = filtered.filter((row) => inView(row, view));
  const shownTotal = shown.reduce((total, row) => total + row.amount, 0);
  const isLoading = [
    flow.servicesQuery,
    flow.movementCommissionsQuery,
    flow.cyclesQuery,
    flow.directBillingDataQuery,
    flow.billingTrackingQuery,
  ].some((item) => item.isLoading);
  const loadError = [
    flow.servicesQuery,
    flow.movementCommissionsQuery,
    flow.cyclesQuery,
    flow.directBillingDataQuery,
    flow.billingTrackingQuery,
    flow.companiesQuery,
    flow.branchesQuery,
  ]
    .map((item) => item.error)
    .find(Boolean) as Error | undefined;

  const settle = (row: Row, receivedOn: string | null) => {
    const values = settlementInput(
      row.entry,
      receivedOn,
      billingAgreement(row.entry).requiresAgreement,
    );
    if (values) flow.settleReceivable.mutate({ entry: row.entry, ...values });
  };

  if (!hasPermission("finance")) return <Navigate to="/dashboard" />;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-primary">Contas a receber</p>
        <h2 className="mt-1 text-2xl font-bold sm:text-3xl">Faturado</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Tudo que a Jacoby tem a receber, puxado do Faturamento: BMs emitidos pela Jacoby entram
          com o valor do cliente; BMs de terceirizadas entram com a comissão da Jacoby.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Wallet}
          label="Em aberto"
          value={summary.open}
          hint={period.kind === "all" ? "Todos os meses" : "No período selecionado"}
          onClick={() => setView("open")}
          active={view === "open"}
          extra={
            summary.withoutDate > 0 && (
              <button
                type="button"
                onClick={() => setView("no_date")}
                className={`relative z-10 mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${view === "no_date" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
                title="Mostrar só os lançamentos sem previsão de recebimento"
              >
                <CalendarClock className="h-3 w-3" />
                {summary.withoutDate} sem previsão de recebimento
              </button>
            )
          }
        />
        <Metric
          icon={AlertTriangle}
          label="Vencido"
          value={summary.overdue}
          hint="Previsão passou sem baixa"
          tone="text-destructive"
          onClick={() => setView("overdue")}
          active={view === "overdue"}
        />
        <Metric
          icon={CalendarClock}
          label="Vence em até 7 dias"
          value={summary.nextSevenDays}
          hint="Para acompanhar de perto"
          tone="text-amber-600 dark:text-amber-300"
          onClick={() => setView("due_soon")}
          active={view === "due_soon"}
        />
        <Metric
          icon={CheckCircle2}
          label="Recebido no mês"
          value={summary.receivedThisMonth}
          hint="Baixas registradas neste mês"
          tone="text-primary"
          onClick={() => setView("received")}
          active={view === "received"}
        />
      </div>

      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-sm font-semibold">Mês a mês</p>
          <p className="text-xs text-muted-foreground">
            Previsto em aberto e recebido em cada mês · clique para filtrar
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {monthTotals.map((item) => {
            const active = period.kind === "month" && period.month === item.month;
            const current = item.month === today.slice(0, 7);
            return (
              <button
                key={item.month}
                type="button"
                onClick={() =>
                  setPeriod(active ? { kind: "all" } : { kind: "month", month: item.month })
                }
                className={`rounded-lg border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm ${active ? "border-primary bg-accent/60 ring-2 ring-primary/15" : "bg-card"}`}
              >
                <p
                  className={`text-xs font-semibold ${current ? "text-primary" : "text-muted-foreground"}`}
                >
                  {shortMonth(item.month)}
                  {current ? " · atual" : ""}
                </p>
                <p className="mt-1 text-base font-bold tabular-nums">
                  {money.format(item.expected)}
                </p>
                <p className="text-[11px] text-muted-foreground">previsto</p>
                {item.received > 0 && (
                  <p className="mt-1 text-xs font-medium tabular-nums text-primary">
                    {money.format(item.received)} recebido
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <PeriodFilter value={period} onChange={setPeriod} />
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar BM, cliente, NF…"
              className="h-9 pl-8"
              aria-label="Buscar recebível"
            />
          </div>
          <Select value={client} onValueChange={setClient}>
            <SelectTrigger className="h-9 w-52" aria-label="Cliente">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={issuer} onValueChange={setIssuer}>
            <SelectTrigger className="h-9 w-52" aria-label="Quem fatura">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Quem fatura: todos</SelectItem>
              {issuers.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-44" aria-label="Origem">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              {Object.entries(CATEGORY_LABEL).map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(search ||
            client !== "all" ||
            issuer !== "all" ||
            category !== "all" ||
            period.kind !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-muted-foreground"
              onClick={() => {
                setSearch("");
                setClient("all");
                setIssuer("all");
                setCategory("all");
                setPeriod({ kind: "all" });
              }}
            >
              <X className="h-4 w-4" />
              Limpar filtros
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {VIEWS.map((item) => {
              const count = filtered.filter((row) => inView(row, item.id)).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === item.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/60 hover:text-foreground"}`}
                >
                  {item.label} <span className="tabular-nums opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            Total exibido:{" "}
            <strong className="tabular-nums text-foreground">{money.format(shownTotal)}</strong>
          </p>
        </div>

        {loadError ? (
          <p className="p-8 text-center text-sm text-destructive">
            Não foi possível carregar os recebíveis: {loadError.message}
          </p>
        ) : isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Carregando recebíveis…</p>
        ) : !shown.length ? (
          <div className="p-12 text-center">
            <p className="font-medium">Nada por aqui</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nenhum recebível nesta seleção. Ajuste os filtros acima.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-8 px-2 py-2.5">
                    <span className="sr-only">Detalhes</span>
                  </th>
                  <th className="px-3 py-2.5">Previsão</th>
                  <th className="px-3 py-2.5">Quem fatura</th>
                  <th className="px-3 py-2.5">Cliente / pátio</th>
                  <th className="px-3 py-2.5">BM e origem</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                  <th className="px-3 py-2.5">Situação</th>
                  <th className="px-3 py-2.5">Projeto</th>
                  <th className="px-3 py-2.5 text-right">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <ReceivableRow
                    key={row.id}
                    row={row}
                    today={today}
                    tasks={tasks}
                    links={links}
                    sources={sources}
                    open={expanded === row.id}
                    onToggle={() => setExpanded((current) => (current === row.id ? null : row.id))}
                    saving={flow.settleReceivable.isPending}
                    onSettle={(receivedOn) => settle(row, receivedOn)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ReceivableRow({
  row,
  today,
  tasks,
  links,
  sources,
  open,
  onToggle,
  saving,
  onSettle,
}: {
  row: Row;
  today: string;
  tasks: { id: string; title: string | null }[];
  sources: ReceivableSources;
  links: ReturnType<typeof useReceivableTaskLinks>;
  open: boolean;
  onToggle: () => void;
  saving: boolean;
  onSettle: (receivedOn: string | null) => void;
}) {
  const { entry } = row;
  const status = STATUS[row.status];
  const reviewUrl = `/financeiro?mapCycle=${entry.cycleId}&mapEntry=${encodeURIComponent(entry.id)}&mapCategory=${entry.category}`;
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return (
    <Fragment>
      <tr
        onClick={onToggle}
        aria-expanded={open}
        className={`group cursor-pointer border-t transition-colors hover:bg-accent/30 ${open ? "bg-accent/40" : ""} ${row.status === "received" ? "text-muted-foreground" : ""}`}
      >
        <td className="px-2 py-3">
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180 text-primary" : ""}`}
          />
        </td>
        <td className="whitespace-nowrap px-3 py-3 tabular-nums">
          <p
            className={row.status === "overdue" ? "font-semibold text-destructive" : "font-medium"}
          >
            {formatDate(row.expectedOn)}
          </p>
          {row.invoiceDueOn && (
            <p className="text-xs text-muted-foreground">Venc. NF {formatDate(row.invoiceDueOn)}</p>
          )}
        </td>
        <td className="px-3 py-3">
          <span
            className={`inline-flex max-w-44 items-center gap-1.5 truncate rounded-full px-2.5 py-0.5 text-xs font-medium ${entry.companyId ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-primary/10 text-primary"}`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${entry.companyId ? "bg-sky-500" : "bg-primary"}`}
            />
            <span className="truncate">{entry.companyId ? entry.company : "Jacoby"}</span>
          </span>
          <p className="mt-1 text-xs text-muted-foreground">
            {entry.companyId ? "Comissão da Jacoby" : "Faturamento direto"}
          </p>
        </td>
        <td className="px-3 py-3">
          <p className="font-medium text-foreground">{entry.client}</p>
          <p className="text-xs text-muted-foreground">{entry.branch}</p>
        </td>
        <td className="px-3 py-3">
          <p className="font-medium text-foreground">
            BM {entry.bulletin} · {CATEGORY_LABEL[entry.category] || entry.category}
          </p>
          <p className="max-w-64 truncate text-xs text-muted-foreground" title={entry.description}>
            {entry.description}
            {row.invoiceNumber ? ` · NF ${row.invoiceNumber}` : ""}
          </p>
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
          <p className="font-semibold text-foreground">{money.format(row.amount)}</p>
          {!row.confirmed && (
            <p
              className="text-xs text-amber-700 dark:text-amber-300"
              title="Valor calculado pelo BM; ainda não conferido no Faturamento"
            >
              provisório
            </p>
          )}
        </td>
        <td className="px-3 py-3">
          <span
            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}
          >
            {status.label}
            {row.status === "received" && row.receivedOn ? ` em ${formatDate(row.receivedOn)}` : ""}
          </span>
        </td>
        <td className="px-3 py-3" onClick={stop}>
          <ProjectLink receivableKey={entry.id} tasks={tasks} links={links} />
        </td>
        <td className="px-3 py-3 text-right" onClick={stop}>
          {row.status === "received" ? (
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => onSettle(null)}>
              <Undo2 className="h-3.5 w-3.5" />
              Desfazer
            </Button>
          ) : row.canSettle ? (
            <SettleButton today={today} disabled={saving} onConfirm={onSettle} />
          ) : (
            <Button
              size="sm"
              variant="outline"
              asChild
              title="Este repasse depende de acordo. Confira o valor no Faturamento antes da baixa."
            >
              <a href={reviewUrl}>
                <ExternalLink className="h-3.5 w-3.5" />
                Conferir no Faturamento
              </a>
            </Button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-t bg-muted/20">
          <td />
          <td colSpan={8} className="px-3 pb-5 pt-2">
            <ReceivableBreakdown row={row} sources={sources} reviewUrl={reviewUrl} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

const RULE_BASIS: Record<string, string> = {
  issue: "dia 10 do mês seguinte à emissão da NF",
  due: "dia 10 do mês seguinte ao vencimento da NF",
  manual: "data definida manualmente",
};

function ReceivableBreakdown({
  row,
  sources,
  reviewUrl,
}: {
  row: Row;
  sources: ReceivableSources;
  reviewUrl: string;
}) {
  const { entry } = row;
  const lines = receivableDetails(entry, sources);
  const calculated = lines.reduce((total, line) => total + line.value, 0);
  const saved = entry.tracking;
  const differs = saved && Math.abs(calculated - row.amount) >= 0.01;
  const info: [string, ReactNode][] = saved
    ? [
        [
          "Regra do valor",
          saved.rule_type === "percent"
            ? `${saved.rule_value}% sobre o líquido da NF (${money.format(Number(saved.net_invoice_amount || 0))})`
            : `Valor fixo de ${money.format(Number(saved.rule_value))}`,
        ],
        ["Nota fiscal", saved.invoice_number || "—"],
        ["Emissão da NF", formatDate(saved.invoice_issued_on)],
        ["Vencimento da NF", formatDate(saved.invoice_due_on)],
        [
          "Previsão de recebimento",
          saved.expected_on
            ? `${formatDate(saved.expected_on)} · ${RULE_BASIS[saved.expected_basis] || ""}`
            : "—",
        ],
        ["Observações", saved.notes || "—"],
      ]
    : [];
  return (
    <div className="grid gap-4 animate-in fade-in slide-in-from-top-1 duration-200 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-xl border bg-card">
        <p className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          De onde vem o valor
        </p>
        {entry.pendingService ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            Nota recebida e anexada ao BM, aguardando o lançamento do serviço. O valor aparece
            quando o serviço for lançado no Boletim de Medição.
          </p>
        ) : !lines.length ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            Sem itens detalhados para este lançamento.
          </p>
        ) : (
          <>
            {lines.map((line, index) => (
              <div
                key={index}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b px-4 py-2.5 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-foreground">{line.label}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {line.formula}
                  </p>
                </div>
                <span
                  className={`text-right font-medium tabular-nums ${line.value < 0 ? "text-destructive" : "text-foreground"}`}
                >
                  {money.format(line.value)}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t bg-muted/40 px-4 py-2.5 text-sm font-semibold tabular-nums">
              <span>
                {entry.companyId ? "Comissão calculada pelo BM" : "Total calculado pelo BM"}
              </span>
              <span>{money.format(calculated)}</span>
            </div>
          </>
        )}
        {differs && (
          <p className="border-t bg-accent/40 px-4 py-2.5 text-sm text-accent-foreground">
            Valor conferido no Faturamento:{" "}
            <strong className="tabular-nums">{money.format(row.amount)}</strong>. É esse valor que
            entra no Financeiro.
          </p>
        )}
      </div>
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Conferência no Faturamento
        </p>
        {saved ? (
          <dl className="mt-3 space-y-2 text-sm">
            {info.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Ainda não conferido. O valor exibido é o calculado pelo BM e fica provisório até a
            conferência da nota e do repasse.
          </p>
        )}
        <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
          <a href={reviewUrl}>
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir no Faturamento
          </a>
        </Button>
      </div>
    </div>
  );
}

function SettleButton({
  today,
  disabled,
  onConfirm,
}: {
  today: string;
  disabled: boolean;
  onConfirm: (receivedOn: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setDate(today);
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          Dar baixa
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div>
          <p className="text-sm font-medium">Data do recebimento</p>
          <p className="text-xs text-muted-foreground">Quando o valor caiu na conta.</p>
        </div>
        <Input
          type="date"
          value={date}
          max={today}
          onChange={(event) => setDate(event.target.value)}
        />
        <Button
          className="w-full"
          disabled={!date || date > today}
          onClick={() => {
            onConfirm(date);
            setOpen(false);
          }}
        >
          <CheckCircle2 className="h-4 w-4" />
          Registrar recebimento
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function ProjectLink({
  receivableKey,
  tasks,
  links,
}: {
  receivableKey: string;
  tasks: { id: string; title: string | null }[];
  links: ReturnType<typeof useReceivableTaskLinks>;
}) {
  const [open, setOpen] = useState(false);
  const taskId = links.linkFor(receivableKey);
  const task = taskId ? tasks.find((item) => item.id === taskId) : null;
  if (!links.available)
    return (
      <span
        className="text-xs text-muted-foreground"
        title="O vínculo com projetos será liberado após a atualização do banco."
      >
        —
      </span>
    );
  if (task) {
    return (
      <span className="inline-flex max-w-52 items-center gap-1 rounded-full border bg-card py-0.5 pl-2 pr-1 text-xs">
        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-primary" />
        <Link
          to="/tasks/list"
          search={{ task: task.id, mine: undefined }}
          className="truncate font-medium hover:text-primary hover:underline"
          title={task.title || "Tarefa"}
        >
          {task.title || "Tarefa"}
        </Link>
        <button
          type="button"
          className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Remover vínculo"
          onClick={() => links.setLink.mutate({ key: receivableKey, taskId: null })}
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
        >
          <Link2 className="h-3.5 w-3.5" />
          Vincular
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Buscar tarefa da Gestão de Projetos…" />
          <CommandList>
            <CommandEmpty>Nenhuma tarefa encontrada.</CommandEmpty>
            <CommandGroup>
              {tasks.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.title || ""} ${item.id}`}
                  onSelect={() => {
                    links.setLink.mutate({ key: receivableKey, taskId: item.id });
                    setOpen(false);
                  }}
                >
                  <FolderKanban className="h-4 w-4 text-primary" />
                  <span className="truncate">{item.title || "Sem título"}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone = "text-foreground",
  onClick,
  active,
  extra,
}: {
  icon: typeof Wallet;
  label: string;
  value: number;
  hint: string;
  tone?: string;
  onClick: () => void;
  active: boolean;
  extra?: ReactNode;
}) {
  // O cartão inteiro filtra a lista; o atalho extra (ex.: sem previsão) tem clique próprio.
  return (
    <div
      className={`relative rounded-xl border bg-card p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-lift)] ${active ? "border-primary/50 ring-2 ring-primary/15" : ""}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Filtrar: ${label}`}
      />
      <div className="pointer-events-none flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{money.format(value)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        <Icon className={`h-5 w-5 ${tone}`} />
      </div>
      {extra && <div className="relative">{extra}</div>}
    </div>
  );
}
