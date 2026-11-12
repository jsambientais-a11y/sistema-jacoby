import {
  bulletinBillingEntries,
  hasBillingInvoiceIssue,
  isBillingInvoicePending,
  selectBulletinBillingEntry,
  summarizeBulletinBilling,
} from "@/lib/billing-flow-navigation";
import {
  BILLING_DATE_RULES,
  preserveSavedBillingForecast,
  type BillingExpectedBasis,
  type BillingAutomaticBasis,
} from "@/lib/billing-dates";
import { residueNameKey, uniqueResidueNames } from "@/lib/residue-names";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { billingAgreement, billingCommission } from "@/lib/billing-agreement";
import { BillingBulletinOverview } from "@/components/BillingBulletinOverview";
import { BillingBulletinDraft } from "@/components/BillingBulletinDraft";
import { ServiceInvoiceFiles } from "@/components/ServiceInvoiceFiles";
import type { CycleInvoice } from "@/lib/cycle-invoices";
import type { BillingBulletin } from "@/lib/billing-bulletins";
import { ArrowLeft, CalendarClock, CheckCircle2, FileText, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeriodFilter } from "@/components/PeriodFilter";
import { inPeriod, type Period } from "@/lib/receivables";

export type BillingFlowCategory = "rental" | "exchange" | "treatment" | "service";
export type BillingFlowTracking = {
  recurring_forecast?: boolean;
  id: string;
  cycle_id: string;
  category: BillingFlowCategory;
  outsourced_company_id: string | null;
  source_key: string;
  rule_type: "percent" | "fixed";
  rule_value: number;
  base_amount_snapshot: number;
  net_invoice_amount: number | null;
  commission_amount: number;
  invoice_number: string | null;
  invoice_issued_on: string | null;
  invoice_due_on: string | null;
  expected_basis: BillingExpectedBasis;
  expected_on: string | null;
  received_on: string | null;
  notes: string | null;
  updated_at: string;
};
export type BillingFlowEntry = {
  id: string;
  cycleId: string;
  companyId: string | null;
  category: BillingFlowCategory;
  bulletin: string;
  client: string;
  branch: string;
  company: string;
  description: string;
  isScrap?: boolean;
  baseAmount: number;
  currentCommission: number;
  itemsCount: number;
  tracking?: BillingFlowTracking;
  legacyInvoiceNumber?: string | null;
  legacyIssuedOn?: string | null;
  legacyDueOn?: string | null;
  legacyExpectedOn?: string | null;
  legacyPaidOn?: string | null;
  operationDates?: string[];
  pendingService?: boolean;
  serviceNotes?: CycleInvoice[];
  serviceUrl?: string;
};
export type BillingFlowSaveInput = {
  entry: BillingFlowEntry;
  rule_type: "percent" | "fixed";
  rule_value: number;
  net_invoice_amount: number | null;
  invoice_number: string | null;
  invoice_issued_on: string | null;
  invoice_due_on: string | null;
  expected_basis: BillingExpectedBasis;
  expected_on: string | null;
  received_on: string | null;
  notes: string | null;
};

const categories: { id: BillingFlowCategory; label: string }[] = [
  { id: "rental", label: "Locação" },
  { id: "exchange", label: "Troca" },
  { id: "treatment", label: "Tratamento" },
  { id: "service", label: "Serviços" },
];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function displayDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function isReceived(entry: BillingFlowEntry) {
  const receivedOn = entry.tracking ? entry.tracking.received_on : entry.legacyPaidOn;
  return Boolean(receivedOn && receivedOn <= new Date().toISOString().slice(0, 10));
}
// Data do filtro de período: quando foi recebido ou, se ainda não foi, a previsão de recebimento.
function entryReferenceDate(entry: BillingFlowEntry) {
  const receivedOn = entry.tracking ? entry.tracking.received_on : entry.legacyPaidOn;
  if (receivedOn && receivedOn <= new Date().toISOString().slice(0, 10)) return receivedOn;
  return (entry.tracking ? entry.tracking.expected_on : entry.legacyExpectedOn) ?? null;
}

