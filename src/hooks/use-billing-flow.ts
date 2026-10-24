/**
 * Lançamentos do Faturamento (BM × categoria × empresa) com a conferência salva em
 * billing_receivable_tracking. Compartilhado pelo Faturamento e pela aba Financeiro,
 * para que as duas telas leiam e gravem exatamente os mesmos registros.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useClients } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import type { BillingFlowEntry, BillingFlowSaveInput, BillingFlowTracking } from "@/components/BillingFlowPreview";
import type { BillingBulletin } from "@/lib/billing-bulletins";
import { CYCLE_INVOICE_BUCKET, listFinancialCycleInvoices } from "@/lib/cycle-invoices";
import { attachServiceInvoiceEntries, type InvoiceServiceLink } from "@/lib/service-invoice-entries";

export type FinancialService = {
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
export type Cycle = {
  id: string; client_id: string; branch_id: string | null; bulletin_number: number;
  issuer_type: "jacoby" | "outsourced"; status: "draft" | "closed";
  outsourced_company_id: string | null;
  period_start: string; period_end: string; finalized_at: string | null;
};
export type BillingPlacement = { cycle_id: string; quantity: number; monthly_rental_rate: number };
export type BillingMovement = { cycle_id: string; confirmed: boolean; removed_quantity: number; weight_kg: number; exchange_rate: number; treatment_rate: number; waste_residue_id: string | null; occurred_on?: string | null; service_order?: string | null };
export type BillingServiceAmount = { cycle_id: string; amount: number; waste_service_id?: string | null };
export type MovementCommission = {
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
export type Named = { id: string; name?: string; legal_name?: string; trade_name?: string | null };

export function useBillingFlowData() {
  const queryClient = useQueryClient();
  const { data: clients = [] } = useClients();
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
        (supabase.from("billing_v2_movements" as any) as any).select("cycle_id,confirmed,removed_quantity,weight_kg,exchange_rate,treatment_rate,waste_residue_id,occurred_on,service_order"),
        (supabase.from("billing_v2_cycle_services" as any) as any).select("cycle_id,amount,waste_service_id"),
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
  const invoiceLinksQuery = useQuery({
    queryKey:["financial-service-invoice-links"],
    queryFn:async () => {
      const links: InvoiceServiceLink[] = [];
      for (let offset=0; ; offset+=500) {
        const result = await (supabase.from("billing_v2_cycle_services" as any) as any)
          .select("id,cycle_id,outsourced_company_id,invoice_pdf_path,invoice_pdf_name,amount,net_invoice_amount,commission_rate")
          .order("id").range(offset,offset+499);
        if (result.error) throw result.error;
        links.push(...(result.data || []));
        if ((result.data || []).length < 500) return links;
      }
    },
  });
  const cycleNotesQuery = useQuery({
    queryKey:["financial-cycle-invoices",cycles.map(cycle => cycle.id).sort().join(",")],
    enabled:cyclesQuery.isSuccess,
    queryFn:() => listFinancialCycleInvoices(supabase.storage.from(CYCLE_INVOICE_BUCKET),cycles.map(cycle => cycle.id)),
  });
  const serviceRows = useMemo(
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
        .filter((row) => Boolean(row.cycle)),
    [
      servicesQuery.data,
      cycles,
      clients,
      companies,
      catalog,
      branches,
    ],
  );
  const movementCommissionRows = useMemo(
    () => (movementCommissionsQuery.data || []).map((item) => {
      const cycle = cycles.find((value) => value.id === item.cycle_id);
      const client = clients.find((value) => value.id === item.client_id);
      const company = companies.find((value) => value.id === item.outsourced_company_id);
      const residue = residues.find((value) => value.id === item.waste_residue_id);
      return { item, cycle, clientName: client?.name || "", companyName: company?.trade_name || company?.legal_name || "", residueName: residue?.name || "" };
    }).filter((row) => Boolean(row.cycle)),
    [movementCommissionsQuery.data, cycles, clients, companies, residues],
  );
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
  const issuedBulletins = useMemo<BillingBulletin[]>(() => cycles.filter((cycle) => cycle.status === "closed").map((cycle) => {
    const company = companies.find((item) => item.id === cycle.outsourced_company_id);
    return {
      id: cycle.id,
      number: cycle.bulletin_number || 0,
      emittedAt: cycle.finalized_at,
      residues: Array.from(new Set((directBillingDataQuery.data?.movements || []).filter((item) => item.cycle_id === cycle.id).map((item) => item.waste_residue_id).filter((id): id is string => Boolean(id)))).map((id) => ({ id, name: residues.find((item) => item.id === id)?.name || "Resíduo" })),
      client: clients.find((item) => item.id === cycle.client_id)?.name || "Cliente não identificado",
      branch: branches.find((item) => item.id === cycle.branch_id)?.name || "Matriz",
      company: cycle.issuer_type === "jacoby" ? "Jacoby" : company?.trade_name || company?.legal_name || "Terceirizada não identificada",
    };
  }), [cycles, companies, clients, branches, directBillingDataQuery.data, residues]);
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
    for (const { item, cycle, clientName, companyName, serviceName, branchName } of serviceRows) {
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
    return attachServiceInvoiceEntries([...grouped.values()], cycles.map(cycle => {
      const hash = new URLSearchParams({cliente:cycle.client_id,boletim:cycle.id,patio:cycle.branch_id || "__matriz__",inicio:cycle.period_start,fim:cycle.period_end,subaba:"boletim",residuo:"all"});
      return {id:cycle.id,companyId:cycle.issuer_type === "outsourced" ? cycle.outsourced_company_id : null,
        bulletin:`#${String(cycle.bulletin_number || 0).padStart(3,"0")}`,
        client:clients.find(item => item.id === cycle.client_id)?.name || "Cliente não identificado",
        branch:branches.find(item => item.id === cycle.branch_id)?.name || "Matriz",
        serviceUrl:`/portal/residuos?aba=faturamento2#${hash}`};
    }),cycleNotesQuery.data || [],invoiceLinksQuery.data || [],billingTrackingQuery.data || [],id => {
      const company = companies.find(item => item.id === id);
      return id ? company?.trade_name || company?.legal_name || "Terceirizada" : "Jacoby (faturamento direto)";
    });
  }, [movementCommissionRows, serviceRows, branches, residues, directBillingRows, billingTrackingQuery.data,cycles,clients,companies,cycleNotesQuery.data,invoiceLinksQuery.data]);
  const upsertTracking = async (input: BillingFlowSaveInput) => {
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
  };
  const refreshTracking = () => {
    void queryClient.invalidateQueries({ queryKey: ["billing-receivable-tracking"] });
    void queryClient.invalidateQueries({ queryKey: ["financial-month-panel"] });
  };
  const saveBillingTracking = useMutation({
    mutationFn: upsertTracking,
    onSuccess: () => {
      refreshTracking();
      toast.success("Conferência de faturamento salva.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  // Baixa feita pela aba Financeiro: mesmo registro de conferência, só muda o recebimento.
  const settleReceivable = useMutation({
    mutationFn: upsertTracking,
    onSuccess: (_, input) => {
      refreshTracking();
      toast.success(input.received_on ? "Recebimento registrado." : "Recebimento desfeito.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    servicesQuery, movementCommissionsQuery, billingTrackingQuery, cyclesQuery, directBillingDataQuery,
    companiesQuery, servicesCatalogQuery, branchesQuery, residuesQuery, cycleNotesQuery, invoiceLinksQuery,
    cycles, companies, catalog, branches, residues,
    serviceRows, movementCommissionRows, directBillingRows,
    issuedBulletins, billingFlowEntries, saveBillingTracking, settleReceivable,
  };
}
