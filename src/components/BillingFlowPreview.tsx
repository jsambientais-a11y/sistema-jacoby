import { residueNameKey, uniqueResidueNames } from "@/lib/residue-names";
import { useState } from "react";
import { billingAgreement, billingCommission } from "@/lib/billing-agreement";
import { BillingBulletinOverview } from "@/components/BillingBulletinOverview";
import type { BillingBulletin } from "@/lib/billing-bulletins";
import { CalendarClock, CheckCircle2, FileText, Search } from "lucide-react";
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

export type BillingFlowCategory = "rental" | "exchange" | "treatment" | "service";
export type BillingFlowTracking = {
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
  expected_basis: "issue" | "due" | "manual";
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
};
export type BillingFlowSaveInput = {
  entry: BillingFlowEntry;
  rule_type: "percent" | "fixed";
  rule_value: number;
  net_invoice_amount: number | null;
  invoice_number: string | null;
  invoice_issued_on: string | null;
  invoice_due_on: string | null;
  expected_basis: "issue" | "due" | "manual";
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

function nextMonthTenth(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month] = value.split("-").map(Number);
  if (month < 1 || month > 12) return "";
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-10`;
}

function displayDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function isReceived(entry: BillingFlowEntry) {
  const receivedOn = entry.tracking ? entry.tracking.received_on : entry.legacyPaidOn;
  return Boolean(receivedOn && receivedOn <= new Date().toISOString().slice(0, 10));
}
function invoiceIssuedOn(entry: BillingFlowEntry) {
  return entry.tracking ? entry.tracking.invoice_issued_on : entry.legacyIssuedOn;
}

export function BillingFlowPreview({
  entries,
  bulletins,
  isLoading = false,
  loadError,
  isSaving = false,
  onSave,
}: {
  entries: BillingFlowEntry[];
  bulletins: BillingBulletin[];
  isLoading?: boolean;
  loadError: string | null;
  isSaving?: boolean;
  onSave: (input: BillingFlowSaveInput) => Promise<void>;
}) {
  const [category, setCategory] = useState<BillingFlowCategory | "all">("all");
  const [selectedId, setSelectedId] = useState("");
  const [selectedResidue, setSelectedResidue] = useState("all");
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const residuesByCycle = new Map(bulletins.map((item) => [item.id, uniqueResidueNames(item.residues || [])]));
  const residueOptions = uniqueResidueNames(bulletins.flatMap((item) => item.residues || []));
  const matchesResidue = (id: string) => selectedResidue === "all" || (residuesByCycle.get(id) || []).some((item) => residueNameKey(item.name) === selectedResidue);
  const visible = entries.filter(
    (entry) =>
      entry.category === category && matchesResidue(entry.cycleId) &&
      (!normalizedSearch ||
        [entry.bulletin, entry.client, entry.branch, entry.company, entry.description]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedSearch)),
  );
  const selected = visible.find((entry) => entry.id === selectedId) || visible[0];
  const receivedCount = entries.filter(isReceived).length;
  const awaitingInvoiceCount = entries.filter((entry) => !invoiceIssuedOn(entry)).length;
  const totalCommission = entries.reduce(
    (sum, entry) => sum + Number(entry.tracking?.commission_amount ?? entry.currentCommission),
    0,
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <span className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">BMs e categorias</p>
            <p className="text-xl font-semibold">{entries.length}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Sem emissão de NF informada</p>
            <p className="text-xl font-semibold">{awaitingInvoiceCount}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Valores a receber · {receivedCount} recebido(s)</p>
            <p className="text-xl font-semibold">{money.format(totalCommission)}</p>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b bg-muted/20 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Lançamentos por tipo</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Selecione um BM para conferir o repasse, a nota fiscal e a previsão.
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
        <div className="px-4 pt-4 sm:px-5">
          <div className="max-w-sm space-y-1.5"><Label>Filtrar BMs por resíduo</Label>
            <Select value={selectedResidue} onValueChange={(value) => { setSelectedResidue(value); setSelectedId(""); }}>
              <SelectTrigger aria-label="Filtrar BMs por resíduo"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos os resíduos</SelectItem>{residueOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <Tabs
            value={category}
            onValueChange={(value) => {
              setCategory(value as BillingFlowCategory | "all");
              setSelectedId("");
            }}
          >
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 sm:flex sm:flex-wrap sm:justify-start">
              <TabsTrigger value="all" className="min-h-10 justify-between rounded-lg border px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-primary/10">
                Todos os BMs
                <span className="ml-3 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{bulletins.length}</span>
              </TabsTrigger>
              {categories.map((item) => (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  className="min-h-10 justify-between rounded-lg border px-4 py-2 data-[state=active]:border-primary data-[state=active]:bg-primary/10"
                >
                  {item.label}
                  <span className="ml-3 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {entries.filter((entry) => entry.category === item.id).length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {loadError ? (
          <p className="border-t p-8 text-center text-sm text-destructive">
            Não foi possível carregar os registros de faturamento: {loadError}
          </p>
        ) : isLoading ? (
          <p className="border-t p-8 text-center text-sm text-muted-foreground">
            Carregando BMs e comissões…
          </p>
        ) : category === "all" ? (
          <BillingBulletinOverview bulletins={bulletins.filter((item) => matchesResidue(item.id))} entries={entries} search={search} onOpen={(entry) => {
            setCategory(entry.category);
            setSelectedId(entry.id);
            setSearch("");
          }} />
        ) : !visible.length ? (
          <p className="border-t p-8 text-center text-sm text-muted-foreground">
            {search
              ? "Nenhum lançamento corresponde à busca nesta categoria."
              : `Nenhum BM finalizado com comissão de ${categories.find((item) => item.id === category)?.label.toLowerCase()} nesta seleção.`}
          </p>
        ) : (
          <div className="grid border-t lg:grid-cols-[minmax(250px,340px)_minmax(0,1fr)]">
            <div className="border-b p-3 lg:border-b-0 lg:border-r">
              <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {visible.length} lançamento(s)
              </p>
              <div className="max-h-72 space-y-2 overflow-y-auto lg:max-h-[760px]">
                {visible.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSelectedId(entry.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${selected?.id === entry.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm">BM {entry.bulletin}</strong>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isReceived(entry) ? "bg-emerald-50 text-emerald-700" : invoiceIssuedOn(entry) ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}
                      >
                        {isReceived(entry)
                          ? "Recebido"
                          : invoiceIssuedOn(entry)
                            ? "A receber"
                            : "NF não cadastrada"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{entry.client}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.branch} · {entry.company}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1" aria-label="Resíduos do BM">{(residuesByCycle.get(entry.cycleId) || []).map((item) => <span key={item.id} className="rounded bg-primary/10 px-2 py-1 text-xs text-primary">{item.name}</span>)}</div>
                    <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 text-xs">
                      <span className="truncate text-muted-foreground">
                        {entry.itemsCount} item(ns) · {entry.description}
                      </span>
                      <strong className="shrink-0 text-primary">
                        {money.format(
                          Number(entry.tracking?.commission_amount ?? entry.currentCommission),
                        )}
                      </strong>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {selected && (
              <BillingFlowDraft
                key={`${selected.id}:${selected.tracking?.updated_at || "new"}`}
                entry={selected}
                isSaving={isSaving}
                onSave={onSave}
              />
            )}
          </div>
        )}
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
  const saved = entry.tracking;
  const agreement = billingAgreement(entry);
  const [ruleType, setRuleType] = useState<"percent" | "fixed">(saved?.rule_type || agreement.defaultRule);
  const [ruleValue, setRuleValue] = useState(
    saved ? String(saved.rule_value) : agreement.requiresAgreement ? "" : String(entry.currentCommission),
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
  const [basis, setBasis] = useState<"issue" | "due">(
    saved?.expected_basis === "due" ? "due" : "issue",
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
  const parsedNet = netInvoiceAmount.trim() === "" ? null : Number(netInvoiceAmount.replace(",", "."));
  const previewCommission = billingCommission(ruleType, parsedValue, parsedNet);
  const automaticExpectedOn = nextMonthTenth(basis === "issue" ? issuedOn : dueOn);
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
    if (netInvoiceAmount.trim() && (parsedNet == null || !Number.isFinite(parsedNet) || parsedNet < 0)) {
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
        <div className="mt-4 grid gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Base do BM</p>
            <strong>{money.format(entry.baseAmount)}</strong>
          </div>
          <div>
            <p className="text-muted-foreground">Calculado pelo BM</p>
            <strong>{money.format(entry.currentCommission)}</strong>
          </div>
          <div>
            <p className="text-muted-foreground">{entry.companyId ? 'Repasse deste registro' : 'Faturamento deste registro'}</p>
            <strong>{previewCommission == null ? "A informar" : money.format(previewCommission)}</strong>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <h4 className="font-semibold">1. {entry.companyId ? 'Repasse / comissão' : 'Valor faturado pela Jacoby'}</h4>
        <p className="rounded-lg border bg-muted/30 p-3 text-sm">{agreement.message}</p>
        {saved?.rule_type === "percent" && saved.net_invoice_amount == null && (
          <p className="text-sm text-amber-800">O lançamento anterior usou a base do BM. Informe o líquido da nota e confira o percentual antes de salvar novamente. O valor salvo permanece no histórico até essa conferência.</p>
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
            <Label htmlFor="billing-rule-value">{ruleType === "percent" ? "Percentual (%)" : "Valor acordado (R$)"}</Label>
            <Input
              id="billing-rule-value"
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
            : "Informe o valor final combinado entre as partes. Não há percentual ou desconto automático."} O valor do BM continua intacto.
        </p>
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        <h4 className="font-semibold">2. Nota fiscal</h4>
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="billing-net-invoice">Valor líquido da nota fiscal (R$){ruleType === "percent" ? " · obrigatório" : " · opcional"}</Label>
          <Input id="billing-net-invoice" type="number" min="0" step="0.01" value={netInvoiceAmount} onChange={(event) => setNetInvoiceAmount(event.target.value)} placeholder="Valor após os descontos da nota" />
          <p className="text-xs text-muted-foreground">{ruleType === "percent" && parsedNet != null && previewCommission != null ? `${money.format(parsedNet)} × ${parsedValue}% = ${money.format(previewCommission)}` : "Informe o líquido correspondente a este lançamento, sem repetir o total da mesma nota em outras categorias."}</p>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Calcular dia 10 do mês seguinte à</Label>
            <Select value={basis} onValueChange={(value) => setBasis(value as "issue" | "due")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="issue">Emissão da nota</SelectItem>
                <SelectItem value="due">Vencimento da nota</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Previsão da comissão</Label>
            <Input
              type="date"
              value={expectedOn}
              disabled={!useManualDate}
              onChange={(event) => setManualExpectedOn(event.target.value)}
            />
          </div>
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