export function BillingFlowPreview({
  entries: allEntries,
  bulletins: allBulletins,
  isLoading = false,
  loadError,
  isSaving = false,
  onSave,
  onSaveBatch,
}: {
  entries: BillingFlowEntry[];
  bulletins: BillingBulletin[];
  isLoading?: boolean;
  loadError: string | null;
  isSaving?: boolean;
  onSave: (input: BillingFlowSaveInput) => Promise<void>;
  onSaveBatch: (inputs: BillingFlowSaveInput[]) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [mapContext, setMapContext] = useState(() => {
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    return {
      cycle: params.get("mapCycle"),
      entry: params.get("mapEntry"),
      category: params.get("mapCategory"),
    };
  });
  // A deep link selects an editor; it must never shrink the list's data source.
  const scopedEntries = allEntries;
  const scopedBulletins = allBulletins;
  const [category, setCategory] = useState<BillingFlowCategory | "all">(() =>
    categories.some((c) => c.id === mapContext.category)
      ? (mapContext.category as BillingFlowCategory)
      : "all",
  );
  const [selectedId, setSelectedId] = useState(mapContext.entry || "");
  const [editorLayout, setEditorLayout] = useState<"lines" | "detail">(
    mapContext.entry ? "detail" : "lines",
  );
  const [activeCycleId, setActiveCycleId] = useState<string | null>(mapContext.cycle);
  const [visitedCycles, setVisitedCycles] = useState<Set<string>>(
    () => new Set(mapContext.cycle ? [mapContext.cycle] : []),
  );
  const [selectedResidue, setSelectedResidue] = useState("all");
  const [search, setSearch] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState(() => {
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    return params.get("nf") === "missing" ? "missing" : "all";
  });
  const [period, setPeriod] = useState<Period>({ kind: "all" });
  const entries =
    period.kind === "all"
      ? scopedEntries
      : scopedEntries.filter((entry) => inPeriod(entryReferenceDate(entry), period));
  const periodCycles = new Set(entries.map((entry) => entry.cycleId));
  const bulletins =
    period.kind === "all" ? scopedBulletins : scopedBulletins.filter((b) => periodCycles.has(b.id));
  const residuesByCycle = new Map(
    scopedBulletins.map((b) => [b.id, uniqueResidueNames(b.residues || [])]),
  );
  const residueOptions = uniqueResidueNames(bulletins.flatMap((b) => b.residues || []));
  const matchesResidue = (id: string) =>
    selectedResidue === "all" ||
    (residuesByCycle.get(id) || []).some((r) => residueNameKey(r.name) === selectedResidue);
  const listBulletins = bulletins.filter(
    (b) =>
      matchesResidue(b.id) &&
      ((category === "all" && invoiceFilter === "all") ||
        entries.some(
          (entry) =>
            entry.cycleId === b.id &&
            (category === "all" || entry.category === category) &&
            (invoiceFilter === "all" ||
              (invoiceFilter === "missing"
                ? isBillingInvoicePending(entry)
                : hasBillingInvoiceIssue(entry))),
        )),
  );
  const activeEntries = bulletinBillingEntries(scopedEntries, activeCycleId);
  const activeBulletin = scopedBulletins.find((b) => b.id === activeCycleId);
  const missingMapEntry = Boolean(
    mapContext.entry &&
    selectedId === mapContext.entry &&
    activeCycleId === mapContext.cycle &&
    !activeEntries.some((entry) => entry.id === mapContext.entry),
  );
  const selected = selectBulletinBillingEntry(activeEntries, selectedId, category, missingMapEntry);
  const metricEntries = activeCycleId ? activeEntries : entries;
  const receivedCount = metricEntries.filter(isReceived).length;
  const issuedCycleIds = new Set(bulletins.map((bulletin) => bulletin.id));
  const awaitingInvoiceEntries = entries.filter(
    (entry) => issuedCycleIds.has(entry.cycleId) && isBillingInvoicePending(entry),
  );
  const awaitingInvoiceCount = awaitingInvoiceEntries.length;
  const awaitingInvoiceBMs = new Set(awaitingInvoiceEntries.map((entry) => entry.cycleId)).size;
  const summary = summarizeBulletinBilling(metricEntries);
  // Keep visited forms mounted: category switches and back-to-list don't discard typed fields.
  // No autosave, localStorage or server mutations are involved in navigation.
  const cachedEntries = scopedEntries.filter((entry) => visitedCycles.has(entry.cycleId));
  function returnToBulletins() {
    setActiveCycleId(null);
    if (mapContext.cycle || mapContext.entry || mapContext.category) {
      setMapContext({ cycle: null, entry: null, category: null });
      setCategory("all");
      void navigate({ to: "/financeiro", search: { nf: invoiceFilter === "missing" ? "missing" : undefined }, replace: true });
    }
  }
  function openBulletin(cycleId: string, entryId?: string) {
    const cycleEntries = bulletinBillingEntries(scopedEntries, cycleId);
    const preferredEntries =
      invoiceFilter === "missing" && !entryId
        ? cycleEntries.filter((entry) => isBillingInvoicePending(entry))
        : cycleEntries;
    const first = selectBulletinBillingEntry(preferredEntries, entryId || "", category);
    setSelectedId(first?.id || "");
    setActiveCycleId(cycleId);
    setEditorLayout(entryId ? "detail" : "lines");
    setVisitedCycles((current) => new Set([...current, cycleId]));
  }
  const activeNumber = activeBulletin
    ? `#${String(activeBulletin.number).padStart(3, "0")}`
    : activeEntries[0]?.bulletin || "";
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">
              {activeCycleId ? `Lançamentos do BM ${activeNumber}` : "BMs e categorias"}
            </p>
            <p className="text-xl font-semibold">{metricEntries.length}</p>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <button
            type="button"
            className="flex h-full w-full items-center gap-3 p-4 text-left transition-colors hover:bg-amber-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-amber-950/20"
            aria-label={`Conferir ${awaitingInvoiceCount} lançamentos sem emissão de NF em ${awaitingInvoiceBMs} BMs`}
            onClick={() => {
              returnToBulletins();
              setSearch("");
              setCategory("all");
              setSelectedResidue("all");
              setInvoiceFilter("missing");
            }}
          >
            <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700">
              <CalendarClock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Sem emissão de NF informada</p>
              <p className="text-xl font-semibold">{awaitingInvoiceCount}</p>
              <p className="text-xs text-muted-foreground">
                Em {awaitingInvoiceBMs} BM(s) emitido(s) · Clique para conferir
              </p>
            </div>
          </button>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">
              {activeCycleId ? "Total a receber neste BM" : "Valores a receber"} · {receivedCount}{" "}
              recebido(s)
            </p>
            <p className="text-xl font-semibold">{money.format(summary.total)}</p>
            {activeCycleId && summary.provisional && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Inclui valores provisórios
              </p>
            )}
          </div>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <div hidden={Boolean(activeCycleId)}>
          <div className="flex flex-col gap-4 border-b bg-muted/20 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Lançamentos por boletim</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Abra um BM para conferir locação, troca, tratamento e serviços no mesmo lugar.
              </p>
            </div>
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar BM, cliente ou empresa"
                aria-label="Buscar BM, cliente ou empresa"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4 px-4 pt-4 sm:px-5">
            <div className="space-y-1.5">
              <Label>Período (previsão ou recebimento)</Label>
              <PeriodFilter value={period} onChange={setPeriod} />
            </div>
            <div className="w-full max-w-sm space-y-1.5">
              <Label>Filtrar BMs por resíduo</Label>
              <Select value={selectedResidue} onValueChange={setSelectedResidue}>
                <SelectTrigger aria-label="Filtrar BMs por resíduo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os resíduos</SelectItem>
                  {residueOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full space-y-1.5 sm:w-56">
              <Label>Nota fiscal</Label>
              <Select value={invoiceFilter} onValueChange={setInvoiceFilter}>
                <SelectTrigger aria-label="Filtrar por nota fiscal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as situações</SelectItem>
                  <SelectItem value="missing">Sem NF informada</SelectItem>
                  <SelectItem value="issued">Com NF informada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {invoiceFilter !== "all" && (
            <div className="flex flex-wrap items-center gap-2 px-4 pt-3 text-xs text-muted-foreground sm:px-5">
              <span>
                {invoiceFilter === "missing"
                  ? "BMs com lançamentos sem data de emissão de NF. Confira o lançamento; há operações que não exigem nota."
                  : "BMs com lançamentos que possuem data de emissão de NF."}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setInvoiceFilter("all")}
              >
                Limpar filtro de NF
              </Button>
            </div>
          )}
          <div className="p-4 sm:p-5">
            <Tabs
              value={category}
              onValueChange={(value) => setCategory(value as BillingFlowCategory | "all")}
            >
              <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 sm:flex sm:flex-wrap sm:justify-start">
                <TabsTrigger value="all" className="min-h-10 rounded-lg border px-4 py-2">
                  Todos os BMs{" "}
                  <span className="ml-2 text-xs text-muted-foreground">{bulletins.length}</span>
                </TabsTrigger>
                {categories.map((item) => (
                  <TabsTrigger
                    key={item.id}
                    value={item.id}
                    className="min-h-10 rounded-lg border px-4 py-2"
                  >
                    {item.label}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {entries.filter((entry) => entry.category === item.id).length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>
        {loadError ? (
          <p className="border-t p-8 text-center text-sm text-destructive">
            Não foi possível carregar os registros de faturamento: {loadError}
          </p>
        ) : isLoading ? (
          <p className="border-t p-8 text-center text-sm text-muted-foreground">
            Carregando BMs e comissões…
          </p>
        ) : activeCycleId ? (
          <>
            <header className="space-y-4 border-b bg-primary/5 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={returnToBulletins}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar aos BMs
                  </Button>
                  <div>
                    <h2 className="text-lg font-semibold">Lançamentos do BM {activeNumber}</h2>
                    <p className="text-sm font-medium">
                      {activeBulletin?.client || activeEntries[0]?.client}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activeBulletin?.branch || activeEntries[0]?.branch} · {summary.confirmed} de{" "}
                      {activeEntries.length} lançamento(s) conferido(s)
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Confira as categorias em linhas e preencha os dados comuns da nota uma vez por
                emissor. Para anexos e ajustes individuais, use a visão por lançamento. Salve antes
                de trocar de visão.
              </p>
              <div className="flex gap-2" role="group" aria-label="Visualização da conferência">
                <Button
                  type="button"
                  size="sm"
                  variant={editorLayout === "lines" ? "default" : "outline"}
                  aria-pressed={editorLayout === "lines"}
                  onClick={() => setEditorLayout("lines")}
                >
                  Em linhas
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={editorLayout === "detail" ? "default" : "outline"}
                  aria-pressed={editorLayout === "detail"}
                  onClick={() => setEditorLayout("detail")}
                >
                  Por lançamento
                </Button>
              </div>
              <div
                className={editorLayout === "detail" ? "flex flex-wrap gap-2" : "hidden"}
                role="group"
                aria-label={`Lançamentos do BM ${activeNumber}`}
              >
                {categories.flatMap((item) => {
                  const matching = activeEntries.filter((entry) => entry.category === item.id);
                  if (!matching.length)
                    return [
                      <Button
                        key={item.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled
                        title="Este BM não possui lançamentos nesta categoria"
                      >
                        {item.label} · 0
                      </Button>,
                    ];
                  return matching.map((entry) => (
                    <Button
                      key={entry.id}
                      type="button"
                      variant={selected?.id === entry.id ? "default" : "outline"}
                      className="h-auto min-h-10 flex-col items-start gap-0.5 px-3 py-2 text-left"
                      aria-pressed={selected?.id === entry.id}
                      aria-label={`Conferir ${item.label} do BM ${activeNumber}${matching.length > 1 ? ` · ${entry.company}` : ""}`}
                      onClick={() => setSelectedId(entry.id)}
                    >
                      <span className="text-sm font-semibold">
                        {item.label}
                        {matching.length > 1 ? ` · ${entry.company}` : ""}
                      </span>
                      <span className="text-[11px] opacity-80">
                        {entry.tracking ? "Conferido" : "A conferir"} ·{" "}
                        {entry.pendingService && !entry.tracking
                          ? "Valor a informar"
                          : money.format(
                              Number(entry.tracking?.commission_amount ?? entry.currentCommission),
                            )}
                      </span>
                      {isBillingInvoicePending(entry) && (
                        <span className="text-[11px] font-medium">Sem NF informada</span>
                      )}
                    </Button>
                  ));
                })}
              </div>
            </header>
            {missingMapEntry && (
              <p role="alert" className="p-4 text-sm text-destructive">
                O lançamento indicado não está disponível. Nenhum outro lançamento foi selecionado
                em seu lugar. Escolha uma das opções deste BM acima.
              </p>
            )}
            {!activeEntries.length && (
              <p className="p-8 text-sm text-muted-foreground">
                Este BM ainda não possui lançamentos de faturamento. Registre a operação no boletim
                para conferir aqui.
              </p>
            )}
          </>
        ) : (
          <BillingBulletinOverview
            bulletins={listBulletins}
            entries={scopedEntries}
            search={search}
            onOpen={(entry) => openBulletin(entry.cycleId, entry.id)}
            onOpenBulletin={(bulletin) => openBulletin(bulletin.id)}
          />
        )}
        <div
          hidden={
            !activeCycleId ||
            isLoading ||
            Boolean(loadError) ||
            editorLayout !== "lines" ||
            missingMapEntry
          }
        >
          {[...visitedCycles].map((cycleId) => (
            <div key={cycleId} hidden={cycleId !== activeCycleId}>
              <BillingBulletinDraft
                entries={bulletinBillingEntries(scopedEntries, cycleId)}
                isSaving={isSaving}
                onSave={onSaveBatch}
              />
            </div>
          ))}
        </div>
        <div
          hidden={!activeCycleId || isLoading || Boolean(loadError) || editorLayout !== "detail"}
        >
          {cachedEntries.map((entry) => (
            <div key={entry.id} hidden={selected?.id !== entry.id}>
              <BillingFlowDraft
                key={`${entry.id}:${entry.tracking?.updated_at || "new"}`}
                entry={entry}
                isSaving={isSaving}
                onSave={onSave}
              />
            </div>
          ))}
        </div>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        As regras e datas salvas ficam vinculadas ao BM e alimentam este controle de faturamento.
      </p>
    </div>
  );
}

function BillingFlowDraft({
  entry,
  isSaving,
  onSave,
}: {
  entry: BillingFlowEntry;
  isSaving: boolean;
  onSave: (input: BillingFlowSaveInput) => Promise<void>;
}) {
  const ruleInput = useRef<HTMLInputElement>(null);
  const isMapTarget =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mapEntry") === entry.id;
  useEffect(() => {
    if (isMapTarget) {
      ruleInput.current?.scrollIntoView({ block: "center" });
      ruleInput.current?.focus({ preventScroll: true });
    }
  }, [entry.id, isMapTarget]);
  const saved = entry.tracking;
  const agreement = billingAgreement(entry);
  const isScrap = Boolean(entry.isScrap || /sucata/i.test(entry.description));
  const [ruleType, setRuleType] = useState<"percent" | "fixed">(
    saved?.rule_type || agreement.defaultRule,
  );
  const [ruleValue, setRuleValue] = useState(
    saved
      ? String(saved.rule_value)
      : entry.pendingService || agreement.requiresAgreement
        ? ""
        : String(entry.currentCommission),
  );
  const [netInvoiceAmount, setNetInvoiceAmount] = useState(
    saved?.net_invoice_amount == null ? "" : String(saved.net_invoice_amount),
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    saved ? saved.invoice_number || "" : entry.legacyInvoiceNumber || "",
  );
  const [issuedOn, setIssuedOn] = useState(
    saved ? saved.invoice_issued_on || "" : entry.legacyIssuedOn || "",
  );
  const [dueOn, setDueOn] = useState(saved ? saved.invoice_due_on || "" : entry.legacyDueOn || "");
  const [basis, setBasis] = useState<BillingAutomaticBasis>(
    saved && saved.expected_basis !== "manual" ? saved.expected_basis : "issue",
  );
  const [manualExpectedOn, setManualExpectedOn] = useState(
    saved?.expected_basis === "manual" ? saved.expected_on || "" : entry.legacyExpectedOn || "",
  );
  const [useManualDate, setUseManualDate] = useState(
    saved?.expected_basis === "manual" || (!saved && Boolean(entry.legacyExpectedOn)),
  );
  const [paidOn, setPaidOn] = useState(saved ? saved.received_on || "" : entry.legacyPaidOn || "");
  const [notes, setNotes] = useState(saved?.notes || "");
  const [formError, setFormError] = useState("");
  const parsedValue = ruleValue.trim() === "" ? NaN : Number(ruleValue.replace(",", "."));
  const parsedNet =
    netInvoiceAmount.trim() === "" ? null : Number(netInvoiceAmount.replace(",", "."));
  const previewCommission = billingCommission(ruleType, parsedValue, parsedNet);
  const automaticExpectedOn = preserveSavedBillingForecast({ saved, basis, issuedOn, dueOn });
  const operationDates = entry.operationDates || [];
  const operationOn = operationDates.at(-1) || "";
  const expectedOn = useManualDate ? manualExpectedOn : automaticExpectedOn;
  const save = async () => {
    setFormError("");
    if (
      !ruleValue.trim() ||
      !Number.isFinite(parsedValue) ||
      parsedValue < 0 ||
      (ruleType === "percent" && parsedValue > 100)
    ) {
      setFormError("Informe um valor válido. O percentual deve ficar entre 0 e 100%.");
      return;
    }
    if (
      netInvoiceAmount.trim() &&
      (parsedNet == null || !Number.isFinite(parsedNet) || parsedNet < 0)
    ) {
      setFormError("Informe um valor líquido da nota válido, maior ou igual a zero.");
      return;
    }
    if (ruleType === "percent" && parsedNet == null) {
      setFormError("Informe o valor líquido da nota fiscal para calcular o percentual.");
      return;
    }
    if (issuedOn && dueOn && dueOn < issuedOn) {
      setFormError("O vencimento da nota não pode ser anterior à emissão.");
      return;
    }
    if (paidOn && paidOn > new Date().toISOString().slice(0, 10)) {
      setFormError("A data de recebimento não pode estar no futuro.");
      return;
    }
    if (useManualDate && !manualExpectedOn) {
      setFormError("Informe a data da previsão manual.");
      return;
    }
    try {
      await onSave({
        entry,
        rule_type: ruleType,
        rule_value: parsedValue,
        net_invoice_amount: parsedNet,
        invoice_number: invoiceNumber.trim() || null,
        invoice_issued_on: issuedOn || null,
        invoice_due_on: dueOn || null,
        expected_basis: useManualDate ? "manual" : basis,
        expected_on: expectedOn || null,
        received_on: paidOn || null,
        notes: notes.trim() || null,
      });
    } catch {
      setFormError("Não foi possível salvar. Confira a mensagem de erro e tente novamente.");
    }
  };

  return (
    <div className="min-w-0 divide-y">
      <div className="p-4 sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">
          Conferência do BM {entry.bulletin}
        </p>
        <h3 className="mt-1 text-lg font-semibold">{entry.description}</h3>
        <p className="text-sm text-muted-foreground">
          {entry.client} · {entry.branch} · {entry.company}
        </p>
        {entry.pendingService && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Nota recebida · aguardando lançamento do serviço. Configure a nota e o repasse aqui; o
            valor do serviço será preenchido ao lançar no BM.
          </p>
        )}
        <div className="mt-4 grid gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Base do BM</p>
            <strong>
              {entry.pendingService ? "A informar no serviço" : money.format(entry.baseAmount)}
            </strong>
          </div>
          <div>
            <p className="text-muted-foreground">Calculado pelo BM</p>
            <strong>
              {entry.pendingService ? "Aguardando serviço" : money.format(entry.currentCommission)}
            </strong>
          </div>
          <div>
            <p className="text-muted-foreground">
              {entry.companyId ? "Repasse deste registro" : "Faturamento deste registro"}
            </p>
            <strong>
              {previewCommission == null ? "A informar" : money.format(previewCommission)}
            </strong>
          </div>
        </div>
      </div>

      {Boolean(entry.serviceNotes?.length && entry.serviceUrl) && (
        <ServiceInvoiceFiles files={entry.serviceNotes!} serviceUrl={entry.serviceUrl!} />
      )}

      <div className="space-y-3 p-4 sm:p-5">
        <h4 className="font-semibold">
          1. {entry.companyId ? "Repasse / comissão" : "Valor faturado pela Jacoby"}
        </h4>
        <p className="rounded-lg border bg-muted/30 p-3 text-sm">{agreement.message}</p>
        {saved?.rule_type === "percent" && saved.net_invoice_amount == null && (
          <p className="text-sm text-amber-800">
            O lançamento anterior usou a base do BM. Informe o líquido da nota e confira o
            percentual antes de salvar novamente. O valor salvo permanece no histórico até essa
            conferência.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo de cálculo</Label>
            <Select
              value={ruleType}
              onValueChange={(value) => {
                setRuleType(value as "percent" | "fixed");
                setRuleValue("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentual sobre o líquido da nota</SelectItem>
                <SelectItem value="fixed">Valor acordado em reais</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="billing-rule-value">
              {ruleType === "percent" ? "Percentual (%)" : "Valor acordado (R$)"}
            </Label>
            <Input
              id="billing-rule-value"
              ref={ruleInput}
              className={isMapTarget ? "ring-2 ring-primary ring-offset-2" : undefined}
              type="number"
              min="0"
              step={ruleType === "percent" ? "0.0001" : "0.01"}
              value={ruleValue}
              onChange={(event) => setRuleValue(event.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {ruleType === "percent"
            ? "Comissão = valor líquido da nota × percentual informado. Não há novo desconto de imposto sobre a comissão."
            : "Informe o valor final combinado entre as partes. Não há percentual ou desconto automático."}{" "}
          O valor do BM continua intacto.
        </p>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <h4 className="font-semibold">2. Nota fiscal (quando houver)</h4>
        {isScrap && (
          <p className="rounded-lg border bg-muted/30 p-3 text-sm">
            Sucata sem nota fiscal: informe o valor acordado em reais. Número, emissão e vencimento
            da NF podem ficar em branco. Use a data da movimentação abaixo para definir a previsão,
            sem registrar uma nota fictícia.
          </p>
        )}
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="billing-net-invoice">
            Valor líquido da nota fiscal (R$)
            {ruleType === "percent" ? " · obrigatório" : " · opcional"}
          </Label>
          <Input
            id="billing-net-invoice"
            type="number"
            min="0"
            step="0.01"
            value={netInvoiceAmount}
            onChange={(event) => setNetInvoiceAmount(event.target.value)}
            placeholder="Valor após os descontos da nota"
          />
          <p className="text-xs text-muted-foreground">
            {ruleType === "percent" && parsedNet != null && previewCommission != null
              ? `${money.format(parsedNet)} × ${parsedValue}% = ${money.format(previewCommission)}`
              : "Informe o líquido correspondente a este lançamento, sem repetir o total da mesma nota em outras categorias."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Número da nota</Label>
            <Input
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              placeholder="Ex.: 12345"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Emissão da nota</Label>
            <Input
              type="date"
              value={issuedOn}
              onChange={(event) => setIssuedOn(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Vencimento da nota</Label>
            <Input type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <h4 className="font-semibold">3. Previsão e recebimento</h4>
        <p className="text-xs text-muted-foreground">
          As datas e regras já salvas são mantidas. Escolha a nova opção de 15 dias quando esse for
          o acordo, ou ajuste a previsão manualmente.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Regra da previsão de recebimento</Label>
            <Select
              value={basis}
              disabled={useManualDate}
              onValueChange={(value) => setBasis(value as BillingAutomaticBasis)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BILLING_DATE_RULES)
                  .filter(([key]) => key !== "manual")
                  .map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Previsão de recebimento</Label>
            <Input
              type="date"
              value={expectedOn}
              disabled={!useManualDate}
              onChange={(event) => setManualExpectedOn(event.target.value)}
            />
          </div>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <p className="font-medium">Data da movimentação / execução</p>
          <p className="mt-1 text-muted-foreground">
            {operationDates.length
              ? operationDates.map(displayDate).join(" · ")
              : "Não informada nos lançamentos deste BM."}
          </p>
          {operationOn && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setUseManualDate(true);
                setManualExpectedOn(operationOn);
              }}
            >
              Usar {displayDate(operationOn)} como previsão
            </Button>
          )}
          {operationDates.length > 1 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Há mais de uma operação. O atalho usa a mais recente; ajuste a data se necessário.
            </p>
          )}
          {isScrap && (
            <p className="mt-1 text-xs text-muted-foreground">
              Ajuste para o dia seguinte quando esse for o acordo. A previsão não confirma
              pagamento; registre a data em que recebeu somente após conferir.
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useManualDate}
            onChange={(event) => {
              setUseManualDate(event.target.checked);
              if (event.target.checked && !manualExpectedOn)
                setManualExpectedOn(automaticExpectedOn);
            }}
          />
          Ajustar previsão manualmente
        </label>
        {useManualDate && (
          <p className="text-xs text-muted-foreground">
            A previsão manual está ativa. Desmarque a opção acima para usar uma regra automática.
          </p>
        )}
        <div className="max-w-xs space-y-1.5">
          <Label>Data em que recebeu</Label>
          <Input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
        </div>
        <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          Previsão: <strong>{displayDate(expectedOn)}</strong> · Recebimento:{" "}
          <strong>{displayDate(paidOn)}</strong>
        </p>
        <p className="text-xs text-muted-foreground">
          {saved
            ? `Última atualização: ${new Date(saved.updated_at).toLocaleString("pt-BR")}.`
            : "Ainda não há conferência salva para esta categoria do BM."}
        </p>
        <div className="space-y-1.5">
          <Label>Observações</Label>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Acordos, cobrança ou observações da nota"
          />
        </div>
        {saved && Number(saved.base_amount_snapshot) !== Number(entry.baseAmount.toFixed(2)) && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            A base do BM mudou desde o último salvamento. Confira o repasse antes de salvar
            novamente.
          </p>
        )}
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {saved
              ? "Alterações feitas aqui serão gravadas no controle de faturamento."
              : "Ao salvar, este lançamento passará a alimentar o controle de faturamento."}
          </p>
          <Button type="button" onClick={() => void save()} disabled={isSaving}>
            {isSaving ? "Salvando…" : saved ? "Salvar alterações" : "Salvar lançamento"}
          </Button>
        </div>
      </div>
    </div>
  );
}
