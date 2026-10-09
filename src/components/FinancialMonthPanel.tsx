/** Painel financeiro mensal da Jacoby: o que entra e o que sai em cada mês de vencimento. */
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Info, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClients } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";

type Cycle = {
  id: string; client_id: string; branch_id: string | null; bulletin_number: number;
  issuer_type: "jacoby" | "outsourced"; outsourced_company_id: string | null; status: string;
  period_start: string; period_end: string; finalized_at: string | null;
  payment_due_date: string | null; payment_status: "pending" | "received"; received_on: string | null;
};
type Placement = { cycle_id: string; quantity: number; monthly_rental_rate: number; started_on: string | null };
type Movement = {
  id: string; cycle_id: string; confirmed: boolean; removed_quantity: number; weight_kg: number; exchange_rate: number;
  treatment_rate: number; waste_residue_id: string | null; occurred_on: string; service_order: string | null;
};
type Service = {
  id: string; cycle_id: string; waste_service_id: string | null; amount: number; quantity: number | null; outsourced_company_id: string | null;
  commission_rate: number | null; net_invoice_amount: number | null; commission_due_date: string | null; invoice_due_date: string | null;
  invoice_number: string | null; execution_date: string | null; payment_status: "pending" | "received"; received_on: string | null;
};
type Commission = {
  id: string; cycle_id: string; outsourced_company_id: string; source_type: "rental" | "exchange" | "treatment"; source_id: string;
  waste_residue_id: string | null; execution_date: string | null; base_amount: number; commission_rate: number;
  gross_commission_amount: number; tax_withholding_rate: number; tax_withheld_amount: number; net_commission_amount: number;
  payment_status: "pending" | "received"; received_on: string | null;
};
type Named = { id: string; name?: string; legal_name?: string; trade_name?: string | null };
type Residue = { id: string; name: string; jacoby_pays_client: boolean };

