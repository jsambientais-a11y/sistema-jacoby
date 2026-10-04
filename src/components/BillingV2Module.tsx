/** Faturamento: boletins independentes, espelhando o fluxo operacional. */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Download, Eye, FilePlus2, FileText, Image as ImageIcon, Mail, Pencil, RotateCcw, Send, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useClients } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import jacobyLogo from "@/assets/jacoby-logo-transparent.png";

type Branch = { id: string; name: string; cnpj: string | null; address: string | null };
type Equipment = {
  id: string;
  branch_id: string | null;
  identification: string | null;
  name: string;
  equipment_type: string;
  active: boolean;
  monthly_rental_rate: number;
  exchange_rate: number;
};
type Residue = { id: string; name: string; active: boolean; branch_id: string | null; default_treatment_rate: number };
type Cycle = {
  id: string;
  client_id: string;
  branch_id: string | null;
  period_start: string;
  period_end: string;
  status: string;
  issuer_type: "jacoby" | "outsourced";
  outsourced_company_id: string | null;
  bulletin_number: number;
  finalized_at: string | null;
  client_portal_visible: boolean;
};
type ResidueEmission = {
  id: string;
  cycle_id: string;
  waste_residue_id: string;
  sequence: number;
  display_number: string;
  finalized_at: string;
  client_portal_visible: boolean;
};
type BillingEmailDelivery = {
  id: string;
  cycle_id: string;
  residue_emission_id: string | null;
  recipient_email: string;
  status: "pending" | "sending" | "sent" | "failed" | "cancelled";
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
};
type PublishDialogTarget = {
  cycle: Cycle;
  residueEmission?: ResidueEmission;
  displayNumber: string;
  residueId: string;
};
type Placement = {
  id: string;
  cycle_id: string | null;
  branch_id: string;
  equipment_id: string;
  waste_residue_id: string | null;
  started_on: string;
  ended_on: string | null;
  quantity: number;
  monthly_rental_rate: number;
  observation: string | null;
};
type Movement = {
  id: string;
  batch_id?: string | null;
  branch_id: string;
  equipment_id: string | null;
  replacement_equipment_id: string | null;
  waste_residue_id: string | null;
  occurred_on: string;
  service_order: string | null;
  mtr_number: string | null;
  placed_quantity: number;
  removed_quantity: number;
  weight_kg: number;
  confirmed: boolean;
  treatment_rate: number;
  exchange_rate: number;
  observation: string | null;
};
type PendingMovement = Movement & {
  cycle_id: string;
  client_id: string;
  cycle_branch_id: string | null;
  bulletin_number: number;
  cycle_status: string;
  client_name: string;
  branch_name: string;
  residue_name: string;
};
type MovementAttachment = { id: string; movement_id: string; file_name: string; storage_path: string; created_at: string };
type Service = { id: string; name: string; active: boolean; default_rate?: number; branch_id?: string | null };
type OutsourcedCompany = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  logo_url: string | null;
  cnpj: string | null;
  address: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  environmental_license: string | null;
};
type OutsourcedCompanyService = {
  outsourced_company_id: string;
  waste_service_id: string;
  waste_services?: { id: string; name: string | null; active: boolean; branch_id: string | null } | null;
};
type ClientServiceRate = { client_id: string; waste_service_id: string; default_rate: number };
type ClientServiceRateOverride = {
  client_id: string;
  waste_service_id: string;
  outsourced_company_id: string | null;
  branch_id: string | null;
  default_rate: number;
};
type CycleService = {
  id: string; cycle_id: string; waste_service_id: string; outsourced_company_id: string | null; amount: number;
  quantity: number;
  unit_amount: number;
  observation: string | null;
  execution_date: string | null;
  invoice_issued_on: string | null;
  received_on: string | null;
  invoice_pdf_name: string | null;
  invoice_pdf_path: string | null;
};
type CompanyProfile = {
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  address: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  environmental_license: string | null;
  logo_url: string | null;
};

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const number = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value || 0);
const bulletinNumber = (value?: number | null) => `#${String(value || 0).padStart(3, "0")}`;
const BRANCH_MATRIZ = "__matriz__";
const branchToDb = (value?: string | null) => (value && value !== BRANCH_MATRIZ ? value : null);
const branchKey = (value?: string | null) => value || BRANCH_MATRIZ;
const serviceNameKey = (name?: string | null) =>
  (name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
const billingViewStorageKey = "jacoby:billing-v2:view";
type BillingViewState = {
  clientId?: string;
  periodStart?: string;
  periodEnd?: string;
  cycleBranchId?: string;
  cycleId?: string;
  tab?: string;
  residueFilterId?: string;
};
const storedBillingView = (): BillingViewState => {
  if (typeof window === "undefined") return {};
  try {
    const saved = JSON.parse(sessionStorage.getItem(billingViewStorageKey) || "{}") as BillingViewState;
    // Além da memória da aba, mantemos o boletim aberto no endereço. Assim,
    // se o navegador descarregar a aba em segundo plano, ele volta exatamente
    // para o mesmo boletim e subaba ao restaurá-la.
    const addressState = new URLSearchParams(window.location.hash.slice(1));
    return {
      ...saved,
      clientId: addressState.get("cliente") || saved.clientId,
      periodStart: addressState.get("inicio") || saved.periodStart,
      periodEnd: addressState.get("fim") || saved.periodEnd,
      cycleBranchId: addressState.get("patio") || saved.cycleBranchId,
      cycleId: addressState.get("boletim") || saved.cycleId,
      tab: addressState.get("subaba") || saved.tab,
      residueFilterId: addressState.get("residuo") || saved.residueFilterId,
    };
  } catch {
    return {};
  }
};
const equipmentName = (item?: Equipment) =>
  item
    ? [item.identification, item.name, item.equipment_type].filter(Boolean).join(" · ")
    : "Equipamento";
const logoAsDataUrl = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw Error("Logo indisponível");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid min-w-0 gap-2 ${className}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function BillingV2Module() {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState(() => storedBillingView().clientId || "");
  const [periodStart, setPeriodStart] = useState(() => storedBillingView().periodStart || new Date().toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(() => storedBillingView().periodEnd || new Date().toISOString().slice(0, 10));
  const [cycleBranchId, setCycleBranchId] = useState(() => storedBillingView().cycleBranchId || "");
  const [cycleId, setCycleId] = useState(() => storedBillingView().cycleId || "");
  const [homeTab, setHomeTab] = useState<"boletins" | "pendentes">("boletins");
  const [tab, setTab] = useState(() => storedBillingView().tab || "locacoes");
  const [residueFilterId, setResidueFilterId] = useState(() => storedBillingView().residueFilterId || "all");
  const [billingViewRestored, setBillingViewRestored] = useState(false);
  const [rentalBranchFilter, setRentalBranchFilter] = useState("");
  const [movementBranchFilter, setMovementBranchFilter] = useState("");
  const [placementForm, setPlacementForm] = useState({
    branchId: "",
    equipmentId: "",
    residueId: "",
    date: new Date().toISOString().slice(0, 10),
    quantity: "1",
    observation: "",
  });
  const [movementForm, setMovementForm] = useState({
    branchId: "",
    residueId: "",
    date: new Date().toISOString().slice(0, 10),
    order: "",
    mtr: "",
    weight: "0",
    observation: "",
  });
  const [outgoingPlacementIds, setOutgoingPlacementIds] = useState<string[]>([]);
  const [incomingEquipmentIds, setIncomingEquipmentIds] = useState<string[]>([]);
  const [importPlacementIds, setImportPlacementIds] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [resultStatusFilter, setResultStatusFilter] = useState<"all" | "draft" | "closed">("draft");
  const [treatmentCompanyId, setTreatmentCompanyId] = useState("");
  const [expandedBMs, setExpandedBMs] = useState<string[]>([]);
  const [bmSearch, setBmSearch] = useState("");
  const savingMovementRef = useRef(false);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [serviceAmount, setServiceAmount] = useState("0");
  const [serviceQuantity, setServiceQuantity] = useState("1");
  const [serviceObservation, setServiceObservation] = useState("");
  const [serviceExecutionDate, setServiceExecutionDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedBulkCycleIds, setSelectedBulkCycleIds] = useState<string[]>([]);
  const [isFinalizingBulk, setIsFinalizingBulk] = useState(false);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [publishDialog, setPublishDialog] = useState<PublishDialogTarget | null>(null);
  const [emailMessage, setEmailMessage] = useState("");
  const [recipientPreview, setRecipientPreview] = useState<string[]>([]);
  const [recipientPreviewLoading, setRecipientPreviewLoading] = useState(false);
  const [recipientPreviewError, setRecipientPreviewError] = useState("");
  const [focusedMovementId, setFocusedMovementId] = useState("");

  // Em uma recarga causada pelo próprio navegador, a primeira renderização pode
  // ocorrer no servidor. Restauramos a aba somente depois da hidratação e antes
  // de aplicar qualquer cliente padrão, para não perder o boletim em edição.
  useEffect(() => {
    const saved = storedBillingView();
    if (saved.clientId) setClientId(saved.clientId);
    if (saved.periodStart) setPeriodStart(saved.periodStart);
    if (saved.periodEnd) setPeriodEnd(saved.periodEnd);
    if (saved.cycleBranchId) setCycleBranchId(saved.cycleBranchId);
    if (saved.cycleId) setCycleId(saved.cycleId);
    if (saved.tab) setTab(saved.tab);
    if (saved.residueFilterId) setResidueFilterId(saved.residueFilterId);
    setBillingViewRestored(true);
  }, []);
  useEffect(() => {
    if (!billingViewRestored) return;
    if (!clientId && clients[0]) setClientId(clients[0].id);
  }, [billingViewRestored, clientId, clients]);
  useEffect(() => {
    if (!billingViewRestored || typeof window === "undefined") return;
    const view = {
      clientId, periodStart, periodEnd, cycleBranchId, cycleId, tab, residueFilterId,
    } satisfies BillingViewState;
    sessionStorage.setItem(billingViewStorageKey, JSON.stringify(view));

    // O hash não causa navegação nem nova renderização. Ele é apenas uma
    // proteção adicional contra o descarte da aba pelo navegador.
    const url = new URL(window.location.href);
    if (cycleId) {
      const state = new URLSearchParams();
      state.set("cliente", clientId);
      state.set("inicio", periodStart);
      state.set("fim", periodEnd);
      state.set("patio", cycleBranchId);
      state.set("boletim", cycleId);
      state.set("subaba", tab);
      state.set("residuo", residueFilterId);
      url.hash = state.toString();
    } else {
      url.hash = "";
    }
    window.history.replaceState(window.history.state, "", url);
  }, [billingViewRestored, clientId, periodStart, periodEnd, cycleBranchId, cycleId, tab, residueFilterId]);
  const query = <T,>(key: unknown[], table: string, configure: (request: any) => any) =>
    useQuery({
      queryKey: key,
      enabled: Boolean(clientId),
      queryFn: async () => {
        const { data, error } = await configure(supabase.from(table as any) as any);
        if (error) throw error;
        return (data || []) as T[];
      },
    });
  const cyclesQuery = query<Cycle>(["billing-v2-cycles", clientId], "billing_v2_cycles", (q) =>
    q.select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
  );
  const residueEmissionsQuery = useQuery({
    queryKey: ["billing-v2-residue-emissions", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_residue_emissions" as any) as any)
        .select("id,cycle_id,waste_residue_id,sequence,display_number,finalized_at,client_portal_visible,billing_v2_cycles!inner(client_id)")
        .eq("billing_v2_cycles.client_id", clientId)
        .order("finalized_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ResidueEmission[];
    },
  });
  const billingEmailDeliveriesQuery = useQuery({
    queryKey: ["billing-email-deliveries", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_email_deliveries" as any) as any)
        .select("id,cycle_id,residue_emission_id,recipient_email,status,attempts,last_error,sent_at,billing_v2_cycles!inner(client_id)")
        .eq("billing_v2_cycles.client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BillingEmailDelivery[];
    },
  });
  const recentCyclesQuery = useQuery({
    queryKey: ["billing-v2-recent"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_cycles" as any) as any)
        .select("*")
        .eq("is_demo", false)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data || []) as Cycle[];
    },
  });
  const pendingMovementsQuery = useQuery({
    queryKey: ["billing-v2-pending-movements"],
    queryFn: async () => {
      const { data: movementRows, error: movementError } = await (supabase.from("billing_v2_movements" as any) as any)
        .select("id,batch_id,cycle_id,branch_id,equipment_id,replacement_equipment_id,waste_residue_id,occurred_on,service_order,mtr_number,placed_quantity,removed_quantity,weight_kg,confirmed,treatment_rate,exchange_rate,observation")
        .eq("confirmed", false)
        .order("occurred_on", { ascending: true });
      if (movementError) throw movementError;
      if (!movementRows?.length) return [] as PendingMovement[];

      const cycleIds = Array.from(new Set(movementRows.map((item: any) => item.cycle_id)));
      const { data: cycleRows, error: cycleError } = await (supabase.from("billing_v2_cycles" as any) as any)
        .select("id,client_id,branch_id,bulletin_number,status,is_demo")
        .in("id", cycleIds)
        .eq("is_demo", false)
        .eq("status", "draft");
      if (cycleError) throw cycleError;
      const visibleCycles = cycleRows || [];
      if (!visibleCycles.length) return [] as PendingMovement[];

      const clientIds = Array.from(new Set(visibleCycles.map((item: any) => item.client_id)));
      const branchIds = Array.from(new Set([
        ...visibleCycles.map((item: any) => item.branch_id),
        ...movementRows.map((item: any) => item.branch_id),
      ].filter(Boolean)));
      const residueIds = Array.from(new Set(movementRows.map((item: any) => item.waste_residue_id).filter(Boolean)));
      const [clientsResult, branchesResult, residuesResult] = await Promise.all([
        (supabase.from("clients" as any) as any).select("id,name").in("id", clientIds),
        branchIds.length
          ? (supabase.from("client_branches" as any) as any).select("id,name").in("id", branchIds)
          : Promise.resolve({ data: [], error: null }),
        residueIds.length
          ? (supabase.from("waste_residues" as any) as any).select("id,name").in("id", residueIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (clientsResult.error) throw clientsResult.error;
      if (branchesResult.error) throw branchesResult.error;
      if (residuesResult.error) throw residuesResult.error;

      const cyclesById = new Map(visibleCycles.map((item: any) => [item.id, item]));
      const clientsById = new Map((clientsResult.data || []).map((item: any) => [item.id, item.name]));
      const branchesById = new Map((branchesResult.data || []).map((item: any) => [item.id, item.name]));
      const residuesById = new Map((residuesResult.data || []).map((item: any) => [item.id, item.name]));
      return movementRows.flatMap((item: any) => {
        const targetCycle = cyclesById.get(item.cycle_id) as any;
        if (!targetCycle) return [];
        const targetBranchId = item.branch_id || targetCycle.branch_id;
        return [{
          ...item,
          client_id: targetCycle.client_id,
          cycle_branch_id: targetCycle.branch_id,
          bulletin_number: targetCycle.bulletin_number,
          cycle_status: targetCycle.status,
          client_name: clientsById.get(targetCycle.client_id) || "Cliente",
          branch_name: targetBranchId ? (branchesById.get(targetBranchId) || "Filial/pátio") : "Matriz (sem filial/pátio)",
          residue_name: item.waste_residue_id ? (residuesById.get(item.waste_residue_id) || "Resíduo") : "—",
        } as PendingMovement];
      });
    },
  });
  const bmSearchNumber = Number((bmSearch.match(/\d+/g) || []).join(""));
  const bmSearchQuery = useQuery({
    queryKey: ["billing-v2-search", bmSearchNumber],
    enabled: Number.isFinite(bmSearchNumber) && bmSearchNumber > 0,
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_cycles" as any) as any)
        .select("*")
        .eq("is_demo", false)
        .eq("bulletin_number", bmSearchNumber)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as Cycle[];
    },
  });
  const branchesQuery = query<Branch>(["billing-v2-branches", clientId], "client_branches", (q) =>
    q.select("id,name,cnpj,address").eq("client_id", clientId).eq("is_active", true).order("name"),
  );
  const previousClosedCycleQuery = useQuery({
    queryKey: ["billing-v2-previous-closed", clientId, cycleBranchId],
    enabled: Boolean(clientId && !cycleId && (cycleBranchId || !branchesQuery.isLoading && !(branchesQuery.data || []).length)),
    queryFn: async () => {
      let request = (supabase.from("billing_v2_cycles" as any) as any)
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "closed")
        .order("finalized_at", { ascending: false })
        .limit(1);
      request = branchToDb(cycleBranchId) ? request.eq("branch_id", branchToDb(cycleBranchId)) : request.is("branch_id", null);
      const { data, error } = await request.maybeSingle();
      if (error) throw error;
      return data as Cycle | null;
    },
  });
  // A lista de recentes pode conter boletins de outro cliente. Carregamos as
  // filiais ativas uma única vez para não trocar o nome do pátio por um rótulo
  // genérico só porque outro cliente está selecionado no filtro.
  const recentBranchesQuery = useQuery({
    queryKey: ["billing-v2-recent-branches"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_branches" as any) as any)
        .select("id,name,cnpj,address")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []) as Branch[];
    },
  });
  const equipmentQuery = query<Equipment>(
    ["billing-v2-equipment", clientId],
    "waste_equipment",
    (q) =>
      q
        .select("id,branch_id,identification,name,equipment_type,active,monthly_rental_rate,exchange_rate")
        .eq("client_id", clientId)
        .eq("active", true)
        .order("name"),
  );
  const residuesQuery = query<Residue>(["billing-v2-residues", clientId], "waste_residues", (q) =>
    q.select("id,name,active,branch_id,default_treatment_rate").eq("client_id", clientId).order("name"),
  );
  const servicesQuery = query<Service>(["billing-v2-services", clientId], "waste_services", (q) =>
    q.select("id,name,active,default_rate,branch_id").eq("client_id", clientId).eq("active", true).order("name"),
  );
  const outsourcedCompaniesQuery = useQuery({
    queryKey: ["outsourced-companies"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("outsourced_companies" as any) as any)
        .select("id,legal_name,trade_name,logo_url,cnpj,address,postal_code,phone,email,environmental_license")
        .eq("active", true)
        .order("legal_name");
      if (error) throw error;
      return (data || []) as OutsourcedCompany[];
    },
  });
  const outsourcedCompanyServicesQuery = useQuery({
    queryKey: ["outsourced-company-services"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("outsourced_company_services" as any) as any)
        .select("outsourced_company_id,waste_service_id,waste_services(id,name,active,branch_id)");
      if (error) throw error;
      return (data || []) as OutsourcedCompanyService[];
    },
  });
  const clientServiceRatesQuery = useQuery({
    queryKey: ["billing-v2-client-service-rates", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("waste_client_service_rates" as any) as any)
        .select("client_id,waste_service_id,default_rate")
        .eq("client_id", clientId);
      if (error) throw error;
      return (data || []) as ClientServiceRate[];
    },
  });
  const clientServiceRateOverridesQuery = useQuery({
    queryKey: ["billing-v2-client-service-rate-overrides", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("waste_client_service_rate_overrides" as any) as any)
        .select("client_id,waste_service_id,outsourced_company_id,branch_id,default_rate")
        .eq("client_id", clientId);
      if (error) throw error;
      return (data || []) as ClientServiceRateOverride[];
    },
  });
  const companyProfileQuery = useQuery({
    queryKey: ["company-profile"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("company_profiles" as any) as any)
        .select("legal_name,trade_name,cnpj,address,postal_code,phone,email,environmental_license,logo_url")
        .eq("is_primary", true)
        .maybeSingle();
      if (error) throw error;
      return data as CompanyProfile | null;
    },
  });
  const cycle =
    (cyclesQuery.data || []).find((item) => item.id === cycleId) ||
    (recentCyclesQuery.data || []).find((item) => item.id === cycleId);
  const lockedBranchId = cycle ? (cycle.branch_id || BRANCH_MATRIZ) : "";
  const placementsQuery = useQuery({
    queryKey: ["billing-v2-placements", cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_placements" as any) as any)
        .select("*")
        .eq("cycle_id", cycleId)
        .order("started_on");
      if (error) throw error;
      return (data || []) as Placement[];
    },
  });
  const movementsQuery = useQuery({
    queryKey: ["billing-v2-movements", cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_movements" as any) as any)
        .select("*")
        .eq("cycle_id", cycleId)
        .order("occurred_on");
      if (error) throw error;
      return (data || []) as Movement[];
    },
  });
  const movementAttachmentsQuery = useQuery({
    queryKey: ["billing-v2-movement-attachments", cycleId, movementsQuery.data?.map((movement) => movement.id).join(",")],
    enabled: Boolean(cycleId && movementsQuery.data?.length),
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_movement_attachments" as any) as any)
        .select("id,movement_id,file_name,storage_path,created_at")
        .in("movement_id", movementsQuery.data?.map((movement) => movement.id) || [])
        .order("created_at");
      if (error) throw error;
      return (data || []) as MovementAttachment[];
    },
  });
  const cycleServicesQuery = useQuery({
    queryKey: ["billing-v2-cycle-services", cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_cycle_services" as any) as any)
        .select("*")
        .eq("cycle_id", cycleId);
      if (error) throw error;
      return (data || []) as CycleService[];
    },
  });
  const previousClosedPlacementsQuery = useQuery({
    queryKey: ["billing-v2-previous-closed-placements", previousClosedCycleQuery.data?.id],
    enabled: Boolean(previousClosedCycleQuery.data?.id && !cycleId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_placements" as any) as any)
        .select("*")
        .eq("cycle_id", previousClosedCycleQuery.data!.id)
        .is("ended_on", null)
        .order("started_on");
      if (error) throw error;
      return (data || []) as Placement[];
    },
  });
  const branches = branchesQuery.data || [],
    recentBranches = recentBranchesQuery.data || [],
    equipment = equipmentQuery.data || [],
    residues = residuesQuery.data || [],
    placements = placementsQuery.data || [],
    movements = movementsQuery.data || [],
    movementAttachments = movementAttachmentsQuery.data || [],
    clientServices = servicesQuery.data || [],
    outsourcedCompanies = outsourcedCompaniesQuery.data || [],
    outsourcedCompanyServices = outsourcedCompanyServicesQuery.data || [],
    clientServiceRates = clientServiceRatesQuery.data || [],
    clientServiceRateOverrides = clientServiceRateOverridesQuery.data || [],
    cycleServices = cycleServicesQuery.data || [],
    previousClosedCycle = previousClosedCycleQuery.data || null,
    previousClosedPlacements = previousClosedPlacementsQuery.data || [],
    companyProfile = companyProfileQuery.data || null;
  useEffect(() => {
    setImportPlacementIds((previousClosedPlacementsQuery.data || []).map((item) => item.id));
  }, [previousClosedPlacementsQuery.data]);
  const activeResidues = residues.filter((item) => item.active);
  const clientHasNoBranches = Boolean(clientId && !branchesQuery.isLoading && !branches.length);
  const services = useMemo(() => {
    const outsourcedCatalog = outsourcedCompanyServices
      .map((link) => link.waste_services)
      .filter((service): service is NonNullable<typeof service> => Boolean(service?.active))
      .map((service) => ({ id: service.id, name: service.name || "Serviço", active: service.active, default_rate: 0, branch_id: service.branch_id }));
    const clientOnly = clientServices.filter((service) =>
      !outsourcedCompanyServices.some((link) => link.waste_service_id === service.id),
    );
    return [...outsourcedCatalog, ...clientOnly]
      .filter((service, index, all) => all.findIndex((item) => item.id === service.id) === index)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [clientServices, outsourcedCompanyServices]);
  const clientConfiguredServiceIds = useMemo(
    () => new Set([
      ...clientServices.map((service) => service.id),
      ...clientServiceRates.map((rate) => rate.waste_service_id),
      ...clientServiceRateOverrides.map((rate) => rate.waste_service_id),
    ]),
    [clientServices, clientServiceRates, clientServiceRateOverrides],
  );
  const serviceAmountForClient = (serviceId: string) => {
    const branchId = cycle?.branch_id || null;
    const companyId = cycle?.issuer_type === "outsourced" ? cycle.outsourced_company_id || null : null;
    const scoped = clientServiceRateOverrides.filter((rate) => rate.waste_service_id === serviceId);
    const exact = scoped.find((rate) => rate.branch_id === branchId && rate.outsourced_company_id === companyId);
    const company = companyId ? scoped.find((rate) => !rate.branch_id && rate.outsourced_company_id === companyId) : undefined;
    const branch = branchId ? scoped.find((rate) => rate.branch_id === branchId && !rate.outsourced_company_id) : undefined;
    return Number(
      exact?.default_rate ?? company?.default_rate ?? branch?.default_rate ??
      clientServiceRates.find((rate) => rate.waste_service_id === serviceId)?.default_rate ??
      services.find((service) => service.id === serviceId)?.default_rate ?? 0,
    );
  };
  const residuesForBranch = (branchId: string) => {
    const available = activeResidues.filter(
      (item) => !item.branch_id || (Boolean(branchId) && item.branch_id === branchId),
    );
    const byName = new Map<string, Residue>();
    available.forEach((item) => {
      const key = serviceNameKey(item.name);
      const current = byName.get(key);
      // Quando houver valor próprio do pátio, ele substitui visualmente o
      // cadastro geral de mesmo nome. Assim a movimentação não consegue
      // selecionar por engano a regra padrão.
      if (!current || (item.branch_id === branchId && current.branch_id !== branchId)) {
        byName.set(key, item);
      }
    });
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  };
  const treatmentRateForBranch = (residueId: string | null | undefined, branchId: string) => {
    const selected = residues.find((item) => item.id === residueId);
    if (!selected) return 0;
    const effective = residuesForBranch(branchId).find(
      (item) => serviceNameKey(item.name) === serviceNameKey(selected.name),
    );
    return Number(effective?.default_treatment_rate ?? selected.default_treatment_rate ?? 0);
  };
  const residuesForCycleBranch = useMemo(
    () => residuesForBranch(cycle?.branch_id || ""),
    [residues, cycle?.branch_id],
  );
  useEffect(() => {
    if (residueFilterId !== "all" && !residuesForCycleBranch.some((item) => item.id === residueFilterId)) {
      setResidueFilterId("all");
    }
  }, [residueFilterId, residuesForCycleBranch]);
  const activePlacementsAtBranch = useMemo(
    () =>
      placements.filter(
        (item) =>
          branchKey(item.branch_id) === movementForm.branchId &&
          !item.ended_on &&
          Number(item.quantity || 0) > 0,
      ),
    [placements, movementForm.branchId],
  );
  const incomingEquipmentBase = useMemo(
    () =>
      equipment
        .filter((item) => branchKey(item.branch_id) === movementForm.branchId)
        .filter((item) => !outgoingPlacementIds.some((id) => activePlacementsAtBranch.find((placement) => placement.id === id)?.equipment_id === item.id)),
    [equipment, movementForm.branchId, outgoingPlacementIds, activePlacementsAtBranch],
  );
  const placementsForSelectedBranch = useMemo(
    () =>
      rentalBranchFilter
        ? placements.filter((item) => branchKey(item.branch_id) === rentalBranchFilter)
        : placements,
    [placements, rentalBranchFilter],
  );
  const movementsForSelectedBranch = useMemo(
    () =>
      movementBranchFilter
        ? movements.filter((item) => branchKey(item.branch_id) === movementBranchFilter)
        : movements,
    [movements, movementBranchFilter],
  );
  const selectedOutgoingPlacements = activePlacementsAtBranch.filter((item) =>
    outgoingPlacementIds.includes(item.id),
  );
  const outgoingQuantity = selectedOutgoingPlacements.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );
  useEffect(() => {
    if (!lockedBranchId) return;
    setCycleBranchId(lockedBranchId);
    setRentalBranchFilter(lockedBranchId);
    setMovementBranchFilter(lockedBranchId);
    setPlacementForm((current) => ({ ...current, branchId: lockedBranchId, equipmentId: "" }));
    setMovementForm((current) => ({ ...current, branchId: lockedBranchId }));
  }, [lockedBranchId]);

  const openCycle = useMutation({
    mutationFn: async () => {
      if (!clientId) throw Error("Selecione um cliente.");
      if (!periodStart || !periodEnd || periodEnd < periodStart)
        throw Error("Informe um intervalo de datas válido para o boletim.");
      if (branches.length && !cycleBranchId) throw Error("Selecione a filial ou pátio deste boletim.");
      const { data, error } = await (supabase.from("billing_v2_cycles" as any) as any)
        .insert({ client_id: clientId, branch_id: branchToDb(cycleBranchId), period_start: periodStart, period_end: periodEnd })
        .select("id")
        .single();
      if (error) throw error;
      if (importPlacementIds.length && previousClosedCycle && cycleBranchId) {
        const { data: sourcePlacements, error: sourceError } = await (supabase.from("billing_v2_placements" as any) as any)
          .select("id,equipment_id,waste_residue_id,quantity,observation")
          .eq("cycle_id", previousClosedCycle.id)
          .is("ended_on", null);
        if (sourceError) {
          await (supabase.from("billing_v2_cycles" as any) as any).delete().eq("id", data.id);
          throw sourceError;
        }
        const chosen = (sourcePlacements || []).filter((item: Placement) => importPlacementIds.includes(item.id));
        if (chosen.length) {
          const equipmentIds = chosen.map((item: Placement) => item.equipment_id);
          const { data: currentEquipment, error: equipmentError } = await (supabase.from("waste_equipment" as any) as any)
            .select("id,monthly_rental_rate")
            .in("id", equipmentIds);
          if (equipmentError) {
            await (supabase.from("billing_v2_cycles" as any) as any).delete().eq("id", data.id);
            throw equipmentError;
          }
          const rates = new Map((currentEquipment || []).map((item: { id: string; monthly_rental_rate: number }) => [item.id, item.monthly_rental_rate]));
          const { error: copyError } = await (supabase.from("billing_v2_placements" as any) as any).insert(
            chosen.map((item: Placement) => ({
              cycle_id: data.id,
              client_id: clientId,
              branch_id: branchToDb(cycleBranchId),
              equipment_id: item.equipment_id,
              waste_residue_id: item.waste_residue_id,
              started_on: periodStart,
              quantity: Number(item.quantity || 0),
              monthly_rental_rate: Number(rates.get(item.equipment_id) || 0),
              observation: item.observation,
            })),
          );
          if (copyError) {
            await (supabase.from("billing_v2_cycles" as any) as any).delete().eq("id", data.id);
            throw copyError;
          }
        }
      }
      return data.id as string;
    },
    onSuccess: (id) => {
      setCreateOpen(false);
      setCycleId(id);
      setResidueFilterId("all");
      qc.invalidateQueries({ queryKey: ["billing-v2-cycles", clientId] });
      qc.invalidateQueries({ queryKey: ["billing-v2-recent"] });
      setTab("locacoes");
      toast.success(importPlacementIds.length && previousClosedCycle && cycleBranchId ? "Novo boletim aberto com os equipamentos selecionados." : "Novo boletim aberto vazio para edição.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["billing-v2-placements", cycleId] });
    qc.invalidateQueries({ queryKey: ["billing-v2-movements", cycleId] });
    qc.invalidateQueries({ queryKey: ["billing-v2-pending-movements"] });
    qc.invalidateQueries({ queryKey: ["billing-v2-cycle-services", cycleId] });
  };
  const saveIssuer = useMutation({
    mutationFn: async ({ issuerType, companyId }: { issuerType: "jacoby" | "outsourced"; companyId: string }) => {
      if (!cycleId) throw Error("Abra um boletim antes de definir o emissor.");
      if (issuerType === "outsourced" && !companyId) throw Error("Selecione a empresa terceirizada emissora.");
      const { error } = await (supabase.from("billing_v2_cycles" as any) as any)
        .update({ issuer_type: issuerType, outsourced_company_id: issuerType === "outsourced" ? companyId : null })
        .eq("id", cycleId);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedServiceId("");
      setServiceAmount("0");
      void qc.invalidateQueries({ queryKey: ["billing-v2-cycles", clientId] });
      toast.success("Emissor do demonstrativo salvo.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const addCycleService = useMutation({
    mutationFn: async () => {
      if (!cycleId || !selectedServiceId) throw Error("Selecione o serviço para incluir no boletim.");
      const issuerCompanyId = cycle?.issuer_type === "outsourced" ? cycle.outsourced_company_id : null;
      const quantity = Math.max(1, Number(serviceQuantity || 1));
      const unitAmount = Number(serviceAmount || 0);
      const { error } = await (supabase.from("billing_v2_cycle_services" as any) as any).insert({
        cycle_id: cycleId,
        waste_service_id: selectedServiceId,
        outsourced_company_id: issuerCompanyId,
        amount: unitAmount * quantity,
        unit_amount: unitAmount,
        quantity,
        observation: serviceObservation.trim() || null,
        execution_date: serviceExecutionDate || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setSelectedServiceId(""); setServiceAmount("0"); setServiceQuantity("1"); setServiceObservation(""); refresh(); toast.success("Serviço incluído no boletim."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const updateCycleServiceAmount = async (id: string, amount: string, quantity: number) => {
    const unitAmount = Number(amount || 0);
    const { error } = await (supabase.from("billing_v2_cycle_services" as any) as any)
      .update({ unit_amount: unitAmount, amount: unitAmount * Math.max(1, Number(quantity || 1)) })
      .eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };
  const updateCycleServiceQuantity = async (id: string, quantity: string, unitAmount: number) => {
    const parsedQuantity = Math.max(1, Number(quantity || 1));
    const { error } = await (supabase.from("billing_v2_cycle_services" as any) as any)
      .update({ quantity: parsedQuantity, amount: parsedQuantity * Number(unitAmount || 0) })
      .eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };
  const updateCycleServiceObservation = async (id: string, observation: string) => {
    const { error } = await (supabase.from("billing_v2_cycle_services" as any) as any)
      .update({ observation: observation.trim() || null })
      .eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };
  const updateCycleServiceExecutionDate = async (id: string, executionDate: string) => {
    const { error } = await (supabase.from("billing_v2_cycle_services" as any) as any)
      .update({ execution_date: executionDate || null })
      .eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };
  const updateCycleServiceBillingDate = async (id: string, invoiceDate: string) => {
    const { error } = await (supabase.from("billing_v2_cycle_services" as any) as any)
      .update({ invoice_issued_on: invoiceDate || null })
      .eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };
  const updateCycleServicePaymentDate = async (id: string, paymentDate: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await (supabase.from("billing_v2_cycle_services" as any) as any)
      .update({
        received_on: paymentDate || null,
        payment_status: paymentDate && paymentDate <= today ? "received" : "pending",
      })
      .eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };
  const uploadCycleServiceInvoicePdf = async (service: CycleService, file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Anexe somente arquivos em PDF.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("O PDF deve ter no máximo 15 MB.");
      return;
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `service-invoices/${service.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("movement-documents")
      .upload(storagePath, file, { contentType: "application/pdf", upsert: false });
    if (uploadError) return toast.error(uploadError.message);
    const { error } = await (supabase.from("billing_v2_cycle_services" as any) as any)
      .update({ invoice_pdf_name: file.name, invoice_pdf_path: storagePath })
      .eq("id", service.id);
    if (error) {
      await supabase.storage.from("movement-documents").remove([storagePath]);
      return toast.error(error.message);
    }
    if (service.invoice_pdf_path && service.invoice_pdf_path !== storagePath) {
      await supabase.storage.from("movement-documents").remove([service.invoice_pdf_path]);
    }
    refresh();
    toast.success("PDF de faturamento anexado ao BM e ao Financeiro.");
  };
  const openCycleServiceInvoicePdf = async (service: CycleService) => {
    if (!service.invoice_pdf_path) return;
    const { data, error } = await supabase.storage.from("movement-documents")
      .createSignedUrl(service.invoice_pdf_path, 600);
    if (error || !data?.signedUrl) return toast.error(error?.message || "Não foi possível abrir o PDF.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  const addPlacement = useMutation({
    mutationFn: async () => {
      if (!cycleId || !placementForm.branchId || !placementForm.equipmentId)
        throw Error("Abra um boletim e informe filial/pátio e equipamento.");
      if (lockedBranchId && placementForm.branchId !== lockedBranchId)
        throw Error("Este boletim pertence a outra filial/pátio.");
      const { error } = await (supabase.from("billing_v2_placements" as any) as any).insert({
        cycle_id: cycleId,
        client_id: clientId,
        branch_id: branchToDb(placementForm.branchId),
        equipment_id: placementForm.equipmentId,
        waste_residue_id: placementForm.residueId || null,
        started_on: placementForm.date,
        quantity: Number(placementForm.quantity || 0),
        monthly_rental_rate: Number(equipment.find((item) => item.id === placementForm.equipmentId)?.monthly_rental_rate || 0),
        observation: placementForm.observation || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setPlacementForm({
        ...placementForm,
        equipmentId: "",
        residueId: "",
        quantity: "1",
        observation: "",
      });
      refresh();
      toast.success("Equipamento incluído em locação.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const updatePlacement = async (id: string, values: { started_on: string; quantity: string; observation: string }) => {
    const quantity = Number(values.quantity);
    if (!values.started_on || !Number.isFinite(quantity) || quantity < 1) {
      toast.error("Informe uma data e uma quantidade válida.");
      return;
    }
    const { error } = await (supabase.from("billing_v2_placements" as any) as any)
      .update({
        started_on: values.started_on,
        quantity,
        observation: values.observation.trim() || null,
      })
      .eq("id", id);
    if (error) throw error;
    refresh();
    toast.success("Locação atualizada.");
  };
  const addMovement = useMutation({
    mutationFn: async () => {
      if (savingMovementRef.current) return;
      savingMovementRef.current = true;
      try {
      if (!cycleId || !movementForm.branchId)
        throw Error("Abra um boletim e informe a filial/pátio.");
      if (lockedBranchId && movementForm.branchId !== lockedBranchId)
        throw Error("Este boletim pertence a outra filial/pátio.");
      const hasOutgoing = selectedOutgoingPlacements.length > 0;
      const hasIncoming = incomingEquipmentIds.length > 0;
      if (!hasOutgoing && hasIncoming)
        throw Error("Selecione ao menos um equipamento em Retirada antes de registrar uma colocação.");
      if (hasOutgoing && !Number.isInteger(outgoingQuantity))
        throw Error("A quantidade dos equipamentos em locação deve ser inteira para uma troca em lote.");
      if (hasOutgoing && hasIncoming && incomingEquipmentIds.length !== outgoingQuantity)
        throw Error(`Selecione ${outgoingQuantity} equipamento(s) colocado(s) para concluir esta troca.`);

      let incomingIndex = 0;
      const pairs = hasOutgoing
        ? selectedOutgoingPlacements.flatMap((placement) =>
            Array.from({ length: Number(placement.quantity || 0) }, () => ({
              placement,
              replacementEquipmentId: incomingEquipmentIds[incomingIndex++],
            })),
          )
        : [{ placement: null, replacementEquipmentId: null }];
      const batchId = pairs.length > 1 ? crypto.randomUUID() : null;
      const totalWeight = Number(movementForm.weight || 0);
      const treatmentRate = treatmentRateForBranch(
        movementForm.residueId,
        movementForm.branchId,
      );
      const movementRows = pairs.map((pair, index) => ({
        cycle_id: cycleId,
        batch_id: batchId,
        branch_id: branchToDb(movementForm.branchId),
        equipment_id: pair.placement?.equipment_id || null,
        replacement_equipment_id: pair.replacementEquipmentId || null,
        waste_residue_id: movementForm.residueId || null,
        occurred_on: movementForm.date,
        service_order: movementForm.order || null,
        mtr_number: movementForm.mtr.trim() || null,
        placed_quantity: hasOutgoing ? 1 : 0,
        removed_quantity: hasOutgoing ? 1 : 0,
        weight_kg:
          index === pairs.length - 1
            ? totalWeight - (totalWeight / pairs.length) * index
            : totalWeight / pairs.length,
        observation: movementForm.observation || null,
        // A confirmação é feita depois, na própria linha lançada. Enquanto
        // estiver pendente, a movimentação fica registrada, mas não entra no BM.
        confirmed: false,
        treatment_rate: treatmentRate,
        exchange_rate: Number(
          equipment.find((item) => item.id === pair.placement?.equipment_id)?.exchange_rate || 0,
        ),
      }));
      const { error } = await (supabase.from("billing_v2_movements" as any) as any).insert(movementRows);
      if (error) throw error;

      // A troca já atualiza a relação de equipamentos no pátio. A confirmação
      // da tabela abaixo controla exclusivamente se ela gera valor no BM.
      if (hasOutgoing) {
        if (!hasIncoming) {
          const { error: endError } = await (supabase.from("billing_v2_placements" as any) as any)
            .update({ ended_on: movementForm.date })
            .in("id", selectedOutgoingPlacements.map((placement) => placement.id));
          if (endError) throw endError;
          return;
        }
        let replacementIndex = 0;
        for (const placement of selectedOutgoingPlacements) {
          const quantity = Number(placement.quantity || 0);
          const replacements = incomingEquipmentIds.slice(replacementIndex, replacementIndex + quantity);
          replacementIndex += quantity;
          if (quantity === 1) {
            const { error: replaceError } = await (supabase.from("billing_v2_placements" as any) as any)
              .update({ equipment_id: replacements[0] })
              .eq("id", placement.id);
            if (replaceError) throw replaceError;
          } else {
            const { error: deleteError } = await (supabase.from("billing_v2_placements" as any) as any)
              .delete()
              .eq("id", placement.id);
            if (deleteError) throw deleteError;
            const { error: replacementError } = await (supabase.from("billing_v2_placements" as any) as any).insert(
              replacements.map((equipmentId) => ({
                cycle_id: cycleId,
                client_id: clientId,
                branch_id: branchToDb(movementForm.branchId),
                equipment_id: equipmentId,
                waste_residue_id: placement.waste_residue_id,
                started_on: placement.started_on,
                quantity: 1,
                monthly_rental_rate: Number(placement.monthly_rental_rate || 0),
                observation: placement.observation,
              })),
            );
            if (replacementError) throw replacementError;
          }
        }
      }
      } finally {
        savingMovementRef.current = false;
      }
    },
    onSuccess: () => {
      setMovementForm({
        ...movementForm,
        residueId: "",
        order: "",
        mtr: "",
        weight: "0",
        observation: "",
      });
      setOutgoingPlacementIds([]);
      setIncomingEquipmentIds([]);
      refresh();
      toast.success("Movimentação registrada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const toggleMovementConfirmation = useMutation({
    mutationFn: async ({ ids, confirmed }: { ids: string[]; confirmed: boolean }) => {
      const { error } = await (supabase.from("billing_v2_movements" as any) as any)
        .update({ confirmed })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_data, { confirmed }) => {
      void qc.invalidateQueries({ queryKey: ["billing-v2-movements", cycleId] });
      void qc.invalidateQueries({ queryKey: ["billing-v2-pending-movements"] });
      toast.success(confirmed ? "Movimentação confirmada: valores incluídos no BM." : "Movimentação pendente: valores retirados do BM.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const updateMovement = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Movement> }) => {
      const currentMovement = movements.find((item) => item.id === id);
      const outgoingEquipment = equipment.find((item) => item.id === payload.equipment_id);
      const { error } = await (supabase.from("billing_v2_movements" as any) as any)
        .update({
          ...payload,
          treatment_rate: treatmentRateForBranch(
            payload.waste_residue_id,
            String(payload.branch_id || currentMovement?.branch_id || ""),
          ),
          exchange_rate: Number(outgoingEquipment?.exchange_rate || 0),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Movimentação atualizada. Os valores do BM foram recalculados.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const addMovementAttachment = useMutation({
    mutationFn: async ({ movementId, fileName, storagePath }: { movementId: string; fileName: string; storagePath: string }) => {
      const { error } = await (supabase.from("billing_v2_movement_attachments" as any) as any)
        .insert({ movement_id: movementId, file_name: fileName, storage_path: storagePath });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["billing-v2-movement-attachments", cycleId] });
      toast.success("PDF anexado à movimentação.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeMovementAttachment = useMutation({
    mutationFn: async (attachment: MovementAttachment) => {
      const { error: storageError } = await supabase.storage
        .from("movement-documents")
        .remove([attachment.storage_path]);
      if (storageError) throw storageError;
      const { error } = await (supabase.from("billing_v2_movement_attachments" as any) as any)
        .delete()
        .eq("id", attachment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["billing-v2-movement-attachments", cycleId] });
      toast.success("PDF removido da movimentação.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const ensureResidueEmission = async () => {
    if (!cycleId || residueFilterId === "all" || !cycle) throw Error("Selecione um resíduo para emitir este recorte.");
    const existing = (residueEmissionsQuery.data || [])
      .filter((item) => item.cycle_id === cycleId && item.waste_residue_id === residueFilterId)
      .sort((a, b) => b.sequence - a.sequence)[0];
    if (existing) return existing;
    const sequence = Math.max(
      0,
      ...(residueEmissionsQuery.data || [])
        .filter((item) => item.cycle_id === cycleId)
        .map((item) => Number(item.sequence || 0)),
    ) + 1;
    const displayNumber = `${String(cycle.bulletin_number || 0).padStart(3, "0")}.${sequence}`;
    const { data, error } = await (supabase.from("billing_v2_residue_emissions" as any) as any)
      .insert({
        cycle_id: cycleId,
        waste_residue_id: residueFilterId,
        sequence,
        display_number: displayNumber,
        finalized_at: new Date().toISOString(),
      })
      .select("id,cycle_id,waste_residue_id,sequence,display_number,finalized_at,client_portal_visible")
      .single();
    if (error) throw error;
    return data as ResidueEmission;
  };
  const finalizeCycle = useMutation({
    mutationFn: async () => {
      if (!cycleId) throw Error("Abra um boletim antes de finalizá-lo.");
      if (residueFilterId !== "all") {
        const emission = await ensureResidueEmission();
        const cycleResidues = Array.from(new Set([
          ...placements.filter((item) => item.waste_residue_id).map((item) => item.waste_residue_id as string),
          ...movements.filter((item) => item.confirmed && item.waste_residue_id).map((item) => item.waste_residue_id as string),
        ]));
        const { data: emissionsNow, error: emissionsError } = await (supabase.from("billing_v2_residue_emissions" as any) as any)
          .select("waste_residue_id")
          .eq("cycle_id", cycleId);
        if (emissionsError) throw emissionsError;
        const finalizedSet = new Set((emissionsNow || []).map((item: { waste_residue_id: string }) => item.waste_residue_id));
        const stillPending = cycleResidues.filter((id) => !finalizedSet.has(id));
        const closedNow = cycleResidues.length > 0 && stillPending.length === 0;
        if (closedNow) {
          const { error } = await (supabase.from("billing_v2_cycles" as any) as any)
            .update({ status: "closed", finalized_at: new Date().toISOString() })
            .eq("id", cycleId);
          if (error) throw error;
        }
        return { displayNumber: emission.display_number, residueEmission: true, closedNow, pending: stillPending.length };
      }
      const { error } = await (supabase.from("billing_v2_cycles" as any) as any)
        .update({ status: "closed", finalized_at: new Date().toISOString() })
        .eq("id", cycleId);
      if (error) throw error;
      return { residueEmission: false, closedNow: true, pending: 0 };
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["billing-v2-cycles", clientId] });
      void qc.invalidateQueries({ queryKey: ["billing-v2-recent"] });
      void qc.invalidateQueries({ queryKey: ["billing-v2-residue-emissions", clientId] });
      if (!result.residueEmission) {
        toast.success("Boletim finalizado. Ele continuará disponível para edição e reimpressão.");
      } else if (result.closedNow) {
        toast.success(`Emissão #${result.displayNumber} finalizada. Todos os resíduos concluídos — boletim encerrado.`);
      } else {
        toast.success(`Emissão #${result.displayNumber} finalizada. Falta(m) ${result.pending} resíduo(s) pendente(s).`);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const reopenCycle = useMutation({
    mutationFn: async () => {
      if (!cycleId) throw Error("Abra um boletim antes de reabri-lo.");
      const { error } = await (supabase.from("billing_v2_cycles" as any) as any)
        .update({ status: "draft", finalized_at: null, client_portal_visible: false })
        .eq("id", cycleId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["billing-v2-cycles", clientId] });
      void qc.invalidateQueries({ queryKey: ["billing-v2-recent"] });
      void qc.invalidateQueries({ queryKey: ["billing-v2-residue-emissions", clientId] });
      toast.success("Boletim reaberto. Ele volta para edição e deixa de contar no faturamento até ser finalizado novamente.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const reevaluateCycleClosure = async (targetCycleId: string) => {
    const { data: cycleRow } = await (supabase.from("billing_v2_cycles" as any) as any)
      .select("status").eq("id", targetCycleId).maybeSingle();
    if (!cycleRow || cycleRow.status !== "closed") return false;
    const [placementsRes, movementsRes, emissionsRes] = await Promise.all([
      (supabase.from("billing_v2_placements" as any) as any).select("waste_residue_id").eq("cycle_id", targetCycleId),
      (supabase.from("billing_v2_movements" as any) as any).select("waste_residue_id,confirmed").eq("cycle_id", targetCycleId),
      (supabase.from("billing_v2_residue_emissions" as any) as any).select("waste_residue_id").eq("cycle_id", targetCycleId),
    ]);
    const realResidues = new Set<string>();
    (placementsRes.data || []).forEach((item: { waste_residue_id: string | null }) => { if (item.waste_residue_id) realResidues.add(item.waste_residue_id); });
    (movementsRes.data || []).forEach((item: { waste_residue_id: string | null; confirmed: boolean | null }) => { if (item.confirmed && item.waste_residue_id) realResidues.add(item.waste_residue_id); });
    const finalized = new Set((emissionsRes.data || []).map((item: { waste_residue_id: string }) => item.waste_residue_id));
    const pending = Array.from(realResidues).filter((id) => !finalized.has(id));
    if (!pending.length) return false;
    const { error } = await (supabase.from("billing_v2_cycles" as any) as any)
      .update({ status: "draft", finalized_at: null }).eq("id", targetCycleId);
    if (error) throw error;
    return true;
  };
  const removeResidueEmission = useMutation({
    mutationFn: async (residueId: string) => {
      if (!cycleId) throw Error("Abra um boletim antes de desfazer uma finalização.");
      const { error } = await (supabase.from("billing_v2_residue_emissions" as any) as any)
        .delete()
        .eq("cycle_id", cycleId)
        .eq("waste_residue_id", residueId);
      if (error) throw error;
      const reopened = await reevaluateCycleClosure(cycleId);
      return { reopened };
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["billing-v2-residue-emissions", clientId] });
      void qc.invalidateQueries({ queryKey: ["billing-v2-cycles", clientId] });
      void qc.invalidateQueries({ queryKey: ["billing-v2-recent"] });
      toast.success(result.reopened ? "Finalização desfeita — o boletim voltou para edição." : "Finalização do resíduo desfeita. Essa emissão foi removida.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteResidueEmission = useMutation({
    mutationFn: async (emission: { id: string; cycleId: string }) => {
      const { error } = await (supabase.from("billing_v2_residue_emissions" as any) as any).delete().eq("id", emission.id);
      if (error) throw error;
      const reopened = await reevaluateCycleClosure(emission.cycleId);
      return { reopened };
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["billing-v2-residue-emissions", clientId] });
      void qc.invalidateQueries({ queryKey: ["billing-v2-cycles", clientId] });
      void qc.invalidateQueries({ queryKey: ["billing-v2-recent"] });
      toast.success(result.reopened ? "Emissão excluída — o boletim voltou para edição." : "Emissão por resíduo excluída.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const requestBillingEmailDispatch = async (payload: { cycleId: string; residueEmissionId?: string; customMessage?: string }) => {
    const { data, error } = await supabase.functions.invoke("send-billing-emails", { body: payload });
    void qc.invalidateQueries({ queryKey: ["billing-email-deliveries", clientId] });
    if (error || data?.configured === false) {
      toast.info("Publicado no portal. O aviso por e-mail ficou aguardando a configuração do Resend.");
      return;
    }
    if (Number(data?.sent || 0) > 0) {
      toast.success(`${data.sent} aviso${Number(data.sent) === 1 ? "" : "s"} por e-mail enviado${Number(data.sent) === 1 ? "" : "s"}.`);
    } else if (Number(data?.processed || 0) === 0) {
      toast.info("Publicado no portal, mas este cliente não possui destinatário de e-mail vinculado.");
    }
  };
  const setCyclePortalVisibility = useMutation({
    mutationFn: async ({ id, visible }: { id: string; visible: boolean; customMessage?: string; sendEmail?: boolean }) => {
      const { error } = await (supabase.from("billing_v2_cycles" as any) as any)
        .update({ client_portal_visible: visible })
        .eq("id", id)
        .eq("status", "closed");
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ["billing-v2-cycles", clientId] });
      void qc.invalidateQueries({ queryKey: ["billing-v2-recent"] });
      toast.success(variables.visible ? "Boletim publicado no portal do cliente." : "Boletim removido do portal do cliente.");
      if (variables.visible && variables.sendEmail) void requestBillingEmailDispatch({ cycleId: variables.id, customMessage: variables.customMessage });
      else void qc.invalidateQueries({ queryKey: ["billing-email-deliveries", clientId] });
      if (variables.visible && variables.sendEmail) setPublishDialog(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const setResidueEmissionPortalVisibility = useMutation({
    mutationFn: async ({ id, visible }: { id: string; visible: boolean; customMessage?: string; sendEmail?: boolean }) => {
      const { error } = await (supabase.from("billing_v2_residue_emissions" as any) as any)
        .update({ client_portal_visible: visible })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ["billing-v2-residue-emissions", clientId] });
      toast.success(variables.visible ? "Emissão publicada no portal do cliente." : "Emissão removida do portal do cliente.");
      if (variables.visible && variables.sendEmail) {
        const emission = residueEmissionsQuery.data?.find((item) => item.id === variables.id);
        if (emission) void requestBillingEmailDispatch({ cycleId: emission.cycle_id, residueEmissionId: variables.id, customMessage: variables.customMessage });
      } else {
        void qc.invalidateQueries({ queryKey: ["billing-email-deliveries", clientId] });
      }
      if (variables.visible && variables.sendEmail) setPublishDialog(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const openPublishConfirmation = async (target: PublishDialogTarget) => {
    setPublishDialog(target);
    setEmailMessage("");
    setRecipientPreview([]);
    setRecipientPreviewError("");
    setRecipientPreviewLoading(true);
    const { data, error } = await supabase.functions.invoke("send-billing-emails", {
      body: { cycleId: target.cycle.id, previewOnly: true },
    });
    if (error) {
      setRecipientPreviewError("Não foi possível conferir os e-mails agora. Verifique a integração antes de enviar.");
    } else {
      setRecipientPreview(Array.isArray(data?.recipients) ? data.recipients : []);
    }
    setRecipientPreviewLoading(false);
  };
  const confirmPublishAndSend = () => {
    if (!publishDialog) return;
    const customMessage = emailMessage.trim();
    if (publishDialog.residueEmission) {
      setResidueEmissionPortalVisibility.mutate({
        id: publishDialog.residueEmission.id,
        visible: true,
        customMessage,
        sendEmail: true,
      });
      return;
    }
    setCyclePortalVisibility.mutate({ id: publishDialog.cycle.id, visible: true, customMessage, sendEmail: true });
  };
  const remove = async (table: string, id: string) => {
    if (!confirm("Excluir este lançamento?") || !id) return;
    const { error } = await (supabase.from(table as any) as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };
  const removeMovements = async (ids: string[]) => {
    if (!ids.length || !confirm(ids.length > 1 ? "Excluir esta movimentação agrupada e todos os equipamentos dela?" : "Excluir esta movimentação?")) return;
    const movementFiles = movementAttachments.filter((attachment) => ids.includes(attachment.movement_id));
    if (movementFiles.length) {
      const { error: storageError } = await supabase.storage
        .from("movement-documents")
        .remove(movementFiles.map((attachment) => attachment.storage_path));
      if (storageError) {
        toast.error(storageError.message);
        return;
      }
    }
    const { error } = await (supabase.from("billing_v2_movements" as any) as any)
      .delete()
      .in("id", ids);
    if (error) toast.error(error.message);
    else refresh();
  };
  const deleteCycle = async (item: Cycle) => {
    const accepted = confirm(
      `Excluir o boletim ${bulletinNumber(item.bulletin_number)}?\n\nSerão excluídos permanentemente as locações, movimentações, trocas, valores e serviços deste boletim. Os demais boletins do cliente não serão alterados.`,
    );
    if (!accepted) return;
    const { error } = await (supabase.from("billing_v2_cycles" as any) as any)
      .delete()
      .eq("id", item.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (cycleId === item.id) {
      setCycleId("");
      setTab("historico");
    }
    qc.invalidateQueries({ queryKey: ["billing-v2-cycles", clientId] });
    qc.invalidateQueries({ queryKey: ["billing-v2-recent"] });
    qc.invalidateQueries({ queryKey: ["billing-v2-placements", item.id] });
    qc.invalidateQueries({ queryKey: ["billing-v2-movements", item.id] });
    qc.invalidateQueries({ queryKey: ["billing-v2-rates", item.id] });
    qc.invalidateQueries({ queryKey: ["billing-v2-cycle-services", item.id] });
    toast.success(`Boletim ${bulletinNumber(item.bulletin_number)} excluído.`);
  };
  const calculateTotals = (selectedPlacements: Placement[], selectedMovements: Movement[], selectedServices: CycleService[]) => {
    const confirmedMovements = selectedMovements.filter((item) => item.confirmed);
    const rental = selectedPlacements.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.monthly_rental_rate || 0),
      0,
    );
    const exchanges = confirmedMovements.reduce((sum, item) => sum + Number(item.removed_quantity || 0), 0);
    const weight = confirmedMovements.reduce((sum, item) => sum + Number(item.weight_kg || 0), 0);
    const exchange = confirmedMovements.reduce(
      (sum, item) => sum + Number(item.removed_quantity || 0) * Number(item.exchange_rate || 0),
      0,
    );
    const treatment = confirmedMovements.reduce(
      (sum, item) => sum + Number(item.weight_kg || 0) * Number(item.treatment_rate || 0),
      0,
    );
    const servicesTotal = selectedServices.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { rental, exchanges, weight, exchange, treatment, services: servicesTotal, total: rental + exchange + treatment + servicesTotal };
  };
  const totals = useMemo(
    () => calculateTotals(placements, movements, cycleServices),
    [placements, movements, cycleServices],
  );
  const filteredPlacements = useMemo(
    () => residueFilterId === "all" ? placements : placements.filter((item) => item.waste_residue_id === residueFilterId),
    [placements, residueFilterId],
  );
  const filteredMovements = useMemo(
    () => residueFilterId === "all" ? movements : movements.filter((item) => item.waste_residue_id === residueFilterId),
    [movements, residueFilterId],
  );
  const filteredServices = residueFilterId === "all" ? cycleServices : [];
  const filteredTotals = useMemo(
    () => calculateTotals(filteredPlacements, filteredMovements, filteredServices),
    [filteredPlacements, filteredMovements, filteredServices],
  );
  const selectedResidueName = residueFilterId === "all" ? "Todos os resíduos" : residues.find((item) => item.id === residueFilterId)?.name || "Resíduo selecionado";
  const clientName = clients.find((item) => item.id === clientId)?.name || "Cliente";
  const branch = (id: string) =>
    branches.find((item) => item.id === id) || recentBranches.find((item) => item.id === id);
  const branchName = (id?: string | null) => branch(id || "")?.name || "Matriz (sem filial/pátio)";
  const clientCycles = cyclesQuery.data || [];
  const residueEmissions = residueEmissionsQuery.data || [];
  const billingEmailDeliveries = billingEmailDeliveriesQuery.data || [];
  const emailDeliverySummary = (targetCycleId: string, residueEmissionId: string | null = null) => {
    const deliveries = billingEmailDeliveries.filter((item) =>
      item.cycle_id === targetCycleId && item.residue_emission_id === residueEmissionId,
    );
    if (!deliveries.length) return { label: "Nenhum envio registrado", title: "Este BM pode ter sido publicado antes da ativação do envio por e-mail ou não possuir um acesso de cliente vinculado." };
    const sent = deliveries.filter((item) => item.status === "sent").length;
    const failed = deliveries.filter((item) => item.status === "failed").length;
    const waiting = deliveries.filter((item) => item.status === "pending" || item.status === "sending").length;
    if (sent === deliveries.length) return { label: `${sent} enviado${sent === 1 ? "" : "s"}`, title: deliveries.map((item) => item.recipient_email).join(", ") };
    if (failed) return { label: `${failed} com falha`, title: deliveries.filter((item) => item.status === "failed").map((item) => `${item.recipient_email}: ${item.last_error || "falha no envio"}`).join("\n") };
    if (waiting) return { label: `${waiting} aguardando`, title: deliveries.map((item) => item.recipient_email).join(", ") };
    return { label: "Não enviado", title: deliveries.map((item) => item.recipient_email).join(", ") };
  };
  const emittedGroups = useMemo(() => {
    const map = new Map<string, { cycleId: string; major: number; parent?: Cycle; emissions: ResidueEmission[] }>();
    clientCycles.filter((item) => item.status === "closed").forEach((item) => {
      map.set(item.id, { cycleId: item.id, major: Number(item.bulletin_number || 0), parent: item, emissions: [] });
    });
    residueEmissions.forEach((item) => {
      const existing = map.get(item.cycle_id);
      if (existing) existing.emissions.push(item);
      else {
        const parent = clientCycles.find((candidate) => candidate.id === item.cycle_id);
        map.set(item.cycle_id, { cycleId: item.cycle_id, major: Number(parent?.bulletin_number || 0), parent, emissions: [item] });
      }
    });
    const groups = Array.from(map.values());
    groups.forEach((group) => group.emissions.sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0)));
    return groups.sort((a, b) => a.major - b.major);
  }, [clientCycles, residueEmissions]);
  const finalizedResidueIds = new Set(residueEmissions.filter((item) => item.cycle_id === cycleId).map((item) => item.waste_residue_id));
  const cycleResidueIds = Array.from(new Set([
    ...placements.filter((item) => item.waste_residue_id).map((item) => item.waste_residue_id as string),
    ...movements.filter((item) => item.confirmed && item.waste_residue_id).map((item) => item.waste_residue_id as string),
  ]));
  const pendingResidueNames = cycleResidueIds.filter((id) => !finalizedResidueIds.has(id)).map((id) => residues.find((item) => item.id === id)?.name || "Resíduo");
  const finalizedResidueNames = cycleResidueIds.filter((id) => finalizedResidueIds.has(id)).map((id) => residues.find((item) => item.id === id)?.name || "Resíduo");
  const recentCycles = (recentCyclesQuery.data || [])
    .filter((item) => (resultStatusFilter === "all" ? true : resultStatusFilter === "closed" ? item.status === "closed" : item.status !== "closed"))
    .sort((a, b) => (a.status === "closed" ? 1 : 0) - (b.status === "closed" ? 1 : 0));
  const bmSearching = Number.isFinite(bmSearchNumber) && bmSearchNumber > 0;
  const recentDisplayCycles = bmSearching ? (bmSearchQuery.data || []) : recentCycles;
  const pendingMovementGroups = useMemo(() => {
    const grouped = new Map<string, PendingMovement[]>();
    (pendingMovementsQuery.data || []).forEach((item) => {
      const key = item.batch_id || item.id;
      grouped.set(key, [...(grouped.get(key) || []), item]);
    });
    return Array.from(grouped.entries())
      .map(([key, rows]) => ({ key, rows }))
      .sort((a, b) => a.rows[0].occurred_on.localeCompare(b.rows[0].occurred_on));
  }, [pendingMovementsQuery.data]);
  const openRecentCycle = (item: Cycle) => {
    setFocusedMovementId("");
    setClientId(item.client_id);
    setCycleBranchId(branchKey(item.branch_id));
    setCycleId(item.id);
    setResidueFilterId("all");
    setTab("locacoes");
  };
  const openPendingMovement = (item: PendingMovement) => {
    setClientId(item.client_id);
    setCycleBranchId(branchKey(item.cycle_branch_id));
    setCycleId(item.cycle_id);
    setResidueFilterId("all");
    setMovementBranchFilter(branchKey(item.branch_id));
    setFocusedMovementId(item.id);
    setTab("movimentos");
  };
  const issuerCompany = outsourcedCompanies.find((company) => company.id === cycle?.outsourced_company_id);
  const documentThirdParty = issuerCompany || outsourcedCompanies.find((company) =>
    filteredServices.some((service) => service.outsourced_company_id === company.id),
  );
  const availableServices = services
    // Nunca mistura o catálogo de outro cliente no BM atual.
    .filter((service) => clientConfiguredServiceIds.has(service.id))
    .filter((service) => {
      if (cycle?.issuer_type !== "outsourced" || !cycle.outsourced_company_id) return true;
      return outsourcedCompanyServices.some((link) =>
        link.outsourced_company_id === cycle.outsourced_company_id && (
          link.waste_service_id === service.id ||
          serviceNameKey(link.waste_services?.name) === serviceNameKey(service.name)
        )
      );
    })
    .filter((service) => {
      const cycleBranchId = cycle?.branch_id || null;
      const cycleCompanyId = cycle?.issuer_type === "outsourced" ? cycle.outsourced_company_id || null : null;
      const baseScopeMatches = !service.branch_id || service.branch_id === cycleBranchId;
      const matchingOverride = clientServiceRateOverrides.some((rate) =>
        rate.waste_service_id === service.id &&
        (!rate.branch_id || rate.branch_id === cycleBranchId) &&
        (cycleCompanyId ? !rate.outsourced_company_id || rate.outsourced_company_id === cycleCompanyId : !rate.outsourced_company_id),
      );
      return baseScopeMatches || matchingOverride;
    })
    .filter((service) => !cycleServices.some((item) => item.waste_service_id === service.id));
  const selectedServiceStillAvailable = availableServices.some((service) => service.id === selectedServiceId);
  useEffect(() => {
    if (selectedServiceId && !selectedServiceStillAvailable) {
      setSelectedServiceId("");
      setServiceAmount("0");
    }
  }, [selectedServiceId, selectedServiceStillAvailable]);
  const generatePdf = async (options?: { targetCycle: Cycle; placements: Placement[]; movements: Movement[]; services: CycleService[]; includeResidue?: string; bulletinLabel?: string; download?: boolean }) => {
    const printableCycle = options?.targetCycle || cycle;
    const pdfPlacements = options?.placements || filteredPlacements;
    const pdfMovements = options?.movements || filteredMovements;
    const pdfServices = options?.services || filteredServices;
    const pdfResidueId = options?.includeResidue ?? residueFilterId;
    const printableBulletinNumber = options?.bulletinLabel || bulletinNumber(printableCycle?.bulletin_number);
    const pdfClientName = clients.find((item) => item.id === printableCycle?.client_id)?.name || clientName;
    const pdfClient = clients.find((item) => item.id === printableCycle?.client_id);
    const pdfResidueName = pdfResidueId === "all" ? "Todos os resíduos" : residues.find((item) => item.id === pdfResidueId)?.name || "Resíduo selecionado";
    const pdfTreatmentCompany = treatmentCompanyId && printableCycle?.id === cycle?.id ? outsourcedCompanies.find((company) => company.id === treatmentCompanyId) : undefined;
    const pdfIssuerCompany = outsourcedCompanies.find((company) => company.id === printableCycle?.outsourced_company_id);
    const pdfServiceCompany = pdfIssuerCompany || outsourcedCompanies.find((company) =>
      pdfServices.some((service) => service.outsourced_company_id === company.id),
    );
    const confirmedMovements = pdfMovements.filter((item) => item.confirmed);
    const branchIds = Array.from(new Set([...pdfPlacements, ...confirmedMovements].map((item) => item.branch_id).filter(Boolean)));
    if (!branchIds.length && printableCycle?.branch_id) branchIds.push(printableCycle.branch_id);
    if (!printableCycle || (!branchIds.length && !pdfServices.length)) {
      toast.error("Registre uma locação, movimentação ou serviço antes de gerar o PDF.");
      return;
    }
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const jacoby = companyProfile || { legal_name: "JACOBY SOLUÇÕES AMBIENTAIS", trade_name: "Jacoby Soluções Ambientais", cnpj: null, address: null, postal_code: null, phone: null, email: null, environmental_license: null, logo_url: null };
    const issuerName = printableCycle.issuer_type === "outsourced" && pdfIssuerCompany
      ? pdfIssuerCompany.trade_name || pdfIssuerCompany.legal_name
      : jacoby.trade_name || jacoby.legal_name;
    const companyDetails = (company: { cnpj?: string | null; address?: string | null; postal_code?: string | null; phone?: string | null; environmental_license?: string | null }) =>
      [company.cnpj && `CNPJ: ${company.cnpj}`, company.address, company.postal_code && `CEP: ${company.postal_code}`, company.phone && `Fone: ${company.phone}`, company.environmental_license && `Licença: ${company.environmental_license}`].filter(Boolean).join(" · ");
    const drawLogo = async (url: string | null | undefined, x: number, y: number, w: number, h: number, fallback = false) => {
      try {
        if (url) doc.addImage(await logoAsDataUrl(url), "PNG", x, y, w, h);
        else if (fallback) { const image = new Image(); image.src = jacobyLogo; await image.decode(); doc.addImage(image, "PNG", x, y, w, h); }
      } catch {}
    };
    const drawHeader = async (pageBranch: Branch | null, pageIndex: number) => {
      if (pageIndex) doc.addPage();
      doc.setFillColor(62, 122, 79); doc.rect(0, 0, 210, 42, "F");
      doc.setLineWidth(0.35);
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("BOLETIM DE MEDIÇÃO", 105, 16, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text(`Período: ${new Date(`${printableCycle.period_start}T12:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${printableCycle.period_end}T12:00:00`).toLocaleDateString("pt-BR")}`, 105, 23, { align: "center" });
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(`BOLETIM ${printableBulletinNumber}`, 105, 29, { align: "center" });
      doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      const clientHeaderMaxWidth = 170;
      const clientHeaderName = (() => {
        const name = pdfClientName.toUpperCase();
        if (doc.getTextWidth(name) <= clientHeaderMaxWidth) return name;
        const ellipsis = "...";
        let abbreviated = name;
        while (abbreviated.length && doc.getTextWidth(`${abbreviated}${ellipsis}`) > clientHeaderMaxWidth) abbreviated = abbreviated.slice(0, -1);
        return `${abbreviated.trimEnd()}${ellipsis}`;
      })();
      doc.text(clientHeaderName, 105, 36, { align: "center" });
      if (pdfResidueId !== "all") { doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text(`Resíduo: ${pdfResidueName}`, 105, 40, { align: "center" }); }
      const invoiceIssuerNotice = `NOTA FISCAL SERÁ EMITIDA PELA ${printableCycle.issuer_type === "outsourced" ? `TERCEIRIZADA ${issuerName.toUpperCase()}` : "JACOBY SOLUÇÕES AMBIENTAIS"}`;
      doc.setTextColor(35, 96, 58); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
      const invoiceIssuerNoticeLines = doc.splitTextToSize(invoiceIssuerNotice, 168);
      const invoiceIssuerNoticeHeight = Math.max(11, 6 + invoiceIssuerNoticeLines.length * 4);
      const noticeY = 46;
      doc.setFillColor(236, 246, 228); doc.roundedRect(14, noticeY, 182, invoiceIssuerNoticeHeight, 2, 2, "F");
      const invoiceIssuerNoticeY = noticeY + (invoiceIssuerNoticeHeight - (invoiceIssuerNoticeLines.length - 1) * 4) / 2 + 1.2;
      doc.text(invoiceIssuerNoticeLines, 105, invoiceIssuerNoticeY, { align: "center", lineHeightFactor: 1.1 });
      const companyY = noticeY + invoiceIssuerNoticeHeight + 5;
      type HeaderParty = { role: string; name: string; details: string; logo: string | null; fallback?: boolean };
      const parties: HeaderParty[] = [
        { role: "Gerenciadora", name: jacoby.trade_name || jacoby.legal_name, details: companyDetails(jacoby), logo: jacoby.logo_url, fallback: true },
      ];
      const treatmentRole = `Tratamento${pdfResidueId !== "all" ? ` · ${pdfResidueName}` : ""}`;
      if (pdfServiceCompany && pdfTreatmentCompany && pdfServiceCompany.id === pdfTreatmentCompany.id) {
        parties.push({ role: `Nota do serviço · ${treatmentRole}`, name: pdfServiceCompany.trade_name || pdfServiceCompany.legal_name, details: companyDetails(pdfServiceCompany), logo: pdfServiceCompany.logo_url || null });
      } else {
        if (pdfServiceCompany) parties.push({ role: "Nota do serviço", name: pdfServiceCompany.trade_name || pdfServiceCompany.legal_name, details: companyDetails(pdfServiceCompany), logo: pdfServiceCompany.logo_url || null });
        if (pdfTreatmentCompany) parties.push({ role: treatmentRole, name: pdfTreatmentCompany.trade_name || pdfTreatmentCompany.legal_name, details: companyDetails(pdfTreatmentCompany), logo: pdfTreatmentCompany.logo_url || null });
      }
      const cardGap = 4;
      const cardWidth = (182 - (parties.length - 1) * cardGap) / parties.length;
      const cardHeight = 40;
      for (let i = 0; i < parties.length; i++) {
        const party = parties[i];
        const cardX = 14 + i * (cardWidth + cardGap);
        const cx = cardX + cardWidth / 2;
        doc.setFillColor(247, 250, 246); doc.roundedRect(cardX, companyY, cardWidth, cardHeight, 3, 3, "F");
        doc.setDrawColor(184, 210, 176); doc.roundedRect(cardX, companyY, cardWidth, cardHeight, 3, 3, "S");
        const logoBoxW = Math.min(cardWidth - 10, 32);
        const logoBoxX = cardX + (cardWidth - logoBoxW) / 2;
        doc.setFillColor(255, 255, 255); doc.roundedRect(logoBoxX, companyY + 3, logoBoxW, 13, 2, 2, "F");
        doc.setDrawColor(223, 236, 219); doc.roundedRect(logoBoxX, companyY + 3, logoBoxW, 13, 2, 2, "S");
        await drawLogo(party.logo, logoBoxX + 2, companyY + 4.5, logoBoxW - 4, 10, party.fallback);
        doc.setTextColor(35, 96, 58); doc.setFont("helvetica", "bold"); doc.setFontSize(6.3);
        doc.text(doc.splitTextToSize(party.role.toUpperCase(), cardWidth - 6)[0], cx, companyY + 21, { align: "center" });
        doc.setTextColor(39, 61, 45); doc.setFont("helvetica", "bold"); doc.setFontSize(7.6);
        doc.text(doc.splitTextToSize(party.name, cardWidth - 6)[0], cx, companyY + 26.5, { align: "center" });
        doc.setTextColor(93, 112, 97); doc.setFont("helvetica", "normal"); doc.setFontSize(5.8);
        doc.text(doc.splitTextToSize(party.details || "Dados cadastrais não informados.", cardWidth - 6).slice(0, 3), cx, companyY + 31, { align: "center" });
      }
      let y = companyY + cardHeight + 5;
      const generatorName = pageBranch?.name || pdfClient?.trade_name || pdfClient?.legal_name || `${pdfClientName} (Matriz)`;
      const generatorDetails = pageBranch
        ? [pageBranch.cnpj && `CNPJ: ${pageBranch.cnpj}`, pageBranch.address].filter(Boolean).join(" · ")
        : [
            pdfClient?.cnpj && `CNPJ: ${pdfClient.cnpj}`,
            pdfClient?.address,
            pdfClient?.phone && `Fone: ${pdfClient.phone}`,
            pdfClient?.email,
          ].filter(Boolean).join(" · ");
      doc.setFillColor(244, 248, 242); doc.roundedRect(14, y, 182, 20, 3, 3, "F"); doc.setDrawColor(184, 210, 176); doc.roundedRect(14, y, 182, 20, 3, 3, "S");
      doc.setTextColor(39, 61, 45); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(`Empresa geradora / unidade: ${generatorName}`, 20, y + 7);
      doc.setTextColor(93, 112, 97); doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); doc.text(doc.splitTextToSize(generatorDetails || "Dados cadastrais não informados.", 168).slice(0, 2), 20, y + 13);
      return y + 26;
    };
    const printableBranchIds = branchIds.length ? branchIds : ["__matriz__"];
    for (const [index, id] of printableBranchIds.entries()) {
      const pageBranch = id === "__matriz__" ? null : branch(id);
      let y = await drawHeader(pageBranch, index);
      const branchPlacements = id === "__matriz__" ? pdfPlacements.filter((item) => !item.branch_id) : pdfPlacements.filter((item) => item.branch_id === id);
      const branchMoves = id === "__matriz__" ? confirmedMovements.filter((item) => !item.branch_id) : confirmedMovements.filter((item) => item.branch_id === id);
      const treatmentByResidue = branchMoves.reduce<Record<string, { residueId: string; weight: number; value: number }>>((acc, item) => {
        const rate = Number(item.treatment_rate || 0);
        const key = `${item.waste_residue_id || "sem-residuo"}:${rate}`;
        acc[key] = acc[key] || { residueId: item.waste_residue_id || "sem-residuo", weight: 0, value: 0 };
        acc[key].weight += Number(item.weight_kg || 0);
        acc[key].value += Number(item.weight_kg || 0) * rate;
        return acc;
      }, {});
      const items = [
        ...branchPlacements.map((item) => ({
          name: `Locação · ${equipmentName(equipment.find((entry) => entry.id === item.equipment_id))}`,
          type: "Equipamento",
          quantity: `${number(Number(item.quantity))} un.`,
          unitValue: Number(item.monthly_rental_rate || 0),
          value: Number(item.quantity) * Number(item.monthly_rental_rate || 0),
        })),
        ...branchMoves.filter((item) => Number(item.removed_quantity || 0) > 0).map((item) => ({
          name: `Troca · ${equipmentName(equipment.find((entry) => entry.id === item.equipment_id || ""))}`,
          type: item.replacement_equipment_id ? `Entrada: ${equipmentName(equipment.find((entry) => entry.id === item.replacement_equipment_id || ""))}` : "Troca",
          quantity: `${number(Number(item.removed_quantity))} un.`,
          unitValue: Number(item.exchange_rate || 0),
          value: Number(item.removed_quantity || 0) * Number(item.exchange_rate || 0),
        })),
        ...Object.values(treatmentByResidue).filter((item) => item.weight > 0).map((item) => ({
          name: residues.find((entry) => entry.id === item.residueId)?.name || "Tratamento de resíduos",
          type: "Resíduo",
          quantity: `${number(item.weight)} kg`,
          unitValue: item.weight ? item.value / item.weight : 0,
          value: item.value,
        })),
        ...(index === 0
          ? pdfServices.map((item) => ({
              name: services.find((entry) => entry.id === item.waste_service_id)?.name || "Serviço",
              type: "Serviço terceirizado",
              quantity: `${number(Number(item.quantity || 1))} un.`,
              unitValue: Number(item.unit_amount ?? item.amount ?? 0),
              value: Number(item.amount || 0),
            }))
          : []),
      ];
      const observations = [
        ...branchPlacements.filter((item) => item.observation?.trim()).map((item) => ({
          label: `Locação · ${equipmentName(equipment.find((entry) => entry.id === item.equipment_id))}`,
          text: item.observation!.trim(),
        })),
        ...branchMoves.filter((item) => item.observation?.trim()).map((item) => ({
          label: `Movimentação${item.service_order ? ` · OS ${item.service_order}` : ""}`,
          text: item.observation!.trim(),
        })),
        ...(index === 0 ? pdfServices.filter((item) => item.observation?.trim()).map((item) => ({
          label: `Serviço · ${services.find((entry) => entry.id === item.waste_service_id)?.name || "Serviço"}`,
          text: item.observation!.trim(),
        })) : []),
      ];
      const drawContinuationTitle = (title: string) => {
        doc.setFillColor(244, 248, 242);
        doc.roundedRect(14, 10, 182, 8, 2, 2, "F");
        doc.setTextColor(35, 96, 58);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(title, 20, 15.5);
      };
      const drawItemsHeader = () => {
        doc.setFillColor(35, 96, 58);
        doc.roundedRect(14, y, 182, 9, 2, 2, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.2);
        doc.text("ITEM", 20, y + 6);
        doc.text("TIPO", 74, y + 6);
        doc.text("QUANTIDADE", 108, y + 6);
        doc.text("VALOR UNIT.", 139, y + 6);
        doc.text("TOTAL", 190, y + 6, { align: "right" });
        y += 9;
      };
      drawItemsHeader();
      items.forEach((item, itemIndex) => {
        if (y + 10 > 266) {
          doc.addPage();
          drawContinuationTitle(`CONTINUAÇÃO · BOLETIM ${printableBulletinNumber} · ITENS`);
          y = 23;
          drawItemsHeader();
        }
        if (itemIndex % 2 === 0) {
          doc.setFillColor(247, 250, 246);
          doc.rect(14, y, 182, 10, "F");
        }
        doc.setTextColor(39, 61, 45);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.6);
        doc.text(doc.splitTextToSize(item.name, 50)[0], 20, y + 6.5);
        doc.setTextColor(93, 112, 97);
        doc.text(doc.splitTextToSize(item.type, 28)[0], 74, y + 6.5);
        doc.text(item.quantity, 108, y + 6.5);
        doc.text(money(item.unitValue), 139, y + 6.5);
        doc.setTextColor(39, 61, 45);
        doc.text(money(item.value), 190, y + 6.5, { align: "right" });
        y += 10;
      });
      const branchTotal = items.reduce((sum, item) => sum + item.value, 0);
      if (observations.length) {
        const observationLines = observations.flatMap((item) => doc.splitTextToSize(`${item.label}: ${item.text}`, 168));
        const observationHeight = 8 + observationLines.length * 3.6;
        if (y + observationHeight + 30 > 272) {
          doc.addPage();
          y = 18;
          drawContinuationTitle(`CONTINUAÇÃO · BOLETIM ${printableBulletinNumber} · OBSERVAÇÕES E TOTAL`);
        }
        doc.setFillColor(255, 248, 225);
        doc.setDrawColor(224, 184, 72);
        doc.roundedRect(14, y, 182, observationHeight, 2, 2, "FD");
        doc.setTextColor(126, 86, 10);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.text("OBSERVAÇÕES", 20, y + 5.5);
        doc.setTextColor(79, 67, 36);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.2);
        doc.text(observationLines, 20, y + 10.5, { lineHeightFactor: 1.2 });
        y += observationHeight + 5;
      }
      y += 8;
      doc.setFillColor(232, 244, 226);
      doc.roundedRect(118, y, 78, 18, 3, 3, "F");
      doc.setTextColor(35, 96, 58);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("TOTAL DO DEMONSTRATIVO", 124, y + 7);
      doc.setFontSize(14);
      doc.text(money(branchTotal), 190, y + 14, { align: "right" });
      doc.setDrawColor(153, 190, 125);
      doc.setLineWidth(0.35);
      doc.line(14, 274, 196, 274);
      doc.setTextColor(93, 112, 97);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Jacoby Soluções Ambientais · Gestão responsável de resíduos", 20, 283);
      doc.text("Soluções que respeitam o meio ambiente.", 196, 283, { align: "right" });
    }
    const fileName = `boletim-${printableBulletinNumber.replace("#", "")}-${pdfClientName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`;
    if (options?.download === false) return { fileName, blob: doc.output("blob") };
    doc.save(fileName);
    return { fileName };
  };
  const filteredEmissionPreview = (() => {
    if (!cycle || residueFilterId === "all") return null;
    const existing = (residueEmissionsQuery.data || [])
      .filter((item) => item.cycle_id === cycle.id && item.waste_residue_id === residueFilterId)
      .sort((a, b) => b.sequence - a.sequence)[0];
    if (existing) return existing.display_number;
    const next = Math.max(0, ...(residueEmissionsQuery.data || []).filter((item) => item.cycle_id === cycle.id).map((item) => item.sequence)) + 1;
    return `${String(cycle.bulletin_number).padStart(3, "0")}.${next}`;
  })();
  const generateCurrentPdf = async () => {
    if (residueFilterId === "all") return generatePdf();
    const existing = (residueEmissionsQuery.data || [])
      .filter((item) => item.cycle_id === cycle?.id && item.waste_residue_id === residueFilterId)
      .sort((a, b) => b.sequence - a.sequence)[0];
    return generatePdf({
      targetCycle: cycle!,
      placements: filteredPlacements,
      movements: filteredMovements,
      services: filteredServices,
      includeResidue: residueFilterId,
      bulletinLabel: existing ? `#${existing.display_number}` : undefined,
    });
  };
  const resultCycles = clientCycles
    .filter((item) => !cycleBranchId || branchKey(item.branch_id) === cycleBranchId)
    .filter((item) => (resultStatusFilter === "all" ? true : resultStatusFilter === "closed" ? item.status === "closed" : item.status !== "closed"))
    .slice()
    .sort((a, b) => ((a.status === "closed" ? 1 : 0) - (b.status === "closed" ? 1 : 0)) || (Number(a.bulletin_number || 0) - Number(b.bulletin_number || 0)));
  const selectedResultCycles = resultCycles.filter((item) => selectedBulkCycleIds.includes(item.id));
  const selectedEditableCycles = selectedResultCycles.filter((item) => item.status !== "closed");
  const selectedPrintableCycles = selectedResultCycles.filter((item) => item.status === "closed");
  const toggleBulkCycle = (id: string, checked: boolean) => {
    setSelectedBulkCycleIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  };
  const toggleAllResultCycles = (checked: boolean) => {
    setSelectedBulkCycleIds(checked ? resultCycles.map((item) => item.id) : []);
  };
  const finalizeSelectedCycles = async () => {
    if (!selectedEditableCycles.length) {
      toast.message("Selecione ao menos um boletim em edição para finalizar.");
      return;
    }
    if (!confirm(`Finalizar ${selectedEditableCycles.length} boletim(ns) selecionado(s)? Eles continuarão disponíveis para edição e reimpressão.`)) return;
    setIsFinalizingBulk(true);
    try {
      const { error } = await (supabase.from("billing_v2_cycles" as any) as any)
        .update({ status: "closed", finalized_at: new Date().toISOString() })
        .in("id", selectedEditableCycles.map((item) => item.id));
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["billing-v2-cycles", clientId] }),
        qc.invalidateQueries({ queryKey: ["billing-v2-recent"] }),
      ]);
      toast.success(`${selectedEditableCycles.length} boletim(ns) finalizado(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível finalizar os boletins selecionados.");
    } finally {
      setIsFinalizingBulk(false);
    }
  };
  const generateSelectedPdfs = async () => {
    if (!selectedPrintableCycles.length) {
      toast.message("Selecione ao menos um boletim finalizado para baixar o PDF.");
      return;
    }
    setIsGeneratingBulk(true);
    let generated = 0;
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const targetCycle of selectedPrintableCycles) {
        const [placementsResult, movementsResult, servicesResult] = await Promise.all([
          (supabase.from("billing_v2_placements" as any) as any).select("*").eq("cycle_id", targetCycle.id).order("started_on"),
          (supabase.from("billing_v2_movements" as any) as any).select("*").eq("cycle_id", targetCycle.id).order("occurred_on"),
          (supabase.from("billing_v2_cycle_services" as any) as any).select("*").eq("cycle_id", targetCycle.id),
        ]);
        const error = placementsResult.error || movementsResult.error || servicesResult.error;
        if (error) throw error;
        const pdf = await generatePdf({
          targetCycle,
          placements: (placementsResult.data || []) as Placement[],
          movements: (movementsResult.data || []) as Movement[],
          services: (servicesResult.data || []) as CycleService[],
          includeResidue: "all",
          download: false,
        });
        if (pdf?.blob) {
          zip.file(pdf.fileName, pdf.blob);
          generated += 1;
        }
      }
      if (!generated) throw new Error("Não foi possível preparar os PDFs dos boletins selecionados.");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `boletins-selecionados-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
      toast.success(`${generated} PDF(s) reunido(s) em um único arquivo ZIP.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar os PDFs selecionados.");
    } finally {
      setIsGeneratingBulk(false);
    }
  };
  const viewBulletin = async (targetCycle: Cycle, residueId?: string, label?: string) => {
    try {
      const [placementsResult, movementsResult, servicesResult] = await Promise.all([
        (supabase.from("billing_v2_placements" as any) as any).select("*").eq("cycle_id", targetCycle.id).order("started_on"),
        (supabase.from("billing_v2_movements" as any) as any).select("*").eq("cycle_id", targetCycle.id).order("occurred_on"),
        (supabase.from("billing_v2_cycle_services" as any) as any).select("*").eq("cycle_id", targetCycle.id),
      ]);
      const fetchError = placementsResult.error || movementsResult.error || servicesResult.error;
      if (fetchError) throw fetchError;
      const scoped = Boolean(residueId && residueId !== "all");
      const pdf = await generatePdf({
        targetCycle,
        placements: scoped ? ((placementsResult.data || []) as Placement[]).filter((item) => item.waste_residue_id === residueId) : ((placementsResult.data || []) as Placement[]),
        movements: scoped ? ((movementsResult.data || []) as Movement[]).filter((item) => item.waste_residue_id === residueId) : ((movementsResult.data || []) as Movement[]),
        services: scoped ? [] : ((servicesResult.data || []) as CycleService[]),
        includeResidue: residueId || "all",
        bulletinLabel: label,
        download: false,
      });
      if (!pdf?.blob) throw new Error("Não foi possível gerar o PDF deste boletim.");
      const url = URL.createObjectURL(pdf.blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o boletim.");
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
      {!cycleId && (
        <header>
          <p className="text-sm font-medium text-primary">Portal do Cliente</p>
          <h1 className="text-2xl font-bold">Faturamento</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada boletim é um ciclo independente: registre locação, movimentações e destinação no período que fizer sentido e finalize quando estiver concluído.
          </p>
        </header>
      )}
      {!cycleId && (
        <Tabs value={homeTab} onValueChange={(value) => setHomeTab(value as "boletins" | "pendentes")}>
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-muted/50 p-1">
            <TabsTrigger value="boletins" className="rounded-lg data-[state=active]:shadow-sm">Boletins</TabsTrigger>
            <TabsTrigger value="pendentes" className="rounded-lg data-[state=active]:shadow-sm">
              Movimentações pendentes
              {pendingMovementGroups.length > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{pendingMovementGroups.length}</span>}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {!cycleId && homeTab === "boletins" && (
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="Cliente">
            <Select
              value={clientId}
              onValueChange={(value) => {
                setClientId(value);
                setCycleId("");
                setCycleBranchId("");
                setResidueFilterId("all");
              }}
            >
              <SelectTrigger className="min-w-0 [&>span]:min-w-0">
                <SelectValue placeholder="Selecionar cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Filial ou pátio do boletim">
            {clientHasNoBranches ? <Input value="Matriz — sem filial/pátio cadastrada" disabled /> : <Select value={cycleBranchId} onValueChange={(value) => { setCycleBranchId(value); }}>
              <SelectTrigger className="min-w-0 [&>span]:min-w-0"><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={BRANCH_MATRIZ}>Matriz (sem filial/pátio)</SelectItem>{branches.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>}
          </Field>
          <Button
            size="lg"
            className="w-full md:w-auto"
            disabled={!clientId || (!clientHasNoBranches && !cycleBranchId)}
            onClick={() => setCreateOpen(true)}
          >
            <FilePlus2 className="mr-2 h-4 w-4" />
            Criar boletim
          </Button>
        </div>
      </Card>
      )}
      {!cycleId ? homeTab === "boletins" ? (
        <div className="flex flex-col gap-6">
          <Card className="order-2 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-semibold">Boletins recentes</h2>
                <p className="mt-1 text-sm text-muted-foreground">Abra rapidamente um boletim de qualquer cliente.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-60"><Input value={bmSearch} onChange={(event) => setBmSearch(event.target.value)} placeholder="Buscar BM por número (ex: 18)" className="h-9" /></div>
                {bmSearch ? <Button variant="ghost" size="sm" onClick={() => setBmSearch("")}>Limpar</Button> : <span className="whitespace-nowrap text-xs text-muted-foreground">Últimos 8 registros</span>}
              </div>
            </div>
            {!bmSearching && (
            <div className="mt-4 inline-flex rounded-lg border bg-muted/40 p-0.5 text-sm">
              {([["all", "Todos"], ["draft", "Em edição"], ["closed", "Finalizados"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setResultStatusFilter(value)}
                  className={`rounded-md px-3 py-1.5 font-medium transition-colors ${resultStatusFilter === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            )}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Número</th><th className="p-2">Cliente</th><th className="p-2">Filial/pátio</th><th className="p-2">Período</th><th className="p-2">Situação</th><th className="p-2" /></tr></thead><tbody>
                {recentDisplayCycles.length ? recentDisplayCycles.map((item) => <tr key={item.id} className="border-b"><td className="p-2 font-semibold text-primary">{bulletinNumber(item.bulletin_number)}</td><td className="p-2 font-medium"><span className="block max-w-52 truncate" title={clients.find((client) => client.id === item.client_id)?.name || "Cliente"}>{clients.find((client) => client.id === item.client_id)?.name || "Cliente"}</span></td><td className="p-2"><span className="block max-w-52 truncate" title={branchName(item.branch_id)}>{branchName(item.branch_id)}</span></td><td className="p-2">{new Date(`${item.period_start}T12:00:00`).toLocaleDateString("pt-BR")} a {new Date(`${item.period_end}T12:00:00`).toLocaleDateString("pt-BR")}</td><td className="p-2">{item.status === "closed" ? "Finalizado" : "Em edição"}</td><td className="p-2 text-right"><Button variant="outline" size="sm" onClick={() => openRecentCycle(item)}><Pencil className="mr-2 h-3.5 w-3.5" />Abrir</Button></td></tr>) : <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{bmSearching ? "Nenhum boletim encontrado com esse número." : "Nenhum boletim criado ainda."}</td></tr>}
              </tbody></table>
            </div>
          </Card>
        <Card className="order-1 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-semibold" title={`${clientName}${cycleBranchId === BRANCH_MATRIZ ? " · Matriz (sem filial/pátio)" : cycleBranchId ? ` · ${branch(cycleBranchId)?.name || "filial/pátio"}` : ""}`}>Resultado da busca · {clientName}{cycleBranchId === BRANCH_MATRIZ ? " · Matriz (sem filial/pátio)" : cycleBranchId ? ` · ${branch(cycleBranchId)?.name || "filial/pátio"}` : ""}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Boletins encontrados para o cliente e pátio selecionados.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedResultCycles.length} selecionado(s)</span>
              <Button variant="outline" size="sm" onClick={() => void finalizeSelectedCycles()} disabled={!selectedEditableCycles.length || isFinalizingBulk}>
                <CheckCircle2 className="mr-2 h-4 w-4" />{isFinalizingBulk ? "Finalizando…" : "Finalizar selecionados"}
              </Button>
              <Button size="sm" onClick={() => void generateSelectedPdfs()} disabled={!selectedPrintableCycles.length || isGeneratingBulk}>
                <Download className="mr-2 h-4 w-4" />{isGeneratingBulk ? "Gerando PDFs…" : "Baixar PDFs selecionados (.zip)"}
              </Button>
            </div>
          </div>
          <div className="mt-4 inline-flex rounded-lg border bg-muted/40 p-0.5 text-sm">
            {([["all", "Todos"], ["draft", "Em edição"], ["closed", "Finalizados"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setResultStatusFilter(value)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${resultStatusFilter === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="w-10 p-2"><Checkbox aria-label="Selecionar todos os boletins encontrados" checked={resultCycles.length > 0 && resultCycles.every((item) => selectedBulkCycleIds.includes(item.id))} onCheckedChange={(checked) => toggleAllResultCycles(Boolean(checked))} /></th><th className="p-2">Número</th><th className="p-2">Filial/pátio</th><th className="p-2">Período</th><th className="p-2">Situação</th><th className="p-2">Finalizado em</th><th className="p-2" /></tr></thead><tbody>
              {resultCycles.length ? resultCycles.map((item) => <tr key={item.id} className="border-b"><td className="p-2"><Checkbox aria-label={`Selecionar boletim ${bulletinNumber(item.bulletin_number)}`} checked={selectedBulkCycleIds.includes(item.id)} onCheckedChange={(checked) => toggleBulkCycle(item.id, Boolean(checked))} /></td><td className="p-2 font-semibold">{bulletinNumber(item.bulletin_number)}</td><td className="p-2 font-medium"><span className="block max-w-72 truncate" title={branchName(item.branch_id)}>{branchName(item.branch_id)}</span></td><td className="p-2">{new Date(`${item.period_start}T12:00:00`).toLocaleDateString("pt-BR")} a {new Date(`${item.period_end}T12:00:00`).toLocaleDateString("pt-BR")}</td><td className="p-2">{item.status === "closed" ? "Finalizado" : "Em edição"}</td><td className="p-2">{item.finalized_at ? new Date(item.finalized_at).toLocaleDateString("pt-BR") : "—"}</td><td className="p-2 text-right"><div className="flex justify-end gap-1"><Button variant="outline" size="sm" onClick={() => { setCycleId(item.id); setCycleBranchId(branchKey(item.branch_id)); setTab("locacoes"); }}><Pencil className="mr-2 h-3.5 w-3.5" />Editar</Button><Button variant="ghost" size="icon" aria-label={`Excluir boletim ${bulletinNumber(item.bulletin_number)}`} onClick={() => void deleteCycle(item)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></td></tr>) : <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum boletim criado para esta filial/pátio.</td></tr>}
            </tbody></table>
          </div>
        </Card>
        </div>
      ) : (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Movimentações pendentes de gerar valor</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Estes lançamentos estão marcados como “Não gera valor” e ainda não entram na soma do BM. Somente BMs em edição aparecem aqui. Abra a movimentação para conferir os dados e confirmar quando estiver correto.
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
              {pendingMovementGroups.length} pendente{pendingMovementGroups.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1260px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">BM</th>
                  <th className="p-2">Data</th>
                  <th className="p-2">Cliente</th>
                  <th className="p-2">Matriz/filial/pátio</th>
                  <th className="p-2">OS / MTR</th>
                  <th className="p-2">Resíduo</th>
                  <th className="p-2">Movimentação</th>
                  <th className="p-2">Peso</th>
                  <th className="p-2">Observação</th>
                  <th className="p-2">Situação do BM</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {pendingMovementsQuery.isLoading ? (
                  <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Carregando movimentações pendentes…</td></tr>
                ) : pendingMovementsQuery.isError ? (
                  <tr><td colSpan={11} className="p-8 text-center text-destructive">Não foi possível carregar as movimentações pendentes.</td></tr>
                ) : pendingMovementGroups.length ? pendingMovementGroups.map(({ key, rows }) => {
                  const item = rows[0];
                  const placed = rows.reduce((sum, row) => sum + Number(row.placed_quantity || 0), 0);
                  const removed = rows.reduce((sum, row) => sum + Number(row.removed_quantity || 0), 0);
                  const weight = rows.reduce((sum, row) => sum + Number(row.weight_kg || 0), 0);
                  const observations = Array.from(new Set(rows.map((row) => row.observation?.trim()).filter(Boolean))).join(" · ");
                  return (
                    <tr key={key} className="border-b align-top">
                      <td className="p-2 font-semibold text-primary">{bulletinNumber(item.bulletin_number)}</td>
                      <td className="p-2 whitespace-nowrap">{new Date(`${item.occurred_on}T12:00:00`).toLocaleDateString("pt-BR")}</td>
                      <td className="p-2 font-medium"><span className="block max-w-56 truncate" title={item.client_name}>{item.client_name}</span></td>
                      <td className="p-2"><span className="block max-w-56" title={item.branch_name}>{item.branch_name}</span></td>
                      <td className="p-2"><div>OS: {item.service_order || "—"}</div><div className="text-xs text-muted-foreground">MTR: {item.mtr_number || "—"}</div></td>
                      <td className="p-2">{item.residue_name}</td>
                      <td className="p-2 whitespace-nowrap">
                        {number(placed)} colocada(s) · {number(removed)} removida(s)
                        {rows.length > 1 && <div className="text-xs text-muted-foreground">{rows.length} equipamentos agrupados</div>}
                      </td>
                      <td className="p-2 whitespace-nowrap">{number(weight)} kg</td>
                      <td className="max-w-64 p-2" title={observations || undefined}>{observations || "—"}</td>
                      <td className="p-2">
                        <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${item.cycle_status === "closed" ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-800"}`}>
                          {item.cycle_status === "closed" ? "Finalizado" : "Em edição"}
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        <Button variant="outline" size="sm" onClick={() => openPendingMovement(item)}>
                          Abrir movimentação
                        </Button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Nenhuma movimentação pendente. Todos os lançamentos estão gerando valor.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <>
          <Card className="sticky top-2 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-primary/15 p-3 shadow-elegant supports-[backdrop-filter]:bg-card/80 supports-[backdrop-filter]:backdrop-blur">
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => { setCycleId(""); setFocusedMovementId(""); }}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {homeTab === "pendentes" ? "Voltar às pendências" : "Voltar aos boletins"}
            </Button>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="text-lg font-bold tracking-tight text-primary">{filteredEmissionPreview ? `#${filteredEmissionPreview}` : bulletinNumber(cycle?.bulletin_number)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cycle?.status === "closed" ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800"}`}>
                {cycle?.status === "closed" ? "Finalizado" : "Em edição"}
              </span>
              <span className="min-w-0 truncate text-sm text-muted-foreground" title={`${clientName} · ${cycle?.branch_id ? (branch(cycle.branch_id)?.name || "Boletim legado") : "Matriz (sem filial/pátio)"}`}>
                <span className="font-medium text-foreground">{clientName}</span>
                {" · "}{cycle?.branch_id ? (branch(cycle.branch_id)?.name || "Boletim legado") : "Matriz (sem filial/pátio)"}
                {" · "}{cycle ? `${new Date(`${cycle.period_start}T12:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${cycle.period_end}T12:00:00`).toLocaleDateString("pt-BR")}` : "—"}
              </span>
            </div>
          </Card>
          <Tabs
            value={tab === "historico" ? "locacoes" : tab}
            onValueChange={setTab}
          >
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1">
              <TabsTrigger value="locacoes" className="rounded-lg data-[state=active]:shadow-sm">Locação</TabsTrigger>
              <TabsTrigger value="movimentos" className="rounded-lg data-[state=active]:shadow-sm">Movimentações</TabsTrigger>
              <TabsTrigger value="boletim" className="rounded-lg data-[state=active]:shadow-sm">Boletim</TabsTrigger>
              <TabsTrigger value="emitidos" className="rounded-lg data-[state=active]:shadow-sm">Emissões</TabsTrigger>
            </TabsList>
            <TabsContent value="historico" className="space-y-4"><Card className="p-5"><h2 className="font-semibold">Boletins do cliente</h2><p className="mt-1 text-sm text-muted-foreground">Cada boletim possui número próprio e pode ser reaberto para edição.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Número</th><th className="p-2">Período</th><th className="p-2">Situação</th><th className="p-2" /></tr></thead><tbody>{clientCycles.map((item) => <tr key={item.id} className="border-b"><td className="p-2 font-semibold">{bulletinNumber(item.bulletin_number)}</td><td className="p-2">{new Date(`${item.period_start}T12:00:00`).toLocaleDateString("pt-BR")} a {new Date(`${item.period_end}T12:00:00`).toLocaleDateString("pt-BR")}</td><td className="p-2">{item.status === "closed" ? "Finalizado" : "Em edição"}</td><td className="p-2 text-right"><div className="flex justify-end gap-1"><Button size="sm" variant={item.id === cycleId ? "secondary" : "outline"} onClick={() => { setCycleId(item.id); setCycleBranchId(branchKey(item.branch_id)); setResidueFilterId("all"); setTab("locacoes"); }}>Abrir</Button><Button variant="ghost" size="icon" aria-label={`Excluir boletim ${bulletinNumber(item.bulletin_number)}`} onClick={() => void deleteCycle(item)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></td></tr>)}</tbody></table></div></Card></TabsContent>
            <TabsContent value="emitidos" className="space-y-4"><Card className="p-4 sm:p-5"><h2 className="font-semibold">Boletins emitidos</h2><div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground"><p className="font-medium">Publicação no Portal do Cliente + envio por e-mail</p><p className="mt-1 text-muted-foreground">Use as ações separadamente: visualize o BM, publique somente no Portal do Cliente ou confira os destinatários e envie por e-mail com uma mensagem.</p></div><p className="mt-3 text-sm text-muted-foreground">Emissões filtradas por resíduo recebem sufixo próprio e podem ser enviadas separadamente.</p>
              <div className="mt-4 grid gap-3 2xl:hidden">
                {emittedGroups.length ? emittedGroups.map((group) => {
                  const expanded = expandedBMs.includes(group.cycleId);
                  const hasEmissions = group.emissions.length > 0;
                  const headerNumber = group.parent ? bulletinNumber(group.parent.bulletin_number) : `#${String(group.major).padStart(3, "0")}`;
                  const closedParent = Boolean(group.parent && group.parent.status === "closed");
                  const emailStatus = emailDeliverySummary(group.cycleId);
                  return <div key={group.cycleId} className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-primary">{headerNumber}</span>
                        {hasEmissions && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{group.emissions.length} recorte(s)</span>}
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${closedParent ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800"}`}>{closedParent ? "Finalizado" : "Em edição"}</span>
                    </div>
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div><p className="text-xs font-medium text-muted-foreground">Filial/pátio</p><p className="mt-0.5 font-medium">{group.parent ? branchName(group.parent.branch_id) : "—"}</p></div>
                      <div><p className="text-xs font-medium text-muted-foreground">Período</p><p className="mt-0.5">{group.parent ? `${new Date(`${group.parent.period_start}T12:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${group.parent.period_end}T12:00:00`).toLocaleDateString("pt-BR")}` : "—"}</p></div>
                      <div><p className="text-xs font-medium text-muted-foreground">Finalizado em</p><p className="mt-0.5">{closedParent && group.parent?.finalized_at ? new Date(group.parent.finalized_at).toLocaleDateString("pt-BR") : group.parent ? "Em edição" : "—"}</p></div>
                      <div><p className="text-xs font-medium text-muted-foreground">Status do e-mail</p><p className="mt-0.5" title={emailStatus.title}>{group.parent?.client_portal_visible ? emailStatus.label : "Aguardando publicação"}</p></div>
                    </div>
                    {group.parent ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      <Button variant="outline" size="sm" className="w-full" onClick={() => void viewBulletin(group.parent!, "all")}><Eye className="mr-2 h-4 w-4" />Visualizar BM</Button>
                      {closedParent ? <>
                        <Button variant="outline" size="sm" className="w-full" disabled={setCyclePortalVisibility.isPending} onClick={() => { if (!group.parent!.client_portal_visible || window.confirm(`Remover o ${headerNumber} do Portal do Cliente?`)) setCyclePortalVisibility.mutate({ id: group.parent!.id, visible: !group.parent!.client_portal_visible }); }}>{group.parent.client_portal_visible ? "Remover do portal" : "Publicar somente no portal"}</Button>
                        <Button size="sm" className="w-full" disabled={setCyclePortalVisibility.isPending} onClick={() => void openPublishConfirmation({ cycle: group.parent!, displayNumber: headerNumber, residueId: "all" })}><Mail className="mr-2 h-4 w-4" />Conferir e enviar por e-mail</Button>
                      </> : <p className="self-center text-sm text-muted-foreground sm:col-span-1 lg:col-span-2">Finalize para publicar ou enviar.</p>}
                    </div> : null}
                    {hasEmissions && <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setExpandedBMs((current) => current.includes(group.cycleId) ? current.filter((id) => id !== group.cycleId) : [...current, group.cycleId])}>{expanded ? <ChevronDown className="mr-2 h-4 w-4" /> : <ChevronRight className="mr-2 h-4 w-4" />}{expanded ? "Ocultar recortes" : "Ver recortes por resíduo"}</Button>}
                    {expanded && <div className="mt-3 grid gap-3">{group.emissions.map((em) => { const residueEmailStatus = emailDeliverySummary(group.cycleId, em.id); return <div key={em.id} className="rounded-lg border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">#{em.display_number}</span><span className="text-xs text-muted-foreground" title={residueEmailStatus.title}>{em.client_portal_visible ? residueEmailStatus.label : "Aguardando publicação"}</span></div>
                      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2"><div><span className="text-xs text-muted-foreground">Resíduo</span><p>{residues.find((residue) => residue.id === em.waste_residue_id)?.name || "Resíduo"}</p></div><div><span className="text-xs text-muted-foreground">Finalizado em</span><p>{new Date(em.finalized_at).toLocaleDateString("pt-BR")}</p></div></div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]"><Button variant="outline" size="sm" className="w-full" disabled={!group.parent} onClick={() => { if (group.parent) void viewBulletin(group.parent, em.waste_residue_id, `#${em.display_number}`); }}><Eye className="mr-2 h-4 w-4" />Visualizar BM</Button><Button variant="outline" size="sm" className="w-full" disabled={setResidueEmissionPortalVisibility.isPending} onClick={() => { if (!em.client_portal_visible || window.confirm(`Remover a emissão #${em.display_number} do Portal do Cliente?`)) setResidueEmissionPortalVisibility.mutate({ id: em.id, visible: !em.client_portal_visible }); }}>{em.client_portal_visible ? "Remover do portal" : "Publicar somente no portal"}</Button><Button size="sm" className="w-full" disabled={setResidueEmissionPortalVisibility.isPending} onClick={() => void openPublishConfirmation({ cycle: group.parent!, residueEmission: em, displayNumber: `#${em.display_number}`, residueId: em.waste_residue_id })}><Mail className="mr-2 h-4 w-4" />Conferir e enviar</Button><Button variant="ghost" size="icon" className="mx-auto h-9 w-9" title={`Excluir emissão #${em.display_number}`} aria-label={`Excluir emissão #${em.display_number}`} disabled={deleteResidueEmission.isPending} onClick={() => { if (window.confirm(`Excluir a emissão #${em.display_number}? Essa ação remove apenas este recorte por resíduo.`)) deleteResidueEmission.mutate({ id: em.id, cycleId: em.cycle_id }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                    </div>; })}</div>}
                  </div>;
                }) : <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Finalize um boletim ou uma emissão por resíduo para disponibilizá-lo no portal.</div>}
              </div>
              <div className="mt-4 hidden overflow-x-auto 2xl:block"><table className="w-full min-w-[1320px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Número</th><th className="p-2">Filial/pátio</th><th className="p-2">Período / resíduo</th><th className="p-2">Finalizado em</th><th className="p-2">Status do e-mail</th><th className="p-2 text-right">Ações</th></tr></thead><tbody>{emittedGroups.length ? emittedGroups.map((group) => { const expanded = expandedBMs.includes(group.cycleId); const hasEmissions = group.emissions.length > 0; const headerNumber = group.parent ? bulletinNumber(group.parent.bulletin_number) : `#${String(group.major).padStart(3, "0")}`; const closedParent = Boolean(group.parent && group.parent.status === "closed"); const emailStatus = emailDeliverySummary(group.cycleId); return <Fragment key={group.cycleId}><tr className="border-b"><td className="p-2 font-semibold"><div className="flex items-center gap-1.5">{hasEmissions ? <button type="button" aria-label={expanded ? "Recolher recortes" : "Expandir recortes"} onClick={() => setExpandedBMs((current) => current.includes(group.cycleId) ? current.filter((id) => id !== group.cycleId) : [...current, group.cycleId])} className="text-muted-foreground transition-colors hover:text-primary">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button> : <span className="inline-block w-4" />}{headerNumber}{hasEmissions ? <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{group.emissions.length} recorte(s)</span> : null}</div></td><td className="p-2">{group.parent ? branchName(group.parent.branch_id) : "—"}</td><td className="p-2">{group.parent ? `${new Date(`${group.parent.period_start}T12:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${group.parent.period_end}T12:00:00`).toLocaleDateString("pt-BR")}` : "—"}</td><td className="p-2">{closedParent && group.parent?.finalized_at ? new Date(group.parent.finalized_at).toLocaleDateString("pt-BR") : group.parent ? "Em edição" : "—"}</td><td className="p-2 text-xs" title={emailStatus.title}>{group.parent?.client_portal_visible ? emailStatus.label : "Aguardando publicação"}</td><td className="p-2 text-right">{group.parent ? <div className="inline-flex items-center justify-end gap-2"><Button variant="outline" size="sm" onClick={() => void viewBulletin(group.parent!, "all")}><Eye className="mr-2 h-4 w-4" />Visualizar BM</Button>{closedParent ? <><Button variant="outline" size="sm" disabled={setCyclePortalVisibility.isPending} onClick={() => { if (!group.parent!.client_portal_visible || window.confirm(`Remover o ${headerNumber} do Portal do Cliente?`)) setCyclePortalVisibility.mutate({ id: group.parent!.id, visible: !group.parent!.client_portal_visible }); }}>{group.parent.client_portal_visible ? "Remover do portal" : "Publicar somente no portal"}</Button><Button size="sm" disabled={setCyclePortalVisibility.isPending} onClick={() => void openPublishConfirmation({ cycle: group.parent!, displayNumber: headerNumber, residueId: "all" })}><Mail className="mr-2 h-4 w-4" />Conferir e enviar por e-mail</Button></> : <span className="text-sm text-muted-foreground">Finalize para publicar ou enviar</span>}</div> : <span className="text-sm text-muted-foreground">—</span>}</td></tr>{expanded ? group.emissions.map((em) => { const residueEmailStatus = emailDeliverySummary(group.cycleId, em.id); return <tr key={em.id} className="border-b bg-muted/20"><td className="p-2 pl-8 font-semibold">#{em.display_number}</td><td className="p-2">{group.parent ? branchName(group.parent.branch_id) : "—"}</td><td className="p-2">{residues.find((residue) => residue.id === em.waste_residue_id)?.name || "Resíduo"}</td><td className="p-2">{new Date(em.finalized_at).toLocaleDateString("pt-BR")}</td><td className="p-2 text-xs" title={residueEmailStatus.title}>{em.client_portal_visible ? residueEmailStatus.label : "Aguardando publicação"}</td><td className="p-2 text-right"><div className="inline-flex items-center justify-end gap-2"><Button variant="outline" size="sm" disabled={!group.parent} onClick={() => { if (group.parent) void viewBulletin(group.parent, em.waste_residue_id, `#${em.display_number}`); }}><Eye className="mr-2 h-4 w-4" />Visualizar BM</Button><Button variant="outline" size="sm" disabled={setResidueEmissionPortalVisibility.isPending} onClick={() => { if (!em.client_portal_visible || window.confirm(`Remover a emissão #${em.display_number} do Portal do Cliente?`)) setResidueEmissionPortalVisibility.mutate({ id: em.id, visible: !em.client_portal_visible }); }}>{em.client_portal_visible ? "Remover do portal" : "Publicar somente no portal"}</Button><Button size="sm" disabled={setResidueEmissionPortalVisibility.isPending} onClick={() => void openPublishConfirmation({ cycle: group.parent!, residueEmission: em, displayNumber: `#${em.display_number}`, residueId: em.waste_residue_id })}><Mail className="mr-2 h-4 w-4" />Conferir e enviar por e-mail</Button><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title={`Excluir emissão #${em.display_number}`} aria-label={`Excluir emissão #${em.display_number}`} disabled={deleteResidueEmission.isPending} onClick={() => { if (window.confirm(`Excluir a emissão #${em.display_number}? Essa ação remove apenas este recorte por resíduo.`)) deleteResidueEmission.mutate({ id: em.id, cycleId: em.cycle_id }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></td></tr>; }) : null}</Fragment>; }) : <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Finalize um boletim ou uma emissão por resíduo para disponibilizá-lo no portal.</td></tr>}</tbody></table></div></Card></TabsContent>
            <TabsContent value="locacoes" className="grid gap-4 xl:grid-cols-[minmax(360px,440px)_1fr] xl:items-start">
              <Card className="p-5 xl:sticky xl:top-40">
                <h2 className="font-semibold">Nova colocação em locação</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  O valor de locação é definido no cadastro de cada equipamento deste pátio.
                </p>
                <div className="mt-4 grid gap-3">
                  <Field label="Filial ou pátio">
                    <Select
                      value={lockedBranchId || placementForm.branchId}
                      disabled={Boolean(lockedBranchId)}
                      onValueChange={(value) => {
                        setPlacementForm({ ...placementForm, branchId: value, equipmentId: "" });
                        setRentalBranchFilter(value);
                      }}
                    >
                      <SelectTrigger className="min-w-0 [&>span]:truncate">
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={BRANCH_MATRIZ}>Matriz (sem filial/pátio)</SelectItem>
                        {branches.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Equipamento">
                    <Select
                      value={placementForm.equipmentId}
                      disabled={!placementForm.branchId}
                      onValueChange={(value) =>
                        setPlacementForm({ ...placementForm, equipmentId: value })
                      }
                    >
                      <SelectTrigger className="min-w-0 [&>span]:truncate">
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {equipment
                          .filter((item) => branchKey(item.branch_id) === placementForm.branchId)
                          .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {equipmentName(item)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="self-end pb-2 text-sm text-muted-foreground">
                    Valor do equipamento: <strong className="text-foreground">{money(Number(equipment.find((item) => item.id === placementForm.equipmentId)?.monthly_rental_rate || 0))}</strong>
                  </div>
                  <Field label="Resíduo">
                    <Select
                      value={placementForm.residueId}
                      onValueChange={(value) =>
                        setPlacementForm({ ...placementForm, residueId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Opcional" />
                      </SelectTrigger>
                      <SelectContent>
                        {residuesForBranch(lockedBranchId || placementForm.branchId).map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Início">
                    <Input
                      type="date"
                      value={placementForm.date}
                      onChange={(event) =>
                        setPlacementForm({ ...placementForm, date: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Quantidade">
                    <Input
                      type="number"
                      min="1"
                      value={placementForm.quantity}
                      onChange={(event) =>
                        setPlacementForm({ ...placementForm, quantity: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Observação">
                    <Input
                      value={placementForm.observation}
                      onChange={(event) =>
                        setPlacementForm({ ...placementForm, observation: event.target.value })
                      }
                    />
                  </Field>
                  <Button className="mt-1 w-full" onClick={() => addPlacement.mutate()}>
                    Registrar locação
                  </Button>
                </div>
              </Card>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {rentalBranchFilter
                    ? `Equipamentos em locação · ${branches.find((item) => item.id === rentalBranchFilter)?.name || "Pátio selecionado"}`
                    : "Equipamentos em locação · todos os pátios"}
                </p>
                <PlacementTable
                rows={placementsForSelectedBranch}
                branches={branches}
                equipment={equipment}
                residues={residues}
                onDelete={(id) => void remove("billing_v2_placements", id)}
                onSave={updatePlacement}
                />
              </div>
            </TabsContent>
            <TabsContent value="movimentos" className="space-y-4">
              <Card className="p-4">
                <h2 className="font-semibold">Movimentações do boletim</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escolha o pátio para ver somente os equipamentos atualmente em locação nele.
                  Em uma troca, selecione a mesma quantidade de equipamentos no local e colocados.
                  O peso informado é dividido automaticamente entre cada troca.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <Field label="Filial ou pátio">
                    <Select
                      value={lockedBranchId || movementForm.branchId}
                      disabled={Boolean(lockedBranchId)}
                      onValueChange={(value) => {
                        setMovementForm({ ...movementForm, branchId: value });
                        setMovementBranchFilter(value);
                        setOutgoingPlacementIds([]);
                        setIncomingEquipmentIds([]);
                      }}
                    >
                      <SelectTrigger className="min-w-0 [&>span]:truncate">
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={BRANCH_MATRIZ}>Matriz (sem filial/pátio)</SelectItem>
                        {branches.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Resíduo">
                    <Select
                      value={movementForm.residueId}
                      onValueChange={(value) =>
                        setMovementForm({ ...movementForm, residueId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Opcional" />
                      </SelectTrigger>
                      <SelectContent>
                        {residuesForBranch(lockedBranchId || movementForm.branchId).map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Data">
                    <Input
                      type="date"
                      value={movementForm.date}
                      onChange={(event) =>
                        setMovementForm({ ...movementForm, date: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Ordem de serviço">
                    <Input
                      value={movementForm.order}
                      onChange={(event) =>
                        setMovementForm({ ...movementForm, order: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="MTR">
                    <Input
                      value={movementForm.mtr}
                      onChange={(event) =>
                        setMovementForm({ ...movementForm, mtr: event.target.value })
                      }
                      placeholder="Número do MTR"
                    />
                  </Field>
                  <Field label="Peso (kg)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={movementForm.weight}
                      onChange={(event) =>
                        setMovementForm({ ...movementForm, weight: event.target.value })
                      }
                    />
                  </Field>
                  <div className="md:col-span-4 grid gap-3 md:grid-cols-2">
                    <Field label="Retirada">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" disabled={!movementForm.branchId || !activePlacementsAtBranch.length} className="w-full justify-between font-normal">
                            <span className="truncate">
                              {!movementForm.branchId
                                ? "Selecione o pátio primeiro"
                                : !activePlacementsAtBranch.length
                                  ? "Nenhum equipamento em locação"
                                  : outgoingPlacementIds.length
                                    ? `${outgoingPlacementIds.length} equipamento(s) selecionado(s)`
                                    : "Selecionar equipamentos"}
                            </span>
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1">
                          <div className="max-h-72 space-y-0.5 overflow-y-auto">
                            {activePlacementsAtBranch.map((placement) => {
                              const item = equipment.find((entry) => entry.id === placement.equipment_id);
                              const checked = outgoingPlacementIds.includes(placement.id);
                              return (
                                <label key={placement.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(value) =>
                                      setOutgoingPlacementIds((current) =>
                                        value ? [...current, placement.id] : current.filter((id) => id !== placement.id),
                                      )
                                    }
                                  />
                                  <span>{equipmentName(item)} {Number(placement.quantity) > 1 ? `(${number(Number(placement.quantity))} unidades)` : ""}</span>
                                </label>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </Field>
                    <Field label="Colocação">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" disabled={!movementForm.branchId || !incomingEquipmentBase.length} className="w-full justify-between font-normal">
                            <span className="truncate">
                              {!movementForm.branchId
                                ? "Selecione o pátio primeiro"
                                : !incomingEquipmentBase.length
                                  ? "Nenhum equipamento disponível"
                                  : incomingEquipmentIds.length
                                    ? `${incomingEquipmentIds.length} equipamento(s) selecionado(s)`
                                    : "Selecionar equipamentos"}
                            </span>
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1">
                          <div className="max-h-72 space-y-0.5 overflow-y-auto">
                            {incomingEquipmentBase.map((item) => {
                              const checked = incomingEquipmentIds.includes(item.id);
                              return (
                                <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(value) =>
                                      setIncomingEquipmentIds((current) =>
                                        value ? [...current, item.id] : current.filter((id) => id !== item.id),
                                      )
                                    }
                                  />
                                  <span>{equipmentName(item)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </Field>
                  </div>
                  {(outgoingPlacementIds.length > 0 || incomingEquipmentIds.length > 0) && (
                    <p className="md:col-span-4 text-sm text-muted-foreground">
                      {incomingEquipmentIds.length
                        ? `Troca: ${number(outgoingQuantity)} equipamento(s) retirado(s) por ${incomingEquipmentIds.length} equipamento(s) colocado(s).`
                        : `Retirada: ${number(outgoingQuantity)} equipamento(s) sairá(ão) da locação neste boletim.`}
                      {outgoingQuantity > 0 && ` Peso por equipamento: ${number(Number(movementForm.weight || 0) / outgoingQuantity)} kg.`}
                    </p>
                  )}
                  {outgoingPlacementIds.length > 0 && incomingEquipmentIds.length === 0 && (
                    <p className="md:col-span-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                      Esta é uma retirada sem colocação. O equipamento não seguirá para o próximo boletim, mas a locação continuará sendo cobrada integralmente neste período.
                    </p>
                  )}
                  <Field label="Observação">
                    <Input
                      value={movementForm.observation}
                      onChange={(event) =>
                        setMovementForm({ ...movementForm, observation: event.target.value })
                      }
                    />
                  </Field>
                  <Button className="self-end" disabled={addMovement.isPending} onClick={() => addMovement.mutate()}>
                    {addMovement.isPending ? "Registrando..." : "Registrar movimentação"}
                  </Button>
                </div>
              </Card>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {movementBranchFilter
                    ? `Movimentações · ${branches.find((item) => item.id === movementBranchFilter)?.name || "Pátio selecionado"}`
                    : "Movimentações · todos os pátios"}
                </p>
                <MovementTable
                rows={movementsForSelectedBranch}
                branches={branches}
                equipment={equipment}
                residues={residues}
                onDelete={(ids) => void removeMovements(ids)}
                onConfirmationChange={(ids, confirmed) => toggleMovementConfirmation.mutate({ ids, confirmed })}
                changingConfirmationIds={toggleMovementConfirmation.isPending ? toggleMovementConfirmation.variables?.ids : undefined}
                onSave={(id, payload) => updateMovement.mutate({ id, payload })}
                savingId={updateMovement.isPending ? updateMovement.variables?.id : undefined}
                attachments={movementAttachments}
                onAttachmentAdd={(movementId, fileName, storagePath) => addMovementAttachment.mutateAsync({ movementId, fileName, storagePath })}
                onAttachmentRemove={(attachment) => removeMovementAttachment.mutate(attachment)}
                removingAttachmentId={removeMovementAttachment.isPending ? removeMovementAttachment.variables?.id : undefined}
                uploadingId={addMovementAttachment.isPending ? addMovementAttachment.variables?.movementId : undefined}
                focusedMovementId={focusedMovementId}
                />
              </div>
            </TabsContent>
            <TabsContent value="boletim" className="space-y-4">
              <Card className="p-4">
                <h2 className="font-semibold">Emissão e serviços terceirizados</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escolha quem emite o demonstrativo. Quando a terceirizada for a emissora, o PDF
                  traz o logo dela junto ao logo da Jacoby e lista somente os serviços vinculados a ela.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)_minmax(0,1.75fr)]">
                  <Field label="Emitido por">
                    <Select
                      value={cycle?.issuer_type || "jacoby"}
                      onValueChange={(value) => {
                        const issuerType = value as "jacoby" | "outsourced";
                        if (issuerType === "jacoby") {
                          saveIssuer.mutate({ issuerType, companyId: "" });
                          return;
                        }
                        const firstCompanyId = outsourcedCompanies[0]?.id;
                        if (!firstCompanyId) {
                          toast.error("Cadastre uma empresa terceirizada antes de selecioná-la como emissora.");
                          return;
                        }
                        saveIssuer.mutate({ issuerType, companyId: firstCompanyId });
                      }}
                    >
                      <SelectTrigger className="min-w-0 [&>span]:min-w-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="jacoby">Jacoby Soluções Ambientais</SelectItem>
                        <SelectItem value="outsourced">Empresa terceirizada</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {cycle?.issuer_type === "outsourced" && (
                    <Field label="Empresa emissora">
                      <Select
                        value={cycle.outsourced_company_id || ""}
                        onValueChange={(companyId) => saveIssuer.mutate({ issuerType: "outsourced", companyId })}
                      >
                        <SelectTrigger className="min-w-0 [&>span]:min-w-0"><SelectValue placeholder="Selecionar terceirizada" /></SelectTrigger>
                        <SelectContent>
                          {outsourcedCompanies.map((company) => (
                            <SelectItem key={company.id} value={company.id}>{company.trade_name || company.legal_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                  <div className="min-w-0 break-words rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm md:col-span-2 xl:col-span-1">
                    <p className="text-xs font-medium uppercase text-primary">Destaque no documento</p>
                    <p className="mt-1 font-semibold">Emitido por {cycle?.issuer_type === "outsourced" ? issuerCompany?.trade_name || issuerCompany?.legal_name || "empresa terceirizada" : "Jacoby Soluções Ambientais"}</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 border-t pt-4 md:grid-cols-[minmax(220px,1fr)_110px_130px_150px_170px_auto]">
                  <Field label="Incluir serviço no boletim">
                    <Select value={selectedServiceId} onValueChange={(serviceId) => {
                      setSelectedServiceId(serviceId);
                      setServiceAmount(String(serviceAmountForClient(serviceId)));
                      }}>
                      <SelectTrigger><SelectValue placeholder={cycle?.issuer_type === "outsourced" && !issuerCompany ? "Selecione a empresa emissora primeiro" : "Selecionar serviço"} /></SelectTrigger>
                      <SelectContent>
                        {availableServices.length
                          ? availableServices.map((service) => <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>)
                          : <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum serviço configurado para este cliente, emissor e filial/pátio.</div>}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Quantidade">
                    <Input type="number" min="1" step="1" value={serviceQuantity} onChange={(event) => setServiceQuantity(event.target.value)} />
                  </Field>
                  <Field label="Valor unitário">
                    <Input type="number" min="0" step="0.01" value={serviceAmount} onChange={(event) => setServiceAmount(event.target.value)} />
                  </Field>
                  <Field label="Total calculado">
                    <Input value={money(Number(serviceAmount || 0) * Math.max(1, Number(serviceQuantity || 1)))} disabled />
                  </Field>
                  <Field label="Data de execução">
                    <Input type="date" value={serviceExecutionDate} onChange={(event) => setServiceExecutionDate(event.target.value)} />
                  </Field>
                  <Button className="self-end" onClick={() => addCycleService.mutate()} disabled={!selectedServiceId}>Incluir serviço</Button>
                </div>
                <Field label="Observação" className="mt-3">
                  <Input value={serviceObservation} onChange={(event) => setServiceObservation(event.target.value)} placeholder="Opcional: detalhe deste lançamento" />
                </Field>
                {cycleServices.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1500px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Serviço</th><th className="p-2">Executora</th><th className="p-2">Quantidade</th><th className="p-2">Valor unitário</th><th className="p-2">Total</th><th className="p-2">Observação</th><th className="p-2">Data de execução</th><th className="p-2">Data de faturamento</th><th className="p-2">Data de pagamento</th><th className="p-2">PDF de faturamento</th><th className="p-2" /></tr></thead><tbody>{cycleServices.map((item) => <tr key={item.id} className="border-b"><td className="p-2">{services.find((service) => service.id === item.waste_service_id)?.name || "Serviço"}</td><td className="p-2">{outsourcedCompanies.find((company) => company.id === item.outsourced_company_id)?.trade_name || outsourcedCompanies.find((company) => company.id === item.outsourced_company_id)?.legal_name || ""}</td><td className="p-2"><Input className="h-8 w-20" type="number" min="1" step="1" defaultValue={Number(item.quantity || 1)} onBlur={(event) => void updateCycleServiceQuantity(item.id, event.target.value, Number(item.unit_amount ?? item.amount ?? 0))} /></td><td className="p-2"><Input className="h-8 w-28" type="number" min="0" step="0.01" defaultValue={Number(item.unit_amount ?? item.amount ?? 0)} onBlur={(event) => void updateCycleServiceAmount(item.id, event.target.value, Number(item.quantity || 1))} /></td><td className="p-2 font-medium">{money(Number(item.amount || 0))}</td><td className="p-2"><Input className="h-8 w-48" defaultValue={item.observation || ""} onBlur={(event) => void updateCycleServiceObservation(item.id, event.target.value)} placeholder="Opcional" /></td><td className="p-2"><Input className="h-8 w-36" type="date" defaultValue={item.execution_date || ""} onBlur={(event) => void updateCycleServiceExecutionDate(item.id, event.target.value)} /></td><td className="p-2"><Input className="h-8 w-36" type="date" defaultValue={item.invoice_issued_on || ""} onBlur={(event) => void updateCycleServiceBillingDate(item.id, event.target.value)} /></td><td className="p-2"><Input className="h-8 w-36" type="date" defaultValue={item.received_on || ""} onBlur={(event) => void updateCycleServicePaymentDate(item.id, event.target.value)} /></td><td className="p-2"><div className="flex min-w-44 flex-col items-start gap-1">{item.invoice_pdf_path && <Button variant="link" size="sm" className="h-auto max-w-44 justify-start p-0 text-left" title={item.invoice_pdf_name || "Abrir PDF"} onClick={() => void openCycleServiceInvoicePdf(item)}><FileText className="mr-1 h-3.5 w-3.5 shrink-0" /><span className="truncate">{item.invoice_pdf_name || "PDF anexado"}</span></Button>}<label className="inline-flex"><input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => { void uploadCycleServiceInvoicePdf(item, event.target.files?.[0]); event.currentTarget.value = ""; }} /><Button asChild variant="outline" size="sm"><span><Upload className="mr-1 h-3.5 w-3.5" />{item.invoice_pdf_path ? "Trocar PDF" : "Anexar PDF"}</span></Button></label></div></td><td className="p-2"><Button variant="ghost" size="icon" onClick={() => void remove("billing_v2_cycle_services", item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td></tr>)}</tbody></table></div>}
              </Card>
              <Card className="p-4">
                <h2 className="font-semibold">Valores aplicados</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Locação e troca são valores individuais do equipamento. O tratamento usa o valor do resíduo
                  definido para este pátio em Configurações de movimentação.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border p-3 text-sm">
                    Locação: <strong>valor individual de cada equipamento</strong>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    Troca: <strong>valor do equipamento que saiu</strong>
                  </div>
                </div>
              </Card>
              <Boletim
                client={clientName}
                cycle={cycle}
                branches={branches}
                placements={filteredPlacements}
                movements={filteredMovements.filter((item) => item.confirmed)}
                equipment={equipment}
                residues={residues}
                services={services}
                cycleServices={filteredServices}
                totals={filteredTotals}
                treatmentCompany={residueFilterId !== "all" && treatmentCompanyId ? (outsourcedCompanies.find((company) => company.id === treatmentCompanyId)?.trade_name || outsourcedCompanies.find((company) => company.id === treatmentCompanyId)?.legal_name || "") : ""}
              />
              <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/15 p-4">
                <div className="min-w-0">
                  <p className="font-semibold">Emitir boletim</p>
                  <p className="text-sm text-muted-foreground">Filtre por resíduo para emitir uma versão separada, finalize e gere o PDF.</p>
                  {cycleResidueIds.length > 0 && cycle?.status !== "closed" && (
                    pendingResidueNames.length ? (
                      <p className="mt-1 text-sm"><span className="font-medium text-amber-700">Faltam finalizar:</span> <span className="text-muted-foreground">{pendingResidueNames.join(", ")}</span>{finalizedResidueNames.length ? <span className="text-muted-foreground"> · já finalizados: {finalizedResidueNames.join(", ")}</span> : null}</p>
                    ) : (
                      <p className="mt-1 text-sm font-medium text-primary">Todos os resíduos finalizados — finalize mais uma vez para encerrar o boletim.</p>
                    )
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-48">
                    <Select value={residueFilterId} onValueChange={(value) => { setResidueFilterId(value); if (value === "all") setTreatmentCompanyId(""); }}>
                      <SelectTrigger><SelectValue placeholder="Filtrar resíduo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os resíduos</SelectItem>
                        {residuesForCycleBranch.map((residue) => <SelectItem key={residue.id} value={residue.id}>{residue.name}{finalizedResidueIds.has(residue.id) ? " ✓ finalizado" : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {residueFilterId !== "all" && (
                    <div className="w-56">
                      <Select value={treatmentCompanyId || "none"} onValueChange={(value) => setTreatmentCompanyId(value === "none" ? "" : value)}>
                        <SelectTrigger><SelectValue placeholder="Terceirizada do tratamento" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem terceirizada do tratamento</SelectItem>
                          {outsourcedCompanies.map((company) => <SelectItem key={company.id} value={company.id}>{company.trade_name || company.legal_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {residueFilterId !== "all" && finalizedResidueIds.has(residueFilterId) && (
                    <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={removeResidueEmission.isPending} onClick={() => { if (window.confirm(`Desfazer a finalização do resíduo "${selectedResidueName}"? A emissão por resíduo será removida.`)) removeResidueEmission.mutate(residueFilterId); }}><Trash2 className="mr-2 h-4 w-4" />Desfazer finalização</Button>
                  )}
                  <Button variant="outline" onClick={() => finalizeCycle.mutate()} disabled={residueFilterId === "all" && cycle?.status === "closed"}><CheckCircle2 className="mr-2 h-4 w-4" />{residueFilterId !== "all" ? `Finalizar emissão #${filteredEmissionPreview}` : cycle?.status === "closed" ? "Boletim finalizado" : "Finalizar boletim"}</Button>
                  {cycle?.status === "closed" && (
                    <Button variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50 hover:text-amber-900" disabled={reopenCycle.isPending} onClick={() => { if (window.confirm("Reabrir este boletim? Ele volta para edição e deixa de contar no faturamento até ser finalizado novamente.")) reopenCycle.mutate(); }}><RotateCcw className="mr-2 h-4 w-4" />Reabrir boletim</Button>
                  )}
                  <Button onClick={() => void generateCurrentPdf()}><Download className="mr-2 h-4 w-4" />Gerar PDF{residueFilterId !== "all" && finalizedResidueIds.has(residueFilterId) ? ` #${filteredEmissionPreview}` : ""}</Button>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
      <Dialog open={Boolean(publishDialog)} onOpenChange={(open) => { if (!open) setPublishDialog(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Conferir publicação e envio</DialogTitle>
          </DialogHeader>
          {publishDialog && (
            <div className="space-y-5">
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">Boletim</p><p className="font-semibold">{publishDialog.displayNumber}</p></div>
                <div><p className="text-xs text-muted-foreground">Cliente</p><p className="font-semibold">{clients.find((item) => item.id === publishDialog.cycle.client_id)?.name || clientName}</p></div>
                <div><p className="text-xs text-muted-foreground">Filial/pátio</p><p className="font-semibold">{branchName(publishDialog.cycle.branch_id)}</p></div>
                <div><p className="text-xs text-muted-foreground">Conteúdo</p><p className="font-semibold">{publishDialog.residueEmission ? residues.find((item) => item.id === publishDialog.residueEmission?.waste_residue_id)?.name || "Emissão por resíduo" : "BM completo"}</p></div>
              </div>

              <Button variant="outline" className="w-full" onClick={() => void viewBulletin(publishDialog.cycle, publishDialog.residueId, publishDialog.displayNumber)}>
                <Eye className="mr-2 h-4 w-4" />Visualizar o BM antes de enviar
              </Button>

              <div className="space-y-2">
                <Label>Será enviado para</Label>
                <div className="rounded-lg border p-3 text-sm">
                  {recipientPreviewLoading ? <p className="text-muted-foreground">Conferindo os e-mails cadastrados no acesso do cliente…</p> : recipientPreviewError ? <p className="text-destructive">{recipientPreviewError}</p> : recipientPreview.length ? <div className="space-y-1">{recipientPreview.map((email) => <div key={email} className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-primary" /><span>{email}</span></div>)}</div> : <p className="text-amber-700">Nenhum e-mail está vinculado ao acesso deste cliente. Cadastre um destinatário antes de enviar.</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing-email-message">Mensagem para o cliente <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Textarea id="billing-email-message" value={emailMessage} maxLength={2000} rows={5} onChange={(event) => setEmailMessage(event.target.value)} placeholder="Ex.: Olá! Segue o boletim de medição do período para sua conferência." />
                <p className="text-right text-xs text-muted-foreground">{emailMessage.length}/2000 caracteres</p>
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                Ao confirmar, o BM será publicado no Portal do Cliente e o aviso será enviado aos e-mails mostrados acima.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishDialog(null)}>Cancelar</Button>
            <Button disabled={recipientPreviewLoading || recipientPreview.length === 0 || Boolean(recipientPreviewError) || setCyclePortalVisibility.isPending || setResidueEmissionPortalVisibility.isPending} onClick={confirmPublishAndSend}>
              <Send className="mr-2 h-4 w-4" />
              {setCyclePortalVisibility.isPending || setResidueEmissionPortalVisibility.isPending ? "Publicando…" : "Publicar no portal e enviar e-mail"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo boletim</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{clientName}</span>
              {cycleBranchId === BRANCH_MATRIZ ? " · Matriz (sem filial/pátio)" : cycleBranchId ? ` · ${branch(cycleBranchId)?.name || "filial/pátio"}` : clientHasNoBranches ? " · Matriz" : ""}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Início do boletim">
                <Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
              </Field>
              <Field label="Fim do boletim">
                <Input type="date" value={periodEnd} min={periodStart} onChange={(event) => setPeriodEnd(event.target.value)} />
              </Field>
            </div>
            {(cycleBranchId || clientHasNoBranches) && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                {clientHasNoBranches ? <p className="text-muted-foreground">Este cliente não possui filial ou pátio. O boletim será aberto em nome da matriz e poderá receber serviços normalmente.</p> : previousClosedCycleQuery.isLoading ? (
                  <p className="text-muted-foreground">Consultando o último boletim fechado deste pátio…</p>
                ) : previousClosedCycle ? (
                  <>
                    <p className="font-medium">Último boletim fechado: {bulletinNumber(previousClosedCycle.bulletin_number)}</p>
                    {previousClosedPlacements.length ? (
                      <>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-muted-foreground">Selecione os equipamentos que ficaram no local para trazer:</p>
                          <button
                            type="button"
                            onClick={() => setImportPlacementIds(importPlacementIds.length === previousClosedPlacements.length ? [] : previousClosedPlacements.map((item) => item.id))}
                            className="shrink-0 text-xs font-medium text-primary hover:underline"
                          >
                            {importPlacementIds.length === previousClosedPlacements.length ? "Desmarcar todos" : "Marcar todos"}
                          </button>
                        </div>
                        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border bg-card p-2">
                          {previousClosedPlacements.map((item) => {
                            const equipmentItem = equipment.find((entry) => entry.id === item.equipment_id);
                            const checked = importPlacementIds.includes(item.id);
                            return (
                              <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) => setImportPlacementIds((current) => value ? [...current, item.id] : current.filter((id) => id !== item.id))}
                                />
                                <span className="flex-1">{equipmentName(equipmentItem)}{Number(item.quantity) > 1 ? ` · ${number(Number(item.quantity))} unidades` : ""}</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {importPlacementIds.length
                            ? `${importPlacementIds.length} de ${previousClosedPlacements.length} equipamento(s) serão trazidos com os valores atuais do cadastro.`
                            : "Nenhum selecionado — o boletim será iniciado vazio."}
                          {" "}Movimentações, pesos, serviços e totais anteriores nunca são copiados.
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-muted-foreground">Nenhum equipamento ficou em locação nesse boletim. O novo boletim será iniciado vazio.</p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Não há boletim fechado anterior para este pátio. O novo boletim será iniciado vazio.</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => openCycle.mutate()} disabled={openCycle.isPending}>
              <FilePlus2 className="mr-2 h-4 w-4" />
              {openCycle.isPending ? "Criando…" : "Criar boletim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlacementTable({
  rows,
  branches,
  equipment,
  residues,
  onDelete,
  onSave,
}: {
  rows: Placement[];
  branches: Branch[];
  equipment: Equipment[];
  residues: Residue[];
  onDelete: (id: string) => void;
  onSave: (id: string, values: { started_on: string; quantity: string; observation: string }) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Placement | null>(null);
  const [draft, setDraft] = useState({ started_on: "", quantity: "1", observation: "" });
  const [saving, setSaving] = useState(false);
  const openEditor = (row: Placement) => {
    setEditing(row);
    setDraft({ started_on: row.started_on, quantity: String(row.quantity), observation: row.observation || "" });
  };
  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await onSave(editing.id, draft);
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a locação.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
    <Card className="overflow-x-auto p-4">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2">Início</th>
            <th className="p-2">Filial/pátio</th>
            <th className="p-2">Equipamento no local</th>
            <th className="p-2">Equipamento colocado / troca</th>
            <th className="p-2">Resíduo</th>
            <th className="p-2">Quantidade</th>
            <th className="p-2">Observação</th>
            <th className="p-2">Valor da locação</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="p-2">
                  {new Date(`${row.started_on}T12:00:00`).toLocaleDateString("pt-BR")}
                </td>
                <td className="p-2">
                  {branches.find((item) => item.id === row.branch_id)?.name || "—"}
                </td>
                <td className="p-2">
                  {equipmentName(equipment.find((item) => item.id === row.equipment_id))}
                </td>
                <td className="p-2 text-muted-foreground">—</td>
                <td className="p-2">
                  {residues.find((item) => item.id === row.waste_residue_id)?.name || "—"}
                </td>
                <td className="p-2">{number(Number(row.quantity))}</td>
                <td className="max-w-72 whitespace-pre-wrap p-2 text-muted-foreground">{row.observation || "—"}</td>
                <td className="p-2">{money(Number(row.monthly_rental_rate))}</td>
                <td className="p-2">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label="Editar locação" onClick={() => openEditor(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Excluir locação" onClick={() => onDelete(row.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="p-5 text-center text-muted-foreground" colSpan={9}>
                Nenhum equipamento em locação neste boletim.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar locação</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Início"><Input type="date" value={draft.started_on} onChange={(event) => setDraft({ ...draft, started_on: event.target.value })} /></Field>
          <Field label="Quantidade"><Input type="number" min="1" step="1" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} /></Field>
          <Field label="Observação" className="sm:col-span-2"><Input value={draft.observation} onChange={(event) => setDraft({ ...draft, observation: event.target.value })} placeholder="Opcional" /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
function MovementTable({
  rows,
  branches,
  equipment,
  residues,
  onDelete,
  onConfirmationChange,
  changingConfirmationIds,
  onSave,
  savingId,
  attachments,
  onAttachmentAdd,
  onAttachmentRemove,
  removingAttachmentId,
  uploadingId,
  focusedMovementId,
}: {
  rows: Movement[];
  branches: Branch[];
  equipment: Equipment[];
  residues: Residue[];
  onDelete: (ids: string[]) => void;
  onConfirmationChange: (ids: string[], confirmed: boolean) => void;
  changingConfirmationIds?: string[];
  onSave: (id: string, payload: Partial<Movement>) => void;
  savingId?: string;
  attachments: MovementAttachment[];
  onAttachmentAdd: (movementId: string, fileName: string, storagePath: string) => Promise<unknown>;
  onAttachmentRemove: (attachment: MovementAttachment) => void;
  removingAttachmentId?: string;
  uploadingId?: string;
  focusedMovementId?: string;
}) {
  const [editing, setEditing] = useState<Movement | null>(null);
  const [editingRows, setEditingRows] = useState<Movement[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [draft, setDraft] = useState({
    date: "", order: "", mtr: "", residueId: "", outgoingId: "", incomingId: "", placed: "0", removed: "0", weight: "0", observation: "",
  });
  const openEditor = (row: Movement, groupRows = [row]) => {
    setEditing(row);
    setEditingRows(groupRows);
    setDraft({
      date: row.occurred_on,
      order: row.service_order || "",
      mtr: row.mtr_number || "",
      residueId: row.waste_residue_id || "",
      outgoingId: row.equipment_id || "",
      incomingId: row.replacement_equipment_id || "",
      placed: String(groupRows.reduce((sum, item) => sum + Number(item.placed_quantity || 0), 0)),
      removed: String(groupRows.reduce((sum, item) => sum + Number(item.removed_quantity || 0), 0)),
      weight: String(groupRows.reduce((sum, item) => sum + Number(item.weight_kg || 0), 0)),
      observation: row.observation || "",
    });
  };
  const saveEditor = () => {
    if (!editing) return;
    const rowsToSave = editingRows.length ? editingRows : [editing];
    rowsToSave.forEach((row) => onSave(row.id, {
      occurred_on: draft.date,
      service_order: draft.order || null,
      mtr_number: draft.mtr.trim() || null,
      waste_residue_id: draft.residueId || null,
      equipment_id: row.equipment_id,
      replacement_equipment_id: row.replacement_equipment_id,
      placed_quantity: Number(draft.placed || 0) / rowsToSave.length,
      removed_quantity: Number(draft.removed || 0) / rowsToSave.length,
      weight_kg: Number(draft.weight || 0) / rowsToSave.length,
      observation: draft.observation || null,
    }));
    setEditing(null);
    setEditingRows([]);
  };
  const groups = useMemo(() => {
    const map = new Map<string, Movement[]>();
    rows.forEach((row) => {
      const key = row.batch_id || [
        "legacy", row.branch_id, row.occurred_on, row.service_order || "", row.mtr_number || "",
        row.waste_residue_id || "", row.observation || "", row.confirmed,
      ].join("|");
      map.set(key, [...(map.get(key) || []), row]);
    });
    return Array.from(map.entries()).map(([key, groupRows]) => ({ key, rows: groupRows }));
  }, [rows]);
  useEffect(() => {
    if (!focusedMovementId) return;
    const focusedRow = document.getElementById(`movement-${focusedMovementId}`);
    focusedRow?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedMovementId, rows]);
  const toggleDetails = (key: string) =>
    setExpandedGroups((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const branchEquipment = editing ? equipment.filter((item) => item.branch_id === editing.branch_id) : [];
  const branchResidues = editing ? residues.filter((item) => !item.branch_id || item.branch_id === editing.branch_id) : [];
  const uploadPdf = async (row: Movement, file?: File) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(file.name);
    if (!isPdf && !isImage) {
      toast.error("Anexe uma imagem (foto) ou um arquivo PDF.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 15 MB.");
      return;
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${row.id}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("movement-documents").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) return toast.error(error.message);
    try {
      await onAttachmentAdd(row.id, file.name, path);
    } catch {
      await supabase.storage.from("movement-documents").remove([path]);
      return;
    }
  };
  const openPdf = async (attachment: MovementAttachment) => {
    const { data, error } = await supabase.storage.from("movement-documents").createSignedUrl(attachment.storage_path, 600);
    if (error || !data?.signedUrl) return toast.error(error?.message || "Não foi possível abrir o anexo.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <>
    <Card className="overflow-x-auto p-4">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2">Data</th>
            <th className="p-2">OS</th>
            <th className="p-2">MTR</th>
            <th className="p-2">Filial/pátio</th>
            <th className="p-2">Equipamento que saiu</th>
            <th className="p-2">Equipamento que entrou</th>
            <th className="p-2">Resíduo</th>
            <th className="p-2">Colocadas</th>
            <th className="p-2">Removidas</th>
            <th className="p-2">Peso</th>
            <th className="p-2">Observação</th>
            <th className="p-2">PDF</th>
            <th className="p-2">Confirmada</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {groups.length ? (
            groups.map(({ key, rows: groupRows }) => {
              const row = groupRows[0];
              const isBatch = groupRows.length > 1;
              const isExpanded = expandedGroups.includes(key);
              const groupIds = groupRows.map((item) => item.id);
              const groupAttachments = attachments.filter((attachment) => groupIds.includes(attachment.movement_id));
              const totalPlaced = groupRows.reduce((sum, item) => sum + Number(item.placed_quantity || 0), 0);
              const totalRemoved = groupRows.reduce((sum, item) => sum + Number(item.removed_quantity || 0), 0);
              const totalWeight = groupRows.reduce((sum, item) => sum + Number(item.weight_kg || 0), 0);
              const allConfirmed = groupRows.every((item) => item.confirmed);
              const isChanging = groupRows.some((item) => changingConfirmationIds?.includes(item.id));
              const isSaving = groupRows.some((item) => savingId === item.id);
              const isFocused = groupRows.some((item) => item.id === focusedMovementId);
              return (
              <Fragment key={key}>
              <tr id={`movement-${row.id}`} className={`border-b transition-colors ${isFocused ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : ""}`}>
                <td className="p-2">
                  {new Date(`${row.occurred_on}T12:00:00`).toLocaleDateString("pt-BR")}
                </td>
                <td className="p-2">{row.service_order || "—"}</td>
                <td className="p-2">{row.mtr_number || "—"}</td>
                <td className="p-2">
                  {branches.find((item) => item.id === row.branch_id)?.name || "—"}
                </td>
                <td className="p-2">
                  {isBatch ? (
                    <Button variant="link" size="sm" className="h-auto p-0 text-left" onClick={() => toggleDetails(key)}>
                      {isExpanded ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
                      {groupRows.length} equipamentos · detalhar
                    </Button>
                  ) : equipmentName(equipment.find((item) => item.id === row.equipment_id || ""))}
                </td>
                <td className="p-2">
                  {isBatch ? `${number(totalPlaced)} colocada(s)` : row.replacement_equipment_id
                    ? equipmentName(
                        equipment.find((item) => item.id === row.replacement_equipment_id || ""),
                      )
                    : "—"}
                </td>
                <td className="p-2">
                  {residues.find((item) => item.id === row.waste_residue_id)?.name || "—"}
                </td>
                <td className="p-2">{number(totalPlaced)}</td>
                <td className="p-2">{number(totalRemoved)}</td>
                <td className="p-2">{number(totalWeight)} kg</td>
                <td className="max-w-48 p-2 text-sm" title={row.observation || undefined}>
                  {row.observation || "—"}
                </td>
                <td className="p-2">
                  <div className="flex min-w-40 flex-col items-start gap-1">
                    {groupAttachments.map((attachment) => {
                      const isImageFile = /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(attachment.file_name);
                      return (
                      <div key={attachment.id} className="flex max-w-40 items-center gap-1">
                        <Button variant="link" size="sm" className="h-auto min-w-0 flex-1 justify-start p-0 text-left" title={attachment.file_name} onClick={() => void openPdf(attachment)}>{isImageFile ? <ImageIcon className="mr-1 h-3.5 w-3.5 shrink-0" /> : <FileText className="mr-1 h-3.5 w-3.5 shrink-0" />}<span className="truncate">{attachment.file_name}</span></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Excluir este anexo" aria-label={`Excluir anexo ${attachment.file_name}`} disabled={removingAttachmentId === attachment.id} onClick={() => { if (window.confirm(`Excluir o anexo \"${attachment.file_name}\"?`)) onAttachmentRemove(attachment); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </div>
                      );
                    })}
                    <label className="inline-flex">
                      <input className="sr-only" type="file" accept="image/*,application/pdf,.pdf" disabled={uploadingId === row.id} onChange={(event) => { void uploadPdf(row, event.target.files?.[0]); event.currentTarget.value = ""; }} />
                      <Button asChild variant="outline" size="sm" disabled={uploadingId === row.id} aria-label="Adicionar arquivo ou foto à movimentação">
                        <span><Upload className="mr-1 h-3.5 w-3.5" />Adicionar arquivo</span>
                      </Button>
                    </label>
                  </div>
                </td>
                <td className="p-2">
                  <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-medium">
                    <Checkbox
                      checked={allConfirmed}
                      disabled={isChanging}
                      onCheckedChange={(checked) => onConfirmationChange(groupIds, checked === true)}
                    />
                    {allConfirmed ? "Gera valor" : "Não gera valor"}
                  </label>
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label="Editar movimentação" disabled={isSaving} onClick={() => openEditor(row, groupRows)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Excluir movimentação" onClick={() => onDelete(groupIds)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
              {isBatch && isExpanded && (
                <tr className="border-b bg-muted/30">
                  <td className="p-3" colSpan={14}>
                    <p className="text-sm font-medium">Detalhamento dos equipamentos</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {groupRows.map((item, index) => (
                        <div key={item.id} className="rounded-md border bg-background p-2 text-xs">
                          <span className="font-medium">{index + 1}.</span> Saiu {equipmentName(equipment.find((equipmentItem) => equipmentItem.id === item.equipment_id || ""))} · Entrou {item.replacement_equipment_id ? equipmentName(equipment.find((equipmentItem) => equipmentItem.id === item.replacement_equipment_id || "")) : "—"} · {number(Number(item.weight_kg || 0))} kg
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })
          ) : (
            <tr>
              <td className="p-5 text-center text-muted-foreground" colSpan={14}>
                Nenhuma movimentação neste boletim.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
    <Dialog open={!!editing} onOpenChange={(open) => { if (!open) { setEditing(null); setEditingRows([]); } }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar movimentação</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Filial ou pátio"><Input value={branches.find((item) => item.id === editing?.branch_id)?.name || ""} disabled /></Field>
          <Field label="Data"><Input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></Field>
          <Field label="Ordem de serviço"><Input value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })} /></Field>
          <Field label="MTR"><Input value={draft.mtr} onChange={(event) => setDraft({ ...draft, mtr: event.target.value })} placeholder="Número do MTR" /></Field>
          <Field label="Resíduo">
            <Select value={draft.residueId || "none"} onValueChange={(value) => setDraft({ ...draft, residueId: value === "none" ? "" : value })}>
              <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem resíduo</SelectItem>{branchResidues.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          {editingRows.length > 1 ? (
            <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Esta é uma movimentação agrupada com {editingRows.length} equipamentos. Os equipamentos individuais são preservados; use “detalhar” na tabela para conferi-los.
            </div>
          ) : <>
          <Field label="Equipamento que saiu">
            <Select value={draft.outgoingId || "none"} onValueChange={(value) => setDraft({ ...draft, outgoingId: value === "none" ? "" : value })}>
              <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Nenhum</SelectItem>{branchEquipment.map((item) => <SelectItem key={item.id} value={item.id}>{equipmentName(item)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Equipamento que entrou">
            <Select value={draft.incomingId || "none"} onValueChange={(value) => setDraft({ ...draft, incomingId: value === "none" ? "" : value })}>
              <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Nenhum</SelectItem>{branchEquipment.map((item) => <SelectItem key={item.id} value={item.id}>{equipmentName(item)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          </>}
          <Field label="Quantidade colocada"><Input type="number" min="0" step="1" value={draft.placed} onChange={(event) => setDraft({ ...draft, placed: event.target.value })} /></Field>
          <Field label="Quantidade removida"><Input type="number" min="0" step="1" value={draft.removed} onChange={(event) => setDraft({ ...draft, removed: event.target.value })} /></Field>
          <Field label="Peso (kg)"><Input type="number" min="0" step="0.001" value={draft.weight} onChange={(event) => setDraft({ ...draft, weight: event.target.value })} /></Field>
          <Field label="Observação"><Input value={draft.observation} onChange={(event) => setDraft({ ...draft, observation: event.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { setEditing(null); setEditingRows([]); }}>Cancelar</Button>
          <Button type="button" disabled={editingRows.some((row) => savingId === row.id)} onClick={saveEditor}>{editingRows.some((row) => savingId === row.id) ? "Salvando…" : "Salvar movimentação"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
function Boletim({
  client,
  cycle,
  branches,
  placements,
  movements,
  equipment,
  residues,
  services,
  cycleServices,
  totals,
  treatmentCompany,
}: {
  client: string;
  cycle?: Cycle;
  branches: Branch[];
  placements: Placement[];
  movements: Movement[];
  equipment: Equipment[];
  residues: Residue[];
  services: Service[];
  cycleServices: CycleService[];
  totals: {
    rental: number;
    exchanges: number;
    weight: number;
    exchange: number;
    treatment: number;
    services: number;
    total: number;
  };
  treatmentCompany?: string;
}) {
  const branchIds = Array.from(
    new Set([...placements, ...movements].map((item) => item.branch_id)),
  );
  return (
    <Card className="space-y-5 p-5 print:border-0 print:shadow-none">
      <div>
        <p className="text-sm font-medium text-primary">Jacoby Soluções Ambientais</p>
        <h2 className="text-xl font-bold">Boletim de medição</h2>
        <p className="text-sm text-muted-foreground">
          {client} ·{" "}
          {cycle
            ? `${new Date(`${cycle.period_start}T12:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${cycle.period_end}T12:00:00`).toLocaleDateString("pt-BR")}`
            : ""}
        </p>
        {treatmentCompany && (
          <p className="mt-1 text-sm text-primary">
            Tratamento realizado por: <span className="font-medium">{treatmentCompany}</span>
          </p>
        )}
      </div>
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-semibold">Filiais e pátios incluídos</p>
        <p className="mt-1 text-muted-foreground">
          {branchIds
            .map((id) => branches.find((item) => item.id === id)?.name)
            .filter(Boolean)
            .join(" · ") || "Nenhuma movimentação ou locação registrada."}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Serviço</th>
            <th className="py-2">Quantidade</th>
            <th className="py-2">Valor unitário</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2">Locação de equipamentos</td>
            <td className="py-2">
              {placements.reduce((sum, item) => sum + Number(item.quantity), 0)}
            </td>
            <td className="py-2">Conforme colocação</td>
            <td className="py-2 text-right">{money(totals.rental)}</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">Troca de equipamentos</td>
            <td className="py-2">{number(totals.exchanges)}</td>
            <td className="py-2">Conforme valor por troca</td>
            <td className="py-2 text-right">{money(totals.exchange)}</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">Tratamento de resíduos</td>
            <td className="py-2">{number(totals.weight)} kg</td>
            <td className="py-2">Conforme resíduo e filial/pátio</td>
            <td className="py-2 text-right">{money(totals.treatment)}</td>
          </tr>
          {cycleServices.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-2"><p>{services.find((service) => service.id === item.waste_service_id)?.name || "Serviço terceirizado"}</p>{item.observation && <p className="mt-0.5 text-xs text-muted-foreground">{item.observation}</p>}</td>
              <td className="py-2">{number(Number(item.quantity || 1))}</td>
              <td className="py-2">{money(Number(item.unit_amount ?? item.amount ?? 0))}</td>
              <td className="py-2 text-right">{money(Number(item.amount || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto w-full max-w-xs rounded-lg bg-primary/10 p-4 text-right">
        <p className="text-xs font-medium uppercase text-primary">Faturamento total</p>
        <p className="mt-1 text-2xl font-bold text-primary">{money(totals.total)}</p>
      </div>
    </Card>
  );
}
