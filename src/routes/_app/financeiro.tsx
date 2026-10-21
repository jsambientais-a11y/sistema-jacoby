import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, HandCoins, Pencil } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useClients } from "@/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinancialMonthPanel } from "@/components/FinancialMonthPanel";
import { BillingFlowPreview, type BillingFlowEntry, type BillingFlowSaveInput, type BillingFlowTracking } from "@/components/BillingFlowPreview";
import type { BillingBulletin } from "@/lib/billing-bulletins";

export const Route = createFileRoute("/_app/financeiro")({ component: FinancialControlPage });

// Mantém a tela anterior no código para consulta durante a validação do novo fluxo.
// Ela não aparece na navegação nem altera os lançamentos existentes.
const SHOW_ARCHIVED_FINANCIAL_VIEW = false;

type FinancialService = {
  id: string;
  cycle_id: string;
  waste_service_id: string;
  outsourced_company_id: string | null;
  amount: number;
  execution_date: string | null;
  request_date: string | null;
  equipment_description: string | null;
  quantity: number | null;
  description: string | null;
  service_order: string | null;
  closing_date: string | null;
  invoice_issued_on: string | null;
  invoice_pdf_name: string | null;
  invoice_pdf_path: string | null;
  invoice_number: string | null;
  invoice_due_date: string | null;
  net_invoice_amount: number | null;
  commission_rate: number;
  commission_due_date: string | null;
  certificate_number: string | null;
  certificate_expires_on: string | null;
  payment_status: "pending" | "received";
  received_on: string | null;
  financial_notes: string | null;
};
type Cycle = {
  id: string; client_id: string; branch_id: string | null; bulletin_number: number;
  issuer_type: "jacoby" | "outsourced"; status: "draft" | "closed";
  outsourced_company_id: string | null;
  period_start: string; period_end: string; finalized_at: string | null;
};
type BillingPlacement = { cycle_id: string; quantity: number; monthly_rental_rate: number };
type BillingMovement = { cycle_id: string; confirmed: boolean; removed_quantity: number; weight_kg: number; exchange_rate: number; treatment_rate: number; waste_residue_id: string | null };
type BillingServiceAmount = { cycle_id: string; amount: number };
type MovementCommission = {
  id: string;
  cycle_id: string;
  client_id: string;
  outsourced_company_id: string;
  source_type: "rental" | "exchange" | "treatment";
  waste_residue_id: string | null;
  execution_date: string | null;
  base_amount: number;
  commission_rate: number;
  gross_commission_amount: number;
  tax_withheld_amount: number;
  net_commission_amount: number;
  payment_status: "pending" | "received";
  received_on: string | null;
};
type Named = { id: string; name?: string; legal_name?: string; trade_name?: string | null };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const emptyForm = {
  amount: "0",
  request_date: "",
  equipment_description: "",
  quantity: "",
  description: "",
  service_order: "",
  closing_date: "",
  invoice_issued_on: "",
  invoice_number: "",
  invoice_due_date: "",
  net_invoice_amount: "",
  commission_rate: "0",
  commission_due_date: "",
  certificate_number: "",
  certificate_expires_on: "",
  payment_status: "pending",
  received_on: "",
  financial_notes: "",
};
const paymentIsReceived = (item: Pick<FinancialService, "payment_status" | "received_on">) => {
  const today = new Date().toISOString().slice(0, 10);
  return item.payment_status === "received" && (!item.received_on || item.received_on <= today);
};

function FinancialControlPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { data: clients = [] } = useClients();
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [financialView, setFinancialView] = useState("painel");
  const [editing, setEditing] = useState<FinancialService | null>(null);
  const [form, setForm] = useState(emptyForm);
  const servicesQuery = useQuery({
    queryKey: ["outsourced-financial-services"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_cycle_services" as any) as any)
        .select("*")
        .not("outsourced_company_id", "is", null)
        .not("execution_date", "is", null)
        .order("execution_date", { ascending: false });
      if (error) throw error;
      return (data || []) as FinancialService[];
    },
  });
  const movementCommissionsQuery = useQuery({
    queryKey: ["outsourced-movement-commissions"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("outsourced_movement_commissions" as any) as any)
        .select("*")
        .order("execution_date", { ascending: false });
      if (error) throw error;
      return (data || []) as MovementCommission[];
    },
  });
  const billingTrackingQuery = useQuery({
    queryKey: ["billing-receivable-tracking"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_receivable_tracking" as any) as any)
        .select("*");
      if (error) throw error;
      return (data || []) as BillingFlowTracking[];
    },
  });
  const cyclesQuery = useQuery({
    queryKey: ["outsourced-financial-cycles"],
    queryFn: async () => {
      // BMs do RAG pertencem exclusivamente ao ambiente de demonstração e não
      // podem compor nenhuma visão ou total do Financeiro interno.
      const { data, error } = await (supabase.from("billing_v2_cycles" as any) as any)
        .select("id,client_id,branch_id,bulletin_number,issuer_type,outsourced_company_id,status,period_start,period_end,finalized_at")
        .eq("is_demo", false);
      if (error) throw error;
      return (data || []) as Cycle[];
    },
  });
  const directBillingDataQuery = useQuery({
    queryKey: ["jacoby-direct-billing-data"],
    enabled: true,
    queryFn: async () => {
      const [placements, movements, services] = await Promise.all([
        (supabase.from("billing_v2_placements" as any) as any).select("cycle_id,quantity,monthly_rental_rate"),
        (supabase.from("billing_v2_movements" as any) as any).select("cycle_id,confirmed,removed_quantity,weight_kg,exchange_rate,treatment_rate,waste_residue_id"),
        (supabase.from("billing_v2_cycle_services" as any) as any).select("cycle_id,amount"),
      ]);
      if (placements.error) throw placements.error;
      if (movements.error) throw movements.error;
      if (services.error) throw services.error;
      return {
        placements: (placements.data || []) as BillingPlacement[],
        movements: (movements.data || []) as BillingMovement[],
        services: (services.data || []) as BillingServiceAmount[],
      };
    },
  });
  const companiesQuery = useQuery({
    queryKey: ["outsourced-financial-companies"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("outsourced_companies" as any) as any)
        .select("id,legal_name,trade_name")
        .order("legal_name");
      if (error) throw error;
      return (data || []) as Named[];
    },
  });
  const servicesCatalogQuery = useQuery({
    queryKey: ["outsourced-financial-service-catalog"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("waste_services" as any) as any).select(
        "id,name",
      );
      if (error) throw error;
      return (data || []) as Named[];
    },
  });
  const branchesQuery = useQuery({
    queryKey: ["outsourced-financial-branches"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_branches" as any) as any).select(
        "id,name",
      );
      if (error) throw error;
      return (data || []) as Named[];
    },
  });
  const residuesQuery = useQuery({
    queryKey: ["outsourced-financial-residues"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("waste_residues" as any) as any).select("id,name,jacoby_pays_client");
      if (error) throw error;
      return (data || []) as (Named & { jacoby_pays_client: boolean })[];
    },
  });
  const cycles = cyclesQuery.data || [],
    companies = companiesQuery.data || [],
    catalog = servicesCatalogQuery.data || [],
    branches = branchesQuery.data || [],
    residues = residuesQuery.data || [];
  const rows = useMemo(
    () =>
      (servicesQuery.data || [])
        .map((item) => {
          const cycle = cycles.find((value) => value.id === item.cycle_id);
          const client = clients.find((value) => value.id === cycle?.client_id);
          const company = companies.find((value) => value.id === item.outsourced_company_id);
          const service = catalog.find((value) => value.id === item.waste_service_id);
          const branch = branches.find((value) => value.id === cycle?.branch_id);
          return {
            item,
            cycle,
            clientName: client?.name || "",
            companyName: company?.trade_name || company?.legal_name || "",
            serviceName: service?.name || "",
            branchName: branch?.name || "",
          };
        })
        .filter(
          (row) =>
            Boolean(row.cycle) &&
            (companyFilter === "all" || row.item.outsourced_company_id === companyFilter) &&
            (statusFilter === "all" || (statusFilter === "received" ? paymentIsReceived(row.item) : !paymentIsReceived(row.item))),
        ),
    [
      servicesQuery.data,
      cycles,
      clients,
      companies,
      catalog,
      branches,
      companyFilter,
      statusFilter,
    ],
  );
  const totalOpen = rows
    .filter((row) => !paymentIsReceived(row.item))
    .reduce((total, row) => total + Number(row.item.net_invoice_amount ?? row.item.amount ?? 0), 0);
  const totalReceived = rows
    .filter((row) => paymentIsReceived(row.item))
    .reduce((total, row) => total + Number(row.item.net_invoice_amount ?? row.item.amount ?? 0), 0);
  const commissionTotal = rows.reduce(
    (total, row) =>
      total +
      (Number(row.item.net_invoice_amount ?? row.item.amount ?? 0) *
        Number(row.item.commission_rate || 0)) /
        100,
    0,
  );
  const movementCommissionRows = useMemo(
    () => (movementCommissionsQuery.data || []).map((item) => {
      const cycle = cycles.find((value) => value.id === item.cycle_id);
      const client = clients.find((value) => value.id === item.client_id);
      const company = companies.find((value) => value.id === item.outsourced_company_id);
      const residue = residues.find((value) => value.id === item.waste_residue_id);
      return { item, cycle, clientName: client?.name || "", companyName: company?.trade_name || company?.legal_name || "", residueName: residue?.name || "" };
    }).filter((row) =>
      Boolean(row.cycle) &&
      (companyFilter === "all" || row.item.outsourced_company_id === companyFilter),
    ),
    [movementCommissionsQuery.data, cycles, clients, companies, residues, companyFilter],
  );
  const movementCommissionTotal = movementCommissionRows.reduce((total, row) => total + Number(row.item.net_commission_amount || 0), 0);
  const directBillingRows = useMemo(() => {
    const billingData = directBillingDataQuery.data;
    if (!billingData) return [];
    return cycles
      .filter((cycle) => cycle.status === "closed" && cycle.issuer_type === "jacoby")
      .map((cycle) => {
        const rental = billingData.placements.filter((item) => item.cycle_id === cycle.id)
          .reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.monthly_rental_rate || 0), 0);
        const confirmed = billingData.movements.filter((item) => item.cycle_id === cycle.id && item.confirmed);
        const exchange = confirmed.reduce((sum, item) => sum + Number(item.removed_quantity || 0) * Number(item.exchange_rate || 0), 0);
        // Sucata comprada do cliente é paga pela Jacoby: abate do total em vez de somar.
        const purchased = new Set((residuesQuery.data || []).filter((item: any) => item.jacoby_pays_client).map((item) => item.id));
        const isPurchase = (item: BillingMovement) => Boolean(item.waste_residue_id && purchased.has(item.waste_residue_id));
        const treatment = confirmed.filter((item) => !isPurchase(item)).reduce((sum, item) => sum + Number(item.weight_kg || 0) * Number(item.treatment_rate || 0), 0);
        const purchases = confirmed.filter(isPurchase).reduce((sum, item) => sum + Number(item.weight_kg || 0) * Number(item.treatment_rate || 0), 0);
        const services = billingData.services.filter((item) => item.cycle_id === cycle.id)
          .reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const client = clients.find((item) => item.id === cycle.client_id);
        const branch = branches.find((item) => item.id === cycle.branch_id);
        return { cycle, clientName: client?.name || "", branchName: branch?.name || "Matriz", rental, exchange, treatment, services, purchases, total: rental + exchange + treatment + services - purchases };
      })
      .sort((a, b) => String(b.cycle.finalized_at || "").localeCompare(String(a.cycle.finalized_at || "")));
  }, [cycles, clients, branches, directBillingDataQuery.data, residuesQuery.data]);
  const directBillingTotal = directBillingRows.reduce((total, row) => total + row.total, 0);
  const totalCommissions = commissionTotal + movementCommissionTotal;
  const consolidatedTotal = directBillingTotal + totalCommissions;
  const issuedBulletins = useMemo<BillingBulletin[]>(() => cycles.filter((cycle) => cycle.status === "closed").map((cycle) => {
    const company = companies.find((item) => item.id === cycle.outsourced_company_id);
    return {
      id: cycle.id,
      number: cycle.bulletin_number || 0,
      emittedAt: cycle.finalized_at,
      client: clients.find((item) => item.id === cycle.client_id)?.name || "Cliente não identificado",
      branch: branches.find((item) => item.id === cycle.branch_id)?.name || "Matriz",
      company: cycle.issuer_type === "jacoby" ? "Jacoby" : company?.trade_name || company?.legal_name || "Terceirizada não identificada",
    };
  }), [cycles, companies, clients, branches]);
  const billingFlowEntries = useMemo<BillingFlowEntry[]>(() => {
    const grouped = new Map<string, BillingFlowEntry>();
    const savedByKey = new Map((billingTrackingQuery.data || []).map((item) => [`${item.cycle_id}:${item.category}:${item.source_key}`, item]));
    const add = (entry: Omit<BillingFlowEntry, "itemsCount" | "tracking">) => {
      const key = `${entry.cycleId}:${entry.category}:${entry.companyId || 'jacoby'}`;
      const current = grouped.get(key);
      if (current) {
        current.baseAmount += entry.baseAmount;
        current.currentCommission += entry.currentCommission;
        current.itemsCount += 1;
        current.isScrap ||= entry.isScrap;
        current.legacyInvoiceNumber = null;
        current.legacyIssuedOn = null;
        current.legacyDueOn = null;
        current.legacyExpectedOn = null;
        current.legacyPaidOn = null;
      } else {
        grouped.set(key, { ...entry, itemsCount: 1, tracking: savedByKey.get(key) });
      }
    };
    for (const { item, cycle, clientName, companyName, residueName } of movementCommissionRows) {
      if (!cycle || cycle.status !== "closed") continue;
      add({
        id: `${cycle.id}:${item.source_type}:${item.outsourced_company_id}`,
        cycleId: cycle.id,
        companyId: item.outsourced_company_id,
        category: item.source_type,
        bulletin: `#${String(cycle.bulletin_number || 0).padStart(3, "0")}`,
        client: clientName || "Cliente não identificado",
        branch: branches.find((branch) => branch.id === cycle.branch_id)?.name || "Matriz",
        company: companyName || "Terceirizada não identificada",
        description: item.source_type === "treatment" ? `Tratamento · ${residueName || "resíduo"}` : item.source_type === "exchange" ? "Troca de equipamentos" : "Locação de equipamentos",
        isScrap: item.source_type === "treatment" && Boolean(residues.find((residue) => residue.id === item.waste_residue_id)?.jacoby_pays_client),
        baseAmount: Number(item.base_amount || 0),
        currentCommission: Number(item.net_commission_amount || 0),
      });
    }
    for (const { item, cycle, clientName, companyName, serviceName, branchName } of rows) {
      if (!cycle || cycle.status !== "closed" || !item.outsourced_company_id) continue;
      const baseAmount = Number(item.net_invoice_amount ?? item.amount ?? 0);
      add({
        id: `${cycle.id}:service:${item.outsourced_company_id}`,
        cycleId: cycle.id,
        companyId: item.outsourced_company_id,
        category: "service",
        bulletin: `#${String(cycle.bulletin_number || 0).padStart(3, "0")}`,
        client: clientName || "Cliente não identificado",
        branch: branchName || "Matriz",
        company: companyName || "Terceirizada não identificada",
        description: serviceName || item.description || "Serviço terceirizado",
        baseAmount,
        currentCommission: baseAmount * Number(item.commission_rate || 0) / 100,
        legacyInvoiceNumber: item.invoice_number,
        legacyIssuedOn: item.invoice_issued_on,
        legacyDueOn: item.invoice_due_date,
        legacyExpectedOn: item.commission_due_date,
        legacyPaidOn: item.received_on,
      });
    }
    for (const direct of directBillingRows) {
      const { cycle, clientName, branchName } = direct;
      for (const [category, amount, description] of [
        ['rental', direct.rental, 'Locação de equipamentos'],
        ['exchange', direct.exchange, 'Troca de equipamentos'],
        ['treatment', direct.treatment - direct.purchases, 'Tratamento de resíduos'],
        ['service', direct.services, 'Serviços'],
      ] as const) {
        if (amount <= 0) continue;
        add({
          id: `${cycle.id}:${category}:jacoby`, cycleId: cycle.id, companyId: null,
          category, bulletin: `#${String(cycle.bulletin_number || 0).padStart(3, '0')}`,
          client: clientName || 'Cliente não identificado', branch: branchName || 'Matriz',
          company: 'Jacoby (faturamento direto)', description,
          baseAmount: amount, currentCommission: amount,
        });
      }
    }
    return [...grouped.values()].sort((a, b) => b.bulletin.localeCompare(a.bulletin));
  }, [movementCommissionRows, rows, branches, residues, directBillingRows, billingTrackingQuery.data]);
  const saveBillingTracking = useMutation({
    mutationFn: async (input: BillingFlowSaveInput) => {
      const { entry, ...values } = input;
      const { data, error } = await (supabase.from("billing_receivable_tracking" as any) as any)
        .upsert({
          cycle_id: entry.cycleId,
          category: entry.category,
          outsourced_company_id: entry.companyId,
          source_key: entry.companyId || 'jacoby',
          base_amount_snapshot: Number(entry.baseAmount.toFixed(2)),
          ...values,
        }, { onConflict: "cycle_id,category,source_key" })
        .select("*")
        .single();
      if (error) throw error;
      return data as BillingFlowTracking;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["billing-receivable-tracking"] });
      void queryClient.invalidateQueries({ queryKey: ["financial-month-panel"] });
      toast.success("Conferência de faturamento salva.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const settleMovementCommission = useMutation({
    mutationFn: async (item: MovementCommission) => {
      const received = item.payment_status !== "received";
      const { error } = await (supabase.from("outsourced_movement_commissions" as any) as any)
        .update({ payment_status: received ? "received" : "pending", received_on: received ? new Date().toISOString().slice(0, 10) : null })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["outsourced-movement-commissions"] }),
    onError: (error: Error) => toast.error(error.message),
  });
  const openEdit = (item: FinancialService) => {
    setEditing(item);
    setForm({
      amount: String(item.amount ?? 0),
      request_date: item.request_date || "",
      equipment_description: item.equipment_description || "",
      quantity: item.quantity == null ? "" : String(item.quantity),
      description: item.description || "",
      service_order: item.service_order || "",
      closing_date: item.closing_date || "",
      invoice_issued_on: item.invoice_issued_on || "",
      invoice_number: item.invoice_number || "",
      invoice_due_date: item.invoice_due_date || "",
      net_invoice_amount: item.net_invoice_amount == null ? "" : String(item.net_invoice_amount),
      commission_rate: String(item.commission_rate || 0),
      commission_due_date: item.commission_due_date || "",
      certificate_number: item.certificate_number || "",
      certificate_expires_on: item.certificate_expires_on || "",
      payment_status: item.payment_status || "pending",
      received_on: item.received_on || "",
      financial_notes: item.financial_notes || "",
    });
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const numberOrNull = (value: string) =>
        value === "" ? null : Number(value.replace(",", "."));
      const payload = {
        amount: numberOrNull(form.amount) ?? 0,
        request_date: form.request_date || null,
        equipment_description: form.equipment_description.trim() || null,
        quantity: numberOrNull(form.quantity),
        description: form.description.trim() || null,
        service_order: form.service_order.trim() || null,
        closing_date: form.closing_date || null,
        invoice_issued_on: form.invoice_issued_on || null,
        invoice_number: form.invoice_number.trim() || null,
        invoice_due_date: form.invoice_due_date || null,
        net_invoice_amount: numberOrNull(form.net_invoice_amount),
        commission_rate: numberOrNull(form.commission_rate) ?? 0,
        commission_due_date: form.commission_due_date || null,
        certificate_number: form.certificate_number.trim() || null,
        certificate_expires_on: form.certificate_expires_on || null,
      payment_status: form.payment_status === "received" && (!form.received_on || form.received_on <= new Date().toISOString().slice(0, 10)) ? "received" : "pending",
        received_on: form.received_on || null,
        financial_notes: form.financial_notes.trim() || null,
      };
      const { error } = await (supabase.from("billing_v2_cycle_services" as any) as any)
        .update(payload)
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["outsourced-financial-services"] });
      setEditing(null);
      toast.success("Controle financeiro atualizado.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const openInvoicePdf = async (item: FinancialService) => {
    if (!item.invoice_pdf_path) return;
    const { data, error } = await supabase.storage.from("movement-documents")
      .createSignedUrl(item.invoice_pdf_path, 600);
    if (error || !data?.signedUrl) return toast.error(error?.message || "Não foi possível abrir o PDF.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  if (!hasPermission("billing")) return <Navigate to="/dashboard" />;
  if (!SHOW_ARCHIVED_FINANCIAL_VIEW) {
    return (
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
        <header>
          <p className="text-sm font-medium text-primary">Controle de notas e repasses</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Faturamento</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Acompanhe cada BM até a emissão da nota, a previsão da comissão e o recebimento.
          </p>
        </header>
        <BillingFlowPreview
          entries={billingFlowEntries}
          bulletins={issuedBulletins}
          isLoading={servicesQuery.isLoading || movementCommissionsQuery.isLoading || cyclesQuery.isLoading || directBillingDataQuery.isLoading || billingTrackingQuery.isLoading}
          loadError={[servicesQuery, movementCommissionsQuery, cyclesQuery, directBillingDataQuery, billingTrackingQuery, companiesQuery, branchesQuery, servicesCatalogQuery].map((query) => query.error).find((error) => error instanceof Error)?.message || null}
          isSaving={saveBillingTracking.isPending}
          onSave={(input) => saveBillingTracking.mutateAsync(input).then(() => undefined)}
        />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-primary">Receitas e comissões</p>
        <h1 className="text-2xl font-bold">Faturamento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Serviços emitidos por terceirizada entram aqui automaticamente quando a data de execução é
          informada no BM.
        </p>
      </header>
      <Card className="grid gap-3 p-4 md:grid-cols-2">
        <div>
          <Label>Empresa terceirizada</Label>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as terceirizadas</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.trade_name || company.legal_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Situação de recebimento</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as situações</SelectItem>
              <SelectItem value="pending">Aguardando recebimento</SelectItem>
              <SelectItem value="received">Recebido</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>
      <Tabs value={financialView} onValueChange={setFinancialView} className="space-y-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="painel">Painel do mês</TabsTrigger>
          <TabsTrigger value="total">Total faturado</TabsTrigger>
          <TabsTrigger value="jacoby">Faturado pela Jacoby</TabsTrigger>
          <TabsTrigger value="comissoes">Comissões</TabsTrigger>
        </TabsList>
        <TabsContent value="painel" className="space-y-4"><FinancialMonthPanel /></TabsContent>
        <TabsContent value="total" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Metric label="Faturado diretamente pela Jacoby" value={directBillingTotal} />
            <Metric label="Comissões a receber" value={totalCommissions} />
            <Metric label="Total faturado consolidado" value={consolidatedTotal} />
          </div>
          <Card className="overflow-hidden">
            <div className="border-b p-4"><h2 className="font-semibold">Composição do total faturado</h2><p className="mt-1 text-sm text-muted-foreground">Soma do que a Jacoby emitiu diretamente com as comissões registradas no Faturamento.</p></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-muted-foreground"><th className="p-3">Origem</th><th className="p-3">Descrição</th><th className="p-3 text-right">Valor</th></tr></thead><tbody><tr className="border-b"><td className="p-3 font-medium">Jacoby</td><td className="p-3">Boletins finalizados e emitidos pela Jacoby</td><td className="p-3 text-right font-medium">{money.format(directBillingTotal)}</td></tr><tr className="border-b"><td className="p-3 font-medium">Comissões de serviços</td><td className="p-3">Comissões configuradas nos serviços de terceirizadas</td><td className="p-3 text-right font-medium">{money.format(commissionTotal)}</td></tr><tr className="border-b"><td className="p-3 font-medium">Comissões de movimentações</td><td className="p-3">Locação, troca e tratamento emitidos por terceirizadas</td><td className="p-3 text-right font-medium">{money.format(movementCommissionTotal)}</td></tr></tbody><tfoot><tr className="bg-primary/10"><td className="p-3 font-bold" colSpan={2}>Total faturado</td><td className="p-3 text-right text-lg font-bold text-primary">{money.format(consolidatedTotal)}</td></tr></tfoot></table></div>
          </Card>
        </TabsContent>
        <TabsContent value="jacoby" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2"><Metric label="Faturado diretamente pela Jacoby" value={directBillingTotal} /><Metric label="Boletins Jacoby finalizados" value={directBillingRows.length} /></div>
          <Card className="overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">Boletins faturados pela Jacoby</h2><p className="mt-1 text-sm text-muted-foreground">Valores calculados pelos lançamentos confirmados de locação, troca, tratamento e serviços de cada BM finalizado.</p></div>{directBillingDataQuery.isLoading ? <p className="p-8 text-sm text-muted-foreground">Carregando boletins...</p> : !directBillingRows.length ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhum boletim finalizado emitido pela Jacoby.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-muted-foreground"><th className="p-3">Cliente / pátio</th><th className="p-3">BM</th><th className="p-3">Período</th><th className="p-3 text-right">Locação</th><th className="p-3 text-right">Troca</th><th className="p-3 text-right">Tratamento</th><th className="p-3 text-right">Serviços</th><th className="p-3 text-right">Sucata paga</th><th className="p-3 text-right">Total</th></tr></thead><tbody>{directBillingRows.map((row) => <tr key={row.cycle.id} className="border-b"><td className="p-3"><p className="font-medium">{row.clientName}</p><p className="text-muted-foreground">{row.branchName}</p></td><td className="p-3">#{String(row.cycle.bulletin_number || 0).padStart(3, "0")}</td><td className="p-3">{formatDate(row.cycle.period_start)} a {formatDate(row.cycle.period_end)}</td><td className="p-3 text-right">{money.format(row.rental)}</td><td className="p-3 text-right">{money.format(row.exchange)}</td><td className="p-3 text-right">{money.format(row.treatment)}</td><td className="p-3 text-right">{money.format(row.services)}</td><td className="p-3 text-right text-destructive">{row.purchases ? money.format(-row.purchases) : "—"}</td><td className="p-3 text-right font-bold text-primary">{money.format(row.total)}</td></tr>)}</tbody></table></div>}</Card>
        </TabsContent>
        <TabsContent value="comissoes" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="A receber das terceirizadas" value={totalOpen} />
        <Metric label="Recebido" value={totalReceived} />
        <Metric label="Comissão prevista" value={commissionTotal} />
        <Metric label="Comissão líquida de movimentações" value={movementCommissionTotal} />
      </div>
      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <h2 className="font-semibold">Controle financeiro</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Todos os dados preenchidos ficam visíveis abaixo. Use o lápis somente para alterar.
          </p>
        </div>
        {servicesQuery.isLoading ? (
          <p className="p-8 text-sm text-muted-foreground">Carregando serviços...</p>
        ) : !rows.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhum serviço terceirizado com data de execução informada.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[2500px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                  <th className="p-3">Cliente / pátio</th>
                  <th className="p-3">Terceirizada</th>
                  <th className="p-3">Serviço / descrição</th>
                  <th className="p-3">Solicitação</th>
                  <th className="p-3">Execução</th>
                  <th className="p-3">Equipamento / qtd.</th>
                  <th className="p-3">OS</th>
                  <th className="p-3">BM</th>
                  <th className="p-3">Fechamento</th>
                  <th className="p-3">Valor</th>
                  <th className="p-3">NF</th>
                  <th className="p-3">NF líquida</th>
                  <th className="p-3">Venc. NF</th>
                  <th className="p-3">PDF da cobrança</th>
                  <th className="p-3">Comissão</th>
                  <th className="p-3">Venc. comissão</th>
                  <th className="p-3">Certificado</th>
                  <th className="p-3">Recebimento</th>
                  <th className="p-3">Observações</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, cycle, clientName, companyName, serviceName, branchName }) => {
                  const base = Number(item.net_invoice_amount ?? item.amount ?? 0);
                  const commission = (base * Number(item.commission_rate || 0)) / 100;
                  return (
                    <tr key={item.id} className="border-b align-top">
                      <td className="p-3">
                        <p className="font-medium">{clientName}</p>
                        <p className="text-muted-foreground">{branchName}</p>
                      </td>
                      <td className="p-3">{companyName}</td>
                      <td className="p-3">
                        <p>{serviceName}</p>
                        {item.description && (
                          <p className="mt-1 max-w-48 whitespace-pre-wrap text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                      </td>
                      <td className="p-3">{formatDate(item.request_date)}</td>
                      <td className="p-3">{formatDate(item.execution_date)}</td>
                      <td className="p-3">
                        <p>{item.equipment_description || ""}</p>
                        {item.quantity != null && <p className="text-muted-foreground">Qtd.: {item.quantity}</p>}
                      </td>
                      <td className="p-3">{item.service_order || ""}</td>
                      <td className="p-3">
                        #{String(cycle?.bulletin_number || 0).padStart(3, "0")}
                      </td>
                      <td className="p-3">{formatDate(item.closing_date)}</td>
                      <td className="p-3">{money.format(Number(item.amount || 0))}</td>
                      <td className="p-3">
                        <p>{item.invoice_number || ""}</p>
                        {item.invoice_issued_on && <p className="text-muted-foreground">Emissão: {formatDate(item.invoice_issued_on)}</p>}
                      </td>
                      <td className="p-3">{money.format(base)}</td>
                      <td className="p-3">{formatDate(item.invoice_due_date)}</td>
                      <td className="p-3">
                        {item.invoice_pdf_path && <Button variant="link" size="sm" className="h-auto max-w-48 p-0" title={item.invoice_pdf_name || "Abrir PDF"} onClick={() => void openInvoicePdf(item)}><FileText className="mr-1 h-3.5 w-3.5 shrink-0" /><span className="truncate">{item.invoice_pdf_name || "PDF anexado"}</span></Button>}
                      </td>
                      <td className="p-3">
                        {money.format(commission)}{" "}
                        <span className="text-muted-foreground">
                          ({Number(item.commission_rate || 0)}%)
                        </span>
                      </td>
                      <td className="p-3">{formatDate(item.commission_due_date)}</td>
                      <td className="p-3">
                        <p>{item.certificate_number || ""}</p>
                        {item.certificate_expires_on && <p className="text-muted-foreground">Validade: {formatDate(item.certificate_expires_on)}</p>}
                      </td>
                      <td className="p-3">
                        <span className={paymentIsReceived(item) ? "font-medium text-primary" : "text-amber-700"}>
                          {paymentIsReceived(item) ? "Recebido" : "Aguardando"}
                        </span>
                        <p className="mt-1 text-muted-foreground">{formatDate(item.received_on)}</p>
                      </td>
                      <td className="p-3">
                        <p className="max-w-52 whitespace-pre-wrap">
                          {item.financial_notes || ""}
                        </p>
                      </td>
                      <td className="p-3">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Editar controle"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b p-4"><h2 className="font-semibold">Comissões de movimentações e tratamentos</h2><p className="mt-1 text-sm text-muted-foreground">Geradas automaticamente ao finalizar um BM emitido por terceirizada, conforme a configuração de comissionamento.</p></div>
        {movementCommissionsQuery.isLoading ? <p className="p-8 text-sm text-muted-foreground">Carregando comissões...</p> : !movementCommissionRows.length ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma comissão de movimentação gerada ainda.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-muted-foreground"><th className="p-3">Cliente</th><th className="p-3">Terceirizada</th><th className="p-3">Tipo</th><th className="p-3">Resíduo</th><th className="p-3">Execução</th><th className="p-3">BM</th><th className="p-3">Base</th><th className="p-3">Comissão</th><th className="p-3">Abatimento</th><th className="p-3">A receber</th><th className="p-3">Recebimento</th><th className="p-3" /></tr></thead><tbody>{movementCommissionRows.map(({ item, cycle, clientName, companyName, residueName }) => <tr key={item.id} className="border-b"><td className="p-3">{clientName}</td><td className="p-3">{companyName}</td><td className="p-3">{{ rental: "Locação", exchange: "Troca", treatment: "Tratamento" }[item.source_type]}</td><td className="p-3">{residueName || "—"}</td><td className="p-3">{formatDate(item.execution_date)}</td><td className="p-3">#{String(cycle?.bulletin_number || 0).padStart(3, "0")}</td><td className="p-3">{money.format(Number(item.base_amount || 0))}</td><td className="p-3">{money.format(Number(item.gross_commission_amount || 0))}</td><td className="p-3">{money.format(Number(item.tax_withheld_amount || 0))}</td><td className="p-3 font-medium">{money.format(Number(item.net_commission_amount || 0))}</td><td className="p-3">{item.payment_status === "received" ? `Recebido ${formatDate(item.received_on)}` : "Aguardando"}</td><td className="p-3"><Button size="sm" variant="outline" disabled={settleMovementCommission.isPending} onClick={() => settleMovementCommission.mutate(item)}>{item.payment_status === "received" ? "Reabrir" : "Dar baixa"}</Button></td></tr>)}</tbody></table></div>}
      </Card>
        </TabsContent>
      </Tabs>
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar controle financeiro</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor do serviço">
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Data da solicitação">
              <Input
                type="date"
                value={form.request_date}
                onChange={(e) => setForm({ ...form, request_date: e.target.value })}
              />
            </Field>
            <Field label="Equipamento">
              <Input
                value={form.equipment_description}
                onChange={(e) => setForm({ ...form, equipment_description: e.target.value })}
              />
            </Field>
            <Field label="Quantidade">
              <Input
                type="number"
                step="0.01"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </Field>
            <Field label="Ordem de serviço">
              <Input
                value={form.service_order}
                onChange={(e) => setForm({ ...form, service_order: e.target.value })}
              />
            </Field>
            <Field label="Data de fechamento">
              <Input
                type="date"
                value={form.closing_date}
                onChange={(e) => setForm({ ...form, closing_date: e.target.value })}
              />
            </Field>
            <Field label="Emissão da nota">
              <Input
                type="date"
                value={form.invoice_issued_on}
                onChange={(e) => setForm({ ...form, invoice_issued_on: e.target.value })}
              />
            </Field>
            <Field label="Número da nota">
              <Input
                value={form.invoice_number}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
              />
            </Field>
            <Field label="Vencimento da nota">
              <Input
                type="date"
                value={form.invoice_due_date}
                onChange={(e) => setForm({ ...form, invoice_due_date: e.target.value })}
              />
            </Field>
            <Field label="Valor líquido da nota">
              <Input
                type="number"
                step="0.01"
                value={form.net_invoice_amount}
                onChange={(e) => setForm({ ...form, net_invoice_amount: e.target.value })}
              />
            </Field>
            <Field label="Percentual de comissão">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.commission_rate}
                onChange={(e) => setForm({ ...form, commission_rate: e.target.value })}
              />
            </Field>
            <Field label="Vencimento da comissão">
              <Input
                type="date"
                value={form.commission_due_date}
                onChange={(e) => setForm({ ...form, commission_due_date: e.target.value })}
              />
            </Field>
            <Field label="Número do certificado">
              <Input
                value={form.certificate_number}
                onChange={(e) => setForm({ ...form, certificate_number: e.target.value })}
              />
            </Field>
            <Field label="Validade do certificado">
              <Input
                type="date"
                value={form.certificate_expires_on}
                onChange={(e) => setForm({ ...form, certificate_expires_on: e.target.value })}
              />
            </Field>
            <Field label="Recebimento">
              <Select
                value={form.payment_status}
                onValueChange={(payment_status) => setForm({ ...form, payment_status })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Aguardando recebimento</SelectItem>
                  <SelectItem value="received">Recebido</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data de recebimento">
              <Input
                type="date"
                value={form.received_on}
                onChange={(e) => setForm({ ...form, received_on: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Descrição">
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Observações financeiras">
                <Textarea
                  value={form.financial_notes}
                  onChange={(e) => setForm({ ...form, financial_notes: e.target.value })}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <CheckCircle2 />
              {save.isPending ? "Salvando..." : "Salvar controle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-xl font-bold">
        <HandCoins className="h-5 w-5 text-primary" />
        {money.format(value)}
      </p>
    </Card>
  );
}
function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`)) : "";
}