type Kind = "bm" | "commission" | "service" | "purchase";
type Detail = { label: string; formula: string; value: number };
type Item = {
  key: string; kind: Kind; due: string; amount: number; status: "pending" | "received" | "paid" | "scheduled";
  receivedOn: string | null; clientId: string; branchId: string | null; bulletin: number; company: string; cycle: Cycle;
  ids: string[]; description: string; details: Detail[]; dueTarget: { table: "billing_v2_cycles" | "billing_v2_cycle_services"; column: string; id: string } | null;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const unit = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
const qty = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
const pct = (value: number) => `${qty(value)}%`;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const value = new Date(`${date.slice(0, 10)}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};
const formatDate = (date: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(`${date.slice(0, 10)}T12:00:00`));
const shortDate = (date: string) => formatDate(date).slice(0, 5);
const monthLabel = (month: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
const shiftMonth = (month: string, delta: number) => {
  const value = new Date(`${month}-01T12:00:00`);
  value.setMonth(value.getMonth() + delta);
  return value.toISOString().slice(0, 7);
};
// Sem vencimento informado, o BM vence 15 dias após a emissão (finalização).
const cycleDue = (cycle: Cycle) => cycle.payment_due_date || addDays(cycle.finalized_at || cycle.period_end, 15);
const KIND: Record<Kind, { label: string; color: string; rule: string }> = {
  bm: { label: "BM emitido pela Jacoby", color: "bg-primary", rule: "Locação + trocas + tratamento + serviços dos BMs que a própria Jacoby emitiu e finalizou. Sucata comprada do cliente não entra aqui (vai para a saída)." },
  commission: { label: "Comissão de terceirizada", color: "bg-sky-500", rule: "Parte da Jacoby nos BMs emitidos por terceirizadas (LDJ, Eliana etc.), gerada automaticamente ao finalizar o BM: % sobre locação e troca, e R$/kg sobre o tratamento, menos a retenção de imposto configurada." },
  service: { label: "Comissão de serviço", color: "bg-violet-500", rule: "% de comissão sobre o valor (líquido da NF, quando informado) dos serviços executados por terceirizadas." },
  purchase: { label: "Sucata paga ao cliente", color: "bg-destructive", rule: "Sucata em BM da Jacoby: a Jacoby compra o material e paga o cliente (PIX no dia seguinte à coleta). É abatida do saldo. Quando quem compra é a Eliana, ela paga o cliente e a Jacoby recebe R$ 0,10/kg como comissão." },
};
const SOURCE_LABEL = { rental: "Locação", exchange: "Troca", treatment: "Tratamento" } as const;

export function FinancialMonthPanel() {
  const queryClient = useQueryClient();
  const { data: clients = [] } = useClients();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [expanded, setExpanded] = useState<string[]>([]);

  const dataQuery = useQuery({
    queryKey: ["financial-month-panel"],
    queryFn: async () => {
      const results = await Promise.all([
        (supabase.from("billing_v2_cycles" as any) as any)
          .select("id,client_id,branch_id,bulletin_number,issuer_type,outsourced_company_id,status,period_start,period_end,finalized_at,payment_due_date,payment_status,received_on")
          .eq("is_demo", false),
        (supabase.from("billing_v2_placements" as any) as any).select("cycle_id,quantity,monthly_rental_rate,started_on"),
        (supabase.from("billing_v2_movements" as any) as any).select("id,cycle_id,confirmed,removed_quantity,weight_kg,exchange_rate,treatment_rate,waste_residue_id,occurred_on,service_order"),
        (supabase.from("billing_v2_cycle_services" as any) as any).select("id,cycle_id,waste_service_id,amount,quantity,outsourced_company_id,commission_rate,net_invoice_amount,commission_due_date,invoice_due_date,invoice_number,execution_date,payment_status,received_on"),
        (supabase.from("outsourced_movement_commissions" as any) as any).select("id,cycle_id,outsourced_company_id,source_type,source_id,waste_residue_id,execution_date,base_amount,commission_rate,gross_commission_amount,tax_withholding_rate,tax_withheld_amount,net_commission_amount,payment_status,received_on"),
        (supabase.from("waste_residues" as any) as any).select("id,name,jacoby_pays_client"),
        (supabase.from("outsourced_companies" as any) as any).select("id,legal_name,trade_name"),
        (supabase.from("client_branches" as any) as any).select("id,name"),
        (supabase.from("waste_services" as any) as any).select("id,name"),
      ]);
      const failed = results.find((result) => result.error);
      if (failed) throw failed.error;
      const [cycles, placements, movements, services, commissions, residues, companies, branches, catalog] = results.map((result) => result.data || []);
      return {
        cycles: cycles as Cycle[], placements: placements as Placement[], movements: movements as Movement[],
        services: services as Service[], commissions: commissions as Commission[], residues: residues as Residue[],
        companies: companies as Named[], branches: branches as Named[], catalog: catalog as Named[],
      };
    },
  });

  const items = useMemo<Item[]>(() => {
    const data = dataQuery.data;
    if (!data) return [];
    const residueName = (id: string | null) => data.residues.find((item) => item.id === id)?.name || "Resíduo";
    const purchaseResidues = new Set(data.residues.filter((item) => item.jacoby_pays_client).map((item) => item.id));
    const isPurchase = (item: Movement) => Boolean(item.waste_residue_id && purchaseResidues.has(item.waste_residue_id));
    const companyName = (id: string | null) => {
      const company = data.companies.find((item) => item.id === id);
      return company?.trade_name || company?.legal_name || "Terceirizada";
    };
    const serviceName = (id: string | null) => data.catalog.find((item) => item.id === id)?.name || "Serviço";
    const movementById = new Map(data.movements.map((item) => [item.id, item]));
    const period = (cycle: Cycle) => `${shortDate(cycle.period_start)} a ${formatDate(cycle.period_end)}`;
    const result: Item[] = [];
    for (const cycle of data.cycles) {
      const base = { clientId: cycle.client_id, branchId: cycle.branch_id, bulletin: cycle.bulletin_number, cycle };
      const cycleDueTarget = { table: "billing_v2_cycles" as const, column: "payment_due_date", id: cycle.id };
      const confirmed = data.movements.filter((item) => item.cycle_id === cycle.id && item.confirmed).sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
      if (cycle.issuer_type === "jacoby") {
        // Sucata comprada do cliente: paga no dia seguinte à coleta, mesmo com o BM aberto.
        const purchasesByDue = new Map<string, Movement[]>();
        confirmed.filter(isPurchase).forEach((item) => {
          const due = addDays(item.occurred_on, 1);
          purchasesByDue.set(due, [...(purchasesByDue.get(due) || []), item]);
        });
        purchasesByDue.forEach((list, due) => {
          const details = list.map((item) => ({ label: `${formatDate(item.occurred_on)} · ${residueName(item.waste_residue_id)}${item.service_order ? ` · OS ${item.service_order}` : ""}`, formula: `${qty(Number(item.weight_kg))} kg × ${unit(Number(item.treatment_rate))}/kg`, value: -Number(item.weight_kg || 0) * Number(item.treatment_rate || 0) }));
          const total = details.reduce((sum, item) => sum + item.value, 0);
          if (total < 0) result.push({ ...base, key: `purchase-${cycle.id}-${due}`, kind: "purchase", due, amount: total, status: due <= today() ? "paid" : "scheduled", receivedOn: null, company: "", ids: [cycle.id], description: `Compra de ${qty(list.reduce((sum, item) => sum + Number(item.weight_kg || 0), 0))} kg de sucata · pago ao cliente`, details, dueTarget: null });
        });
        if (cycle.status !== "closed") continue;
        const details: Detail[] = [
          ...data.placements.filter((item) => item.cycle_id === cycle.id).map((item) => ({ label: `Locação de equipamento${item.started_on ? ` (desde ${formatDate(item.started_on)})` : ""}`, formula: `${qty(Number(item.quantity))} un. × ${unit(Number(item.monthly_rental_rate))}/mês`, value: Number(item.quantity || 0) * Number(item.monthly_rental_rate || 0) })),
          ...confirmed.filter((item) => Number(item.removed_quantity || 0) > 0 && Number(item.exchange_rate || 0) > 0).map((item) => ({ label: `${formatDate(item.occurred_on)} · Troca${item.service_order ? ` · OS ${item.service_order}` : ""}`, formula: `${qty(Number(item.removed_quantity))} troca(s) × ${unit(Number(item.exchange_rate))}`, value: Number(item.removed_quantity || 0) * Number(item.exchange_rate || 0) })),
          ...confirmed.filter((item) => !isPurchase(item) && Number(item.weight_kg || 0) > 0 && Number(item.treatment_rate || 0) > 0).map((item) => ({ label: `${formatDate(item.occurred_on)} · Tratamento de ${residueName(item.waste_residue_id)}`, formula: `${qty(Number(item.weight_kg))} kg × ${unit(Number(item.treatment_rate))}/kg`, value: Number(item.weight_kg || 0) * Number(item.treatment_rate || 0) })),
          ...data.services.filter((item) => item.cycle_id === cycle.id).map((item) => ({ label: `${item.execution_date ? `${formatDate(item.execution_date)} · ` : ""}${serviceName(item.waste_service_id)}`, formula: item.quantity && Number(item.quantity) !== 1 ? `${qty(Number(item.quantity))} × ${unit(Number(item.amount) / Number(item.quantity))}` : "Serviço avulso", value: Number(item.amount || 0) })),
        ];
        const total = details.reduce((sum, item) => sum + item.value, 0);
        if (total > 0) result.push({ ...base, key: `bm-${cycle.id}`, kind: "bm", due: cycleDue(cycle), amount: total, status: cycle.payment_status === "received" ? "received" : "pending", receivedOn: cycle.received_on, company: "Jacoby", ids: [cycle.id], description: `Cobrança do período ${period(cycle)} · ${details.length} lançamento(s)`, details, dueTarget: cycleDueTarget });
        continue;
      }
      if (cycle.status !== "closed") continue;
      const own = data.commissions.filter((item) => item.cycle_id === cycle.id && Number(item.net_commission_amount || 0) !== 0)
        .sort((a, b) => String(a.execution_date).localeCompare(String(b.execution_date)));
      const commissionTotal = own.reduce((sum, item) => sum + Number(item.net_commission_amount || 0), 0);
      if (commissionTotal > 0) {
        const received = own.every((item) => item.payment_status === "received");
        const details = own.map((item) => {
          const movement = movementById.get(item.source_id);
          const tax = Number(item.tax_withheld_amount || 0);
          const taxText = tax ? ` − retenção ${pct(Number(item.tax_withholding_rate))} (${money.format(tax)})` : "";
          const formula = item.source_type === "treatment"
            ? `${qty(Number(movement?.weight_kg ?? 0))} kg × ${unit(Number(item.commission_rate))}/kg = ${money.format(Number(item.gross_commission_amount))}${taxText}`
            : `${money.format(Number(item.base_amount))} × ${pct(Number(item.commission_rate))} = ${money.format(Number(item.gross_commission_amount))}${taxText}`;
          const what = item.source_type === "treatment" ? `Tratamento de ${residueName(item.waste_residue_id)}` : item.source_type === "exchange" ? `Troca${movement?.waste_residue_id ? ` · ${residueName(movement.waste_residue_id)}` : ""}` : "Locação de equipamento";
          return { label: `${item.execution_date ? `${formatDate(item.execution_date)} · ` : ""}${what}`, formula, value: Number(item.net_commission_amount || 0) };
        });
        const sources = Array.from(new Set(own.map((item) => SOURCE_LABEL[item.source_type]))).join(", ").toLowerCase();
        result.push({ ...base, key: `commission-${cycle.id}`, kind: "commission", due: cycleDue(cycle), amount: commissionTotal, status: received ? "received" : "pending", receivedOn: received ? own.map((item) => item.received_on || "").sort().at(-1) || null : null, company: companyName(cycle.outsourced_company_id), ids: own.map((item) => item.id), description: `Comissão sobre ${sources} · BM da ${companyName(cycle.outsourced_company_id)} de ${period(cycle)}`, details, dueTarget: cycleDueTarget });
      }
      data.services.filter((item) => item.cycle_id === cycle.id && item.outsourced_company_id && Number(item.commission_rate || 0) > 0).forEach((service) => {
        const baseValue = Number(service.net_invoice_amount ?? service.amount ?? 0);
        const value = baseValue * Number(service.commission_rate || 0) / 100;
        if (value <= 0) return;
        const name = serviceName(service.waste_service_id);
        result.push({
          ...base, key: `service-${service.id}`, kind: "service", due: service.commission_due_date || service.invoice_due_date || cycleDue(cycle), amount: value,
          status: service.payment_status === "received" ? "received" : "pending", receivedOn: service.received_on, company: companyName(service.outsourced_company_id), ids: [service.id],
          description: `${name}${service.invoice_number ? ` · NF ${service.invoice_number}` : ""}`,
          details: [{ label: `${service.execution_date ? `${formatDate(service.execution_date)} · ` : ""}${name}`, formula: `${money.format(baseValue)} (${service.net_invoice_amount != null ? "líquido da NF" : "valor do serviço"}) × ${pct(Number(service.commission_rate))}`, value }],
          dueTarget: { table: "billing_v2_cycle_services", column: "commission_due_date", id: service.id },
        });
      });
    }
    return result;
  }, [dataQuery.data]);

  const branchName = (id: string | null) => id ? (dataQuery.data?.branches.find((item) => item.id === id)?.name || "Filial") : "Matriz";
  const clientName = (id: string) => clients.find((item) => item.id === id)?.name || "Cliente";
  const inClient = (item: Item) => clientFilter === "all" || item.clientId === clientFilter;
  const monthItems = items.filter((item) => item.due.slice(0, 7) === month && inClient(item));
  const incoming = monthItems.filter((item) => item.amount > 0);
  const outgoing = monthItems.filter((item) => item.amount < 0);
  const sum = (list: Item[]) => list.reduce((total, item) => total + item.amount, 0);
  const expected = sum(incoming);
  const received = sum(incoming.filter((item) => item.status === "received"));
  const open = expected - received;
  const overdue = sum(incoming.filter((item) => item.status === "pending" && item.due < today()));
  const purchases = -sum(outgoing);
  const byKind = (Object.keys(KIND) as Kind[]).map((kind) => ({ kind, total: sum(monthItems.filter((item) => item.kind === kind)) })).filter((row) => row.total !== 0);
  const byClient = Array.from(monthItems.reduce((map, item) => map.set(item.clientId, (map.get(item.clientId) || 0) + item.amount), new Map<string, number>()))
    .map(([id, total]) => ({ id, total })).sort((a, b) => b.total - a.total);
  const chartData = Array.from({ length: 12 }, (_, index) => shiftMonth(month, index - 11)).map((value) => {
    const list = items.filter((item) => item.due.slice(0, 7) === value && inClient(item));
    return {
      month: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(`${value}-01T12:00:00`)).replace(".", "") + "/" + value.slice(2, 4),
      receber: Math.round(sum(list.filter((item) => item.amount > 0)) * 100) / 100,
      sucata: Math.round(-sum(list.filter((item) => item.amount < 0)) * 100) / 100,
    };
  });
  const shown = monthItems.filter((item) => kindFilter === "all" || item.kind === kindFilter).sort((a, b) => a.due.localeCompare(b.due) || b.amount - a.amount);
  const monthClients = Array.from(new Set(items.filter((item) => item.due.slice(0, 7) === month).map((item) => item.clientId)));
  const toggle = (key: string) => setExpanded((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["financial-month-panel"] });
    void queryClient.invalidateQueries({ queryKey: ["outsourced-movement-commissions"] });
    void queryClient.invalidateQueries({ queryKey: ["outsourced-financial-services"] });
  };
  const setReceived = useMutation({
    mutationFn: async ({ item, receivedOn }: { item: Item; receivedOn: string | null }) => {
      const payload = { payment_status: receivedOn ? "received" : "pending", received_on: receivedOn };
      const table = item.kind === "bm" ? "billing_v2_cycles" : item.kind === "commission" ? "outsourced_movement_commissions" : "billing_v2_cycle_services";
      const { error } = await (supabase.from(table as any) as any).update(payload).in("id", item.ids);
      if (error) throw error;
    },
    onSuccess: (_, variables) => { refresh(); toast.success(variables.receivedOn ? "Recebimento registrado." : "Recebimento desfeito."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const setDue = useMutation({
    mutationFn: async ({ item, due }: { item: Item; due: string }) => {
      if (!item.dueTarget) return;
      const { error } = await (supabase.from(item.dueTarget.table as any) as any).update({ [item.dueTarget.column]: due || null }).eq("id", item.dueTarget.id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Vencimento atualizado."); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (dataQuery.isLoading) return <Card className="p-8 text-sm text-muted-foreground">Carregando painel financeiro...</Card>;
  if (dataQuery.error) return <Card className="p-8 text-sm text-destructive">{(dataQuery.error as Error).message}</Card>;

  return <div className="space-y-4">
    <Card className="flex flex-wrap items-end justify-between gap-3 p-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <Input type="month" className="w-44" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} />
        <Button variant="outline" size="icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Button>
        <p className="ml-2 text-lg font-semibold capitalize">{monthLabel(month)}</p>
      </div>
      <div className="w-64"><Select value={clientFilter} onValueChange={setClientFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os clientes</SelectItem>{clients.filter((client) => monthClients.includes(client.id) || client.id === clientFilter).map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></div>
    </Card>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric icon={ArrowUpCircle} label="A receber no mês" hint="Tudo que vence neste mês" value={expected} tone="text-primary" />
      <Metric icon={CheckCircle2} label="Já recebido" hint="Marcado como recebido" value={received} tone="text-emerald-600" />
      <Metric icon={Clock} label="Em aberto" hint={overdue > 0 ? `${money.format(overdue)} já vencido` : "Ainda não recebido"} value={open} tone={overdue > 0 ? "text-destructive" : "text-amber-600"} />
      <Metric icon={ArrowDownCircle} label="Sucata paga a clientes" hint="Saída: compra de material" value={-purchases} tone="text-destructive" />
      <Metric icon={Wallet} label="Saldo líquido do mês" hint="A receber − sucata paga" value={expected - purchases} tone="text-foreground" strong />
    </div>

    <details className="group rounded-lg border bg-card p-4 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><Info className="h-4 w-4 text-primary" />Como o painel calcula<ChevronDown className="ml-auto h-4 w-4 transition group-open:rotate-180" /></summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">{(Object.keys(KIND) as Kind[]).map((kind) => <p key={kind} className="flex gap-2"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${KIND[kind].color}`} /><span><strong>{KIND[kind].label}:</strong> {KIND[kind].rule}</span></p>)}</div>
        <div className="space-y-2 text-muted-foreground">
          <p><strong className="text-foreground">Mês de cada valor:</strong> é o mês do vencimento. BMs e comissões vencem 15 dias após a finalização do BM, e o vencimento pode ser alterado na própria linha. Comissões de serviço usam o vencimento da comissão (ou da NF).</p>
          <p><strong className="text-foreground">Situações:</strong> <span className="text-amber-700 dark:text-amber-300">A receber</span> (ainda no prazo) · <span className="text-destructive">Vencido</span> (prazo passou sem baixa) · <span className="text-emerald-700 dark:text-emerald-300">Recebido</span> (baixa registrada) · <span>A pagar / Pago ao cliente</span> (sucata).</p>
          <p><strong className="text-foreground">Detalhes:</strong> clique em qualquer lançamento para ver de onde vem o valor, item por item, com a conta feita.</p>
        </div>
      </div>
    </details>

    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card className="p-4"><h2 className="font-semibold">Últimos 12 meses</h2><p className="text-sm text-muted-foreground">Pelo mês de vencimento.</p><div className="mt-3 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="month" fontSize={12} /><YAxis fontSize={12} tickFormatter={(value: number) => value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)} /><Tooltip formatter={(value: number, name: string) => [money.format(value), name]} /><Legend /><Bar dataKey="receber" name="A receber" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} /><Bar dataKey="sucata" name="Sucata paga" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
      <Card className="space-y-4 p-4">
        <div><h2 className="font-semibold">Por origem</h2><div className="mt-2 space-y-1.5 text-sm">{byKind.length ? byKind.map((row) => <button key={row.kind} type="button" onClick={() => setKindFilter(kindFilter === row.kind ? "all" : row.kind)} className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-muted ${kindFilter === row.kind ? "bg-muted font-medium" : ""}`}><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${KIND[row.kind].color}`} />{KIND[row.kind].label}</span><span className={row.total < 0 ? "text-destructive" : ""}>{money.format(row.total)}</span></button>) : <p className="text-muted-foreground">Nada neste mês.</p>}</div></div>
        <div><h2 className="font-semibold">Por cliente</h2><div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-sm">{byClient.map((row) => <button key={row.id} type="button" onClick={() => setClientFilter(clientFilter === row.id ? "all" : row.id)} className={`flex w-full justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-muted ${clientFilter === row.id ? "bg-muted font-medium" : ""}`}><span className="truncate">{clientName(row.id)}</span><span className={row.total < 0 ? "shrink-0 text-destructive" : "shrink-0"}>{money.format(row.total)}</span></button>)}</div></div>
      </Card>
    </div>

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4"><div><h2 className="font-semibold">Lançamentos de {monthLabel(month)}</h2><p className="text-sm text-muted-foreground">Clique em um lançamento para ver o detalhamento. Marque o recebimento quando o valor cair na conta.</p></div><div className="w-60"><Select value={kindFilter} onValueChange={(value) => setKindFilter(value as typeof kindFilter)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as origens</SelectItem>{(Object.keys(KIND) as Kind[]).map((kind) => <SelectItem key={kind} value={kind}>{KIND[kind].label}</SelectItem>)}</SelectContent></Select></div></div>
      {!shown.length ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhum lançamento neste mês.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-muted-foreground"><th className="w-8 p-3" /><th className="p-3">Vencimento</th><th className="p-3">Origem e descrição</th><th className="p-3">Cliente / pátio</th><th className="p-3">BM</th><th className="p-3 text-right">Valor</th><th className="p-3">Situação</th><th className="p-3" /></tr></thead><tbody>{shown.map((item) => {
        const late = item.status === "pending" && item.due < today();
        const open = expanded.includes(item.key);
        const badge = item.status === "received" ? ["Recebido" + (item.receivedOn ? ` em ${formatDate(item.receivedOn)}` : ""), "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"]
          : item.status === "paid" ? ["Pago ao cliente", "bg-muted text-muted-foreground"]
          : item.status === "scheduled" ? ["A pagar", "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"]
          : late ? ["Vencido", "bg-destructive/10 text-destructive"] : ["A receber", "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"];
        return <Fragment key={item.key}>
          <tr className={`cursor-pointer border-b align-middle hover:bg-muted/30 ${open ? "bg-muted/30" : ""}`} onClick={() => toggle(item.key)}>
            <td className="p-3"><ChevronDown className={`h-4 w-4 text-muted-foreground transition ${open ? "rotate-180" : ""}`} /></td>
            <td className="p-3" onClick={(event) => event.stopPropagation()}>{item.dueTarget && item.status !== "received" ? <Input type="date" className="h-8 w-36" defaultValue={item.due} key={item.due} onBlur={(event) => event.target.value && event.target.value !== item.due && setDue.mutate({ item, due: event.target.value })} /> : formatDate(item.due)}</td>
            <td className="max-w-md p-3"><p className="flex items-center gap-2 font-medium"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${KIND[item.kind].color}`} />{KIND[item.kind].label}{item.company && item.kind !== "bm" && <span className="font-normal text-muted-foreground">· {item.company}</span>}</p><p className="mt-0.5 truncate text-xs text-muted-foreground" title={item.description}>{item.description}</p></td>
            <td className="p-3"><p className="font-medium">{clientName(item.clientId)}</p><p className="text-xs text-muted-foreground">{branchName(item.branchId)}</p></td>
            <td className="p-3">#{String(item.bulletin || 0).padStart(3, "0")}</td>
            <td className={`p-3 text-right font-semibold ${item.amount < 0 ? "text-destructive" : ""}`}>{money.format(item.amount)}</td>
            <td className="p-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${badge[1]}`}>{badge[0]}</span></td>
            <td className="p-3 text-right" onClick={(event) => event.stopPropagation()}>{item.kind !== "purchase" && (item.status === "received"
              ? <Button size="sm" variant="ghost" disabled={setReceived.isPending} onClick={() => setReceived.mutate({ item, receivedOn: null })}><Undo2 className="mr-1 h-3.5 w-3.5" />Desfazer</Button>
              : <Button size="sm" variant="outline" disabled={setReceived.isPending} onClick={() => setReceived.mutate({ item, receivedOn: today() })}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Marcar recebido</Button>)}</td>
          </tr>
          {open && <tr className="border-b bg-muted/20"><td /><td colSpan={7} className="p-3 pt-1">
            <p className="mb-2 text-xs text-muted-foreground">{KIND[item.kind].rule}</p>
            <div className="overflow-hidden rounded-md border bg-background">{item.details.map((detail, index) => <div key={index} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-3 py-2 last:border-b-0"><span>{detail.label}</span><span className="flex items-center gap-4"><span className="text-muted-foreground">{detail.formula}</span><span className={`w-28 text-right font-medium ${detail.value < 0 ? "text-destructive" : ""}`}>{money.format(detail.value)}</span></span></div>)}
              <div className="flex justify-between bg-muted/40 px-3 py-2 font-semibold"><span>Total {item.kind === "commission" ? "líquido da comissão" : item.kind === "purchase" ? "pago ao cliente" : ""}</span><span className={item.amount < 0 ? "text-destructive" : ""}>{money.format(item.amount)}</span></div>
            </div>
          </td></tr>}
        </Fragment>;
      })}</tbody></table></div>}
    </Card>
  </div>;
}

function Metric({ icon: Icon, label, hint, value, tone, strong }: { icon: typeof Wallet; label: string; hint: string; value: number; tone: string; strong?: boolean }) {
  return <Card className={`p-4 ${strong ? "border-primary/40 bg-primary/5" : ""}`}><div className="flex items-start justify-between gap-2"><div><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-bold ${tone}`}>{money.format(value)}</p><p className={`mt-0.5 text-xs ${hint.includes("vencido") ? "text-destructive" : "text-muted-foreground"}`}>{hint}</p></div><Icon className={`h-5 w-5 ${tone}`} /></div></Card>;
}
