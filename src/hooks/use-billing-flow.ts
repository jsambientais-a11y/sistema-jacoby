import { buildBillingFlowEntries, calculateDirectBillingRows } from "@/lib/billing-flow-model";
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
import type {
  BillingFlowEntry,
  BillingFlowSaveInput,
  BillingFlowTracking,
} from "@/components/BillingFlowPreview";
import type { BillingBulletin } from "@/lib/billing-bulletins";
import { CYCLE_INVOICE_BUCKET, listFinancialCycleInvoices } from "@/lib/cycle-invoices";
import { type InvoiceServiceLink } from "@/lib/service-invoice-entries";

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
  id: string;
  client_id: string;
  branch_id: string | null;
  bulletin_number: number;
  issuer_type: "jacoby" | "outsourced";
  status: "draft" | "closed";
  outsourced_company_id: string | null;
  period_start: string;
  period_end: string;
  finalized_at: string | null;
};
export type BillingPlacement = { cycle_id: string; quantity: number; monthly_rental_rate: number };
export type BillingMovement = {
  cycle_id: string;
  confirmed: boolean;
  removed_quantity: number;
  weight_kg: number;
  exchange_rate: number;
  treatment_rate: number;
  waste_residue_id: string | null;
  occurred_on?: string | null;
  service_order?: string | null;
};
export type BillingServiceAmount = {
  cycle_id: string;
  amount: number;
  waste_service_id?: string | null;
};
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
      const { data, error } = await (
        supabase.from("billing_receivable_tracking" as any) as any
      ).select("*");
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
        .select(
          "id,client_id,branch_id,bulletin_number,issuer_type,outsourced_company_id,status,period_start,period_end,finalized_at",
        )
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
        (supabase.from("billing_v2_placements" as any) as any).select(
          "cycle_id,quantity,monthly_rental_rate",
        ),
        (supabase.from("billing_v2_movements" as any) as any).select(
          "cycle_id,confirmed,removed_quantity,weight_kg,exchange_rate,treatment_rate,waste_residue_id,occurred_on,service_order",
        ),
        (supabase.from("billing_v2_cycle_services" as any) as any).select(
          "cycle_id,amount,waste_service_id",
        ),
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
      const { data, error } = await (supabase.from("waste_residues" as any) as any).select(
        "id,name,jacoby_pays_client",
      );
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
    queryKey: ["financial-service-invoice-links"],
    queryFn: async () => {
      const links: InvoiceServiceLink[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await (supabase.from("billing_v2_cycle_services" as any) as any)
          .select(
            "id,cycle_id,outsourced_company_id,invoice_pdf_path,invoice_pdf_name,amount,net_invoice_amount,commission_rate",
          )
          .order("id")
          .range(offset, offset + 499);
        if (result.error) throw result.error;
        links.push(...(result.data || []));
        if ((result.data || []).length < 500) return links;
      }
    },
  });
  const cycleNotesQuery = useQuery({
    queryKey: [
      "financial-cycle-invoices",
      cycles
        .map((cycle) => cycle.id)
        .sort()
        .join(","),
    ],
    enabled: cyclesQuery.isSuccess,
    queryFn: () =>
      listFinancialCycleInvoices(
        supabase.storage.from(CYCLE_INVOICE_BUCKET),
        cycles.map((cycle) => cycle.id),
      ),
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
    [servicesQuery.data, cycles, clients, companies, catalog, branches],
  );
  const movementCommissionRows = useMemo(
    () =>
      (movementCommissionsQuery.data || [])
        .map((item) => {
          const cycle = cycles.find((value) => value.id === item.cycle_id);
          const client = clients.find((value) => value.id === item.client_id);
          const company = companies.find((value) => value.id === item.outsourced_company_id);
          const residue = residues.find((value) => value.id === item.waste_residue_id);
          return {
            item,
            cycle,
            clientName: client?.name || "",
            companyName: company?.trade_name || company?.legal_name || "",
            residueName: residue?.name || "",
          };
        })
        .filter((row) => Boolean(row.cycle)),
    [movementCommissionsQuery.data, cycles, clients, companies, residues],
  );
  const directBillingRows = useMemo(() => {
    const billingData = directBillingDataQuery.data;
    if (!billingData) return [];
    return calculateDirectBillingRows({
      cycles,
      clients,
      branches,
      residues,
      placements: billingData.placements,
      movements: billingData.movements,
      directServices: billingData.services,
    });
  }, [cycles, clients, branches, directBillingDataQuery.data, residuesQuery.data]);
  const issuedBulletins = useMemo<BillingBulletin[]>(
    () =>
      cycles
        .filter((cycle) => cycle.status === "closed")
        .map((cycle) => {
          const company = companies.find((item) => item.id === cycle.outsourced_company_id);
          return {
            id: cycle.id,
            number: cycle.bulletin_number || 0,
            emittedAt: cycle.finalized_at,
            residues: Array.from(
              new Set(
                (directBillingDataQuery.data?.movements || [])
                  .filter((item) => item.cycle_id === cycle.id)
                  .map((item) => item.waste_residue_id)
                  .filter((id): id is string => Boolean(id)),
              ),
            ).map((id) => ({
              id,
              name: residues.find((item) => item.id === id)?.name || "Resíduo",
            })),
            client:
              clients.find((item) => item.id === cycle.client_id)?.name ||
              "Cliente não identificado",
            branch: branches.find((item) => item.id === cycle.branch_id)?.name || "Matriz",
            company:
              cycle.issuer_type === "jacoby"
                ? "Jacoby"
                : company?.trade_name || company?.legal_name || "Terceirizada não identificada",
          };
        }),
    [cycles, companies, clients, branches, directBillingDataQuery.data, residues],
  );
  const billingFlowEntries = useMemo(
    () =>
      buildBillingFlowEntries({
        cycles,
        clients,
        companies,
        catalog,
        branches,
        residues,
        services: servicesQuery.data || [],
        commissions: movementCommissionsQuery.data || [],
        placements: directBillingDataQuery.data?.placements || [],
        movements: directBillingDataQuery.data?.movements || [],
        directServices: directBillingDataQuery.data?.services || [],
        tracking: billingTrackingQuery.data || [],
        notes: cycleNotesQuery.data || [],
        links: invoiceLinksQuery.data || [],
      }),
    [
      cycles,
      clients,
      companies,
      catalog,
      branches,
      residues,
      servicesQuery.data,
      movementCommissionsQuery.data,
      directBillingDataQuery.data,
      billingTrackingQuery.data,
      cycleNotesQuery.data,
      invoiceLinksQuery.data,
    ],
  );
  const upsertTracking = async (input: BillingFlowSaveInput) => {
    const { entry, ...values } = input;
    const { data, error } = await (supabase.from("billing_receivable_tracking" as any) as any)
      .upsert(
        {
          cycle_id: entry.cycleId,
          category: entry.category,
          outsourced_company_id: entry.companyId,
          source_key: entry.companyId || "jacoby",
          base_amount_snapshot: Number(entry.baseAmount.toFixed(2)),
          ...values,
        },
        { onConflict: "cycle_id,category,source_key" },
      )
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
    servicesQuery,
    movementCommissionsQuery,
    billingTrackingQuery,
    cyclesQuery,
    directBillingDataQuery,
    companiesQuery,
    servicesCatalogQuery,
    branchesQuery,
    residuesQuery,
    cycleNotesQuery,
    invoiceLinksQuery,
    cycles,
    companies,
    catalog,
    branches,
    residues,
    serviceRows,
    movementCommissionRows,
    directBillingRows,
    issuedBulletins,
    billingFlowEntries,
    saveBillingTracking,
    settleReceivable,
  };
}
