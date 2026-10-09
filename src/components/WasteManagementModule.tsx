/** Cadastros do cliente alimentam diretamente o demonstrativo mensal. */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FilePlus2, Info, Package, Pencil, Scale, Trash2, Truck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClients } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useRouterState } from "@tanstack/react-router";
import jacobyLogo from "@/assets/jacoby-logo-transparent.png";
import { BillingV2Module } from "@/components/BillingV2Module";

const WasteReportCharts = lazy(() =>
  import("@/components/WasteReportCharts").then((module) => ({ default: module.WasteReportCharts })),
);

type Residue = {
  id: string;
  client_id: string;
  name: string;
  waste_class: "class_i" | "class_ii";
  unit: string;
  default_rental_rate: number;
  default_exchange_rate: number;
  default_treatment_rate: number;
  branch_id: string | null;
  active: boolean;
};
type Equipment = {
  id: string;
  branch_id: string | null;
  identification: string | null;
  name: string;
  equipment_type: string;
  load_capacity_kg: number | null;
  capacity_unit: string;
  capacity_value: number | null;
  capacity_m3: number | null;
  vehicle_type: string | null;
  category: string;
  plate: string | null;
  active: boolean;
  monthly_rental_rate: number;
  exchange_rate: number;
  default_waste_residue_id: string | null;
};
type EquipmentOption = {
  id: string;
  option_type: "vehicle_model" | "recipient";
  name: string;
  active: boolean;
};
type StandardResidueType = {
  id: string;
  name: string;
  waste_class: "class_i" | "class_ii";
  unit: string;
  active: boolean;
};
type Branch = {
  id: string;
  name: string;
  legal_name: string | null;
  cnpj: string | null;
  address: string | null;
  responsible: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
};
type Service = {
  id: string;
  client_id: string;
  name: string;
  default_rate: number;
  active: boolean;
  branch_id: string | null;
};
type OutsourcedCompany = { id: string; legal_name: string; trade_name: string | null; logo_url: string | null };
type OutsourcedCompanyService = {
  outsourced_company_id: string;
  waste_service_id: string;
  waste_services?: { id: string; name: string; active: boolean; branch_id: string | null } | null;
};
type OutsourcedCommissionSetting = {
  id: string;
  client_id: string;
  outsourced_company_id: string;
  tax_withholding_rate: number;
  rental_commission_rate: number;
  exchange_commission_rate: number;
  active: boolean;
};
type OutsourcedTreatmentCommissionRate = {
  id: string;
  commission_setting_id: string;
  waste_residue_id: string;
  outsourced_treatment_rate: number;
  jacoby_treatment_rate: number | null;
};
type OutsourcedCommissionTemplate = {
  id: string;
  outsourced_company_id: string;
  tax_withholding_rate: number;
  rental_commission_rate: number;
  exchange_commission_rate: number;
  active: boolean;
};
type OutsourcedTreatmentCommissionTemplateRate = {
  id: string;
  commission_template_id: string;
  residue_name: string;
  outsourced_treatment_rate: number;
  jacoby_treatment_rate: number | null;
};
type ClientServiceRate = { client_id: string; waste_service_id: string; default_rate: number };
type ClientServiceRateOverride = {
  id: string;
  client_id: string;
  waste_service_id: string;
  outsourced_company_id: string | null;
  branch_id: string | null;
  default_rate: number;
};
type ReportService = { id: string; waste_service_id: string; rate: number; excluded: boolean };
type Report = {
  id: string;
  period_start: string;
  period_end: string;
  status: "draft" | "published";
};
type Movement = {
  id: string;
  waste_residue_id: string | null;
  branch_id: string | null;
  equipment_id: string | null;
  occurred_on: string;
  operation_type?: "movement" | "container_placement";
  placement_value?: number;
  container_placement_id?: string | null;
  placed_quantity: number;
  removed_quantity: number;
  weight_kg: number;
  service_order: string | null;
  mtr_number: string | null;
  destination_name: string | null;
};
type Rate = {
  id: string;
  waste_residue_id: string | null;
  rental_rate: number;
  exchange_rate: number;
  treatment_rate: number;
  excluded?: boolean;
};
type Ticket = {
  id: string;
  waste_residue_id: string | null;
  equipment_id: string | null;
  weighed_on: string | null;
  ticket_number: string | null;
  vehicle_plate: string | null;
  net_weight_kg: number | null;
};
const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const n = (v: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v || 0);
const capacityUnitLabel = (unit: string) =>
  ({ m3: "m³", metro: "m", tonelada: "Toneladas", litros: "Litros", kg: "KG", unidade: "un.", granel: "Granel" })[unit] || unit;
const optionKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
const uniqueOptionNames = (names: string[]) => {
  const known = new Set<string>();
  return names.filter((name) => {
    const key = optionKey(name);
    if (!key || known.has(key)) return false;
    known.add(key);
    return true;
  });
};
const equipmentLabel = (equipment?: Equipment) =>
  equipment
    ? [equipment.identification, equipment.name, equipment.equipment_type]
        .filter(Boolean)
        .join(" · ")
    : "Equipamento";
const BRANCH_MATRIZ = "__matriz__";
const branchToDb = (value?: string | null) => (value && value !== BRANCH_MATRIZ ? value : null);
const branchKey = (value?: string | null) => value || BRANCH_MATRIZ;
const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (value: string) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00`))
    : "—";
const isContainerPlacement = (move: Movement) => move.operation_type === "container_placement";
const chartResidueName = (name: string) => {
  const clean = name.trim().toLocaleUpperCase("pt-BR");
  return clean.startsWith("MADEIRA") ? "MADEIRA" : clean;
};
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <Label>{label}</Label>
    <div className="mt-1">{children}</div>
  </div>
);

function CreatableOptionInput({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const filter = value.trim().toLocaleLowerCase("pt-BR");
  const visibleOptions = options.filter((option) =>
    option.toLocaleLowerCase("pt-BR").includes(filter),
  );
  const existingOption = options.some((option) => option.toLocaleLowerCase("pt-BR") === filter);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        avoidCollisions={false}
        className="w-80 border-border bg-card p-1 shadow-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {visibleOptions.length > 0 && (
          <div className="max-h-44 overflow-y-auto py-1">
            {visibleOptions.map((option) => (
              <button
                key={option}
                type="button"
                className="flex w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        )}
        {value.trim() && !existingOption && (
          <button
            type="button"
            className="flex w-full rounded-md border-t border-border px-3 py-2 text-left text-sm font-medium text-primary hover:bg-primary/5"
            onClick={() => setOpen(false)}
          >
            Usar “{value.trim()}” como nova opção
          </button>
        )}
        {!visibleOptions.length && !value.trim() && (
          <p className="px-3 py-2 text-sm text-muted-foreground">Nenhuma opção cadastrada ainda.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function WasteManagementModule({ portal = false }: { portal?: boolean }) {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const { isAdmin, isClient, clientId: linked, loading, hasPermission } = useAuth();
  const canManageBilling = isAdmin || hasPermission("billing");
  const canConfigureMovements = isAdmin || hasPermission("movement_settings");
  const [clientId, setClientId] = useState(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem("jacoby:faturamento:cliente") || "";
  });
  const [reportId, setReportId] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [reportMonth, setReportMonth] = useState("todos");
  const search = useRouterState({ select: (s) => s.location.search }) as { aba?: string };
  const requestedCatalogTab = ["relatorios", "faturamento", "faturamento2", "configuracoes"].includes(
    search.aba ?? "",
  )
    ? search.aba
    : null;
  const catalogTab =
    isClient && requestedCatalogTab !== "relatorios" ? "relatorios" : requestedCatalogTab;
  const targetView =
    catalogTab === "relatorios"
      ? "painel"
      : catalogTab === "faturamento"
        ? "colocacao"
        : catalogTab === "configuracoes"
          ? "equipamentos"
          : (catalogTab ?? "painel");
  const [view, setView] = useState<string>(targetView);
  useEffect(() => setView(targetView), [targetView]);
  const [resForm, setResForm] = useState({
    standardId: "",
    name: "",
    waste_class: "class_ii",
    unit: "kg",
    rental: "0",
    exchange: "0",
    treatment: "0",
    branchId: "",
  });
  const [standardResidueForm, setStandardResidueForm] = useState({
    name: "",
    waste_class: "class_ii",
    unit: "kg",
  });
  const [eqForm, setEqForm] = useState({
    branchId: "",
    identification: "",
    name: "",
    type: "",
    capacity: "",
    capacityUnit: "m3",
    rentalRate: "0",
  });
  const [exchangeForm, setExchangeForm] = useState({ branchId: "", equipmentId: "", residueId: "", rate: "0" });
  const [serviceForm, setServiceForm] = useState({ name: "", outsourcedCompanyId: "", rate: "0", branchId: "" });
  const [move, setMove] = useState({
    placementOrder: "",
    residue: "",
    branch: "",
    equipment: "",
    date: today(),
    hasExchange: false,
    exchangeCount: "0",
    weight: "0",
    os: "",
    mtr: "",
    destination: "",
  });
  const [placement, setPlacement] = useState({ residue: "", branch: "", equipment: "", value: "" });
  const [ticket, setTicket] = useState({
    residue: "",
    equipment: "",
    number: "",
    date: today(),
    net: "",
  });
  const [invoiceBranch, setInvoiceBranch] = useState("");
  const [invoiceResidues, setInvoiceResidues] = useState<string[]>([]);
  const [invoiceServices, setInvoiceServices] = useState<string[]>([]);
  const [editingResidue, setEditingResidue] = useState<Residue | null>(null);
  const [editingStandardResidue, setEditingStandardResidue] = useState<StandardResidueType | null>(
    null,
  );
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingMove, setEditingMove] = useState<Movement | null>(null);
  const [editingPlacement, setEditingPlacement] = useState<Movement | null>(null);
  useEffect(() => {
    if (isClient) {
      setClientId(linked ?? "");
      return;
    }
    if (!clients.length || (clientId && clients.some((client) => client.id === clientId))) return;
    const savedClientId =
      typeof window === "undefined"
        ? ""
        : sessionStorage.getItem("jacoby:faturamento:cliente") || "";
    setClientId(
      clients.some((client) => client.id === savedClientId) ? savedClientId : clients[0].id,
    );
  }, [isClient, linked, clientId, clients]);
  useEffect(() => {
    if (!isClient && clientId) sessionStorage.setItem("jacoby:faturamento:cliente", clientId);
  }, [isClient, clientId]);
  const clientQuery = <T,>(key: string, table: string) =>
    useQuery({
      queryKey: [key, clientId],
      enabled: !!clientId,
      queryFn: async () => {
        const { data, error } = await (supabase.from(table as any) as any)
          .select("*")
          .eq("client_id", clientId);
        if (error) throw error;
        return (data ?? []) as T[];
      },
    });
  const { data: residues = [] } = clientQuery<Residue>("waste-residues", "waste_residues");
  const { data: standardResidueTypes = [] } = useQuery({
    queryKey: ["standard-residue-types"],
    enabled: canConfigureMovements,
    queryFn: async () => {
      const { data, error } = await (supabase.from("waste_residue_types" as any) as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as StandardResidueType[];
    },
  });
  const { data: equipment = [] } = clientQuery<Equipment>("waste-equipment", "waste_equipment");
  const { data: equipmentOptions = [] } = useQuery({
    queryKey: ["waste-equipment-options"],
    enabled: canConfigureMovements,
    queryFn: async () => {
      const { data, error } = await (supabase.from("waste_equipment_options" as any) as any)
        .select("id,option_type,name,active")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as EquipmentOption[];
    },
  });
  const { data: services = [] } = clientQuery<Service>("waste-services", "waste_services");
  const { data: outsourcedCompanies = [] } = useQuery({
    queryKey: ["outsourced-companies"],
    enabled: canConfigureMovements,
    queryFn: async () => {
      const { data, error } = await (supabase.from("outsourced_companies" as any) as any)
        .select("id,legal_name,trade_name,logo_url")
        .eq("active", true)
        .order("legal_name");
      if (error) throw error;
      return (data || []) as OutsourcedCompany[];
    },
  });
  const { data: outsourcedCompanyServices = [] } = useQuery({
    queryKey: ["outsourced-company-services"],
    enabled: canConfigureMovements,
    queryFn: async () => {
      const { data, error } = await (supabase.from("outsourced_company_services" as any) as any)
        .select("outsourced_company_id,waste_service_id,waste_services(id,name,active,branch_id)");
      if (error) throw error;
      return (data || []) as OutsourcedCompanyService[];
    },
  });
  const { data: clientServiceRates = [] } = useQuery({
    queryKey: ["waste-client-service-rates", clientId],
    enabled: Boolean(clientId && canConfigureMovements),
    queryFn: async () => {
      const { data, error } = await (supabase.from("waste_client_service_rates" as any) as any)
        .select("client_id,waste_service_id,default_rate")
        .eq("client_id", clientId);
      if (error) throw error;
      return (data || []) as ClientServiceRate[];
    },
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["client-branches", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_branches" as any) as any)
        .select("id,name,legal_name,cnpj,address,responsible,phone,email,is_active")
        .eq("client_id", clientId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });
  const { data: reports = [] } = useQuery({
    queryKey: ["waste-reports", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("waste_reports" as any) as any)
        .select("id,period_start,period_end,status")
        .eq("client_id", clientId)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Report[];
    },
  });
  useEffect(() => {
    const reportForPeriod = reports.find((item) => item.period_start === `${period}-01`);
    setReportId(reportForPeriod?.id || "");
  }, [clientId, period, reports]);
  const report = reports.find((r) => r.id === reportId);
  useEffect(() => {
    if (isAdmin && report?.status === "draft") {
      void (supabase.from("waste_reports" as any) as any)
        .update({ status: "published" })
        .eq("id", report.id)
        .then(() => void qc.invalidateQueries({ queryKey: ["waste-reports", clientId] }));
    }
  }, [isAdmin, report?.id, report?.status, clientId, qc]);
  const reportQuery = <T,>(key: string, table: string) =>
    useQuery({
      queryKey: [key, reportId],
      enabled: !!reportId,
      queryFn: async () => {
        const { data, error } = await (supabase.from(table as any) as any)
          .select("*")
          .eq("report_id", reportId);
        if (error) throw error;
        return (data ?? []) as T[];
      },
    });
  const { data: moves = [] } = reportQuery<Movement>("waste-movements", "waste_movements");
  const { data: rates = [] } = reportQuery<Rate>("waste-rates", "waste_billing_rates");
  const { data: reportServices = [] } = reportQuery<ReportService>(
    "waste-report-services",
    "waste_report_services",
  );
  const { data: tickets = [] } = reportQuery<Ticket>("waste-tickets", "waste_weighing_tickets");
  const reportIds = reports.map((item) => item.id);
  const { data: reportHistoryMoves = [] } = useQuery({
    queryKey: ["waste-report-history", clientId, reportIds.join(",")],
    enabled: !!clientId && reportIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase.from("waste_movements" as any) as any)
        .select("*")
        .in("report_id", reportIds);
      if (error) throw error;
      return (data ?? []) as Movement[];
    },
  });
  // O gráfico do portal também soma as coletas confirmadas dos boletins já
  // publicados ao cliente, além do histórico importado nos relatórios mensais.
  const { data: bulletinChartMoves = [] } = useQuery({
    queryKey: ["waste-bulletin-chart-moves", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("jacoby_client_chart_bulletin_movements", { p_client_id: clientId });
      if (error) throw error;
      return ((data ?? []) as Pick<Movement, "id" | "occurred_on" | "weight_kg" | "waste_residue_id" | "branch_id" | "service_order">[]).map((item) => ({
        ...item, equipment_id: null, operation_type: "movement", placed_quantity: 0, removed_quantity: 0, mtr_number: null, destination_name: null,
      }) as Movement);
    },
  });
  const allClientMoves = useMemo(() => [...reportHistoryMoves, ...bulletinChartMoves], [reportHistoryMoves, bulletinChartMoves]);
  const active = residues.filter((r) => r.active);
  const activeEq = equipment.filter((e) => e.active);
  const vehicleModelOptions = uniqueOptionNames(
    equipmentOptions
      .filter((item) => item.option_type === "vehicle_model")
      .map((item) => item.name),
  );
  const recipientOptions = uniqueOptionNames(
    equipmentOptions.filter((item) => item.option_type === "recipient").map((item) => item.name),
  );
  const activeServices = services.filter((s) => s.active);
  const serviceCatalog = useMemo(() => {
    const catalog = outsourcedCompanyServices
      .map((link) => link.waste_services)
      .filter((service): service is NonNullable<typeof service> => Boolean(service?.active));
    const currentClientOnly = activeServices.filter((service) =>
      !outsourcedCompanyServices.some((link) => link.waste_service_id === service.id),
    );
    return [...catalog, ...currentClientOnly]
      .filter((service, index, all) => all.findIndex((item) => item.id === service.id) === index)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [activeServices, outsourcedCompanyServices]);
  const equipmentForExchangeScope = equipment.filter(
    (item) => branchKey(item.branch_id) === exchangeForm.branchId,
  );
  const selectedExchangeEquipment = equipmentForExchangeScope.find(
    (item) => item.id === exchangeForm.equipmentId,
  );
  const residuesForExchangeEquipment = residues.filter(
    (residue) =>
      residue.active &&
      (!residue.branch_id || residue.branch_id === selectedExchangeEquipment?.branch_id),
  );
  const outsourcedCompanyForService = (serviceId: string) =>
    outsourcedCompanyServices.find((link) => link.waste_service_id === serviceId)
      ?.outsourced_company_id || "";
  const outsourcedCompaniesForService = (serviceId: string) => {
    const companyIds = outsourcedCompanyServices
      .filter((link) => link.waste_service_id === serviceId)
      .map((link) => link.outsourced_company_id);
    const labels = Array.from(new Set(companyIds)).map((companyId) => {
      const company = outsourcedCompanies.find((item) => item.id === companyId);
      return company?.trade_name || company?.legal_name || "Terceirizada";
    });
    return labels.join(", ") || "Sem terceirizada";
  };
  const serviceRateForClient = (serviceId: string) =>
    Number(clientServiceRates.find((rate) => rate.waste_service_id === serviceId)?.default_rate || 0);
  const refreshClient = () =>
    ["waste-residues", "waste-equipment", "waste-services", "waste-client-service-rates", "client-branches"].forEach(
      (key) => void qc.invalidateQueries({ queryKey: [key, clientId] }),
    );
  const refreshReport = () =>
    ["waste-movements", "waste-rates", "waste-report-services", "waste-tickets"].forEach(
      (key) => void qc.invalidateQueries({ queryKey: [key, reportId] }),
    );
  const refreshStandardResidueTypes = () =>
    void qc.invalidateQueries({ queryKey: ["standard-residue-types"] });
  const refreshEquipmentOptions = () =>
    void qc.invalidateQueries({ queryKey: ["waste-equipment-options"] });
  const addResidue = useMutation({
    mutationFn: async () => {
      if (!clientId || !resForm.name) throw Error("Informe o tipo de resíduo.");
      const payload = {
        client_id: clientId,
        branch_id: branchToDb(resForm.branchId),
        name: resForm.name,
        waste_class: resForm.waste_class,
        unit: resForm.unit,
        default_rental_rate: Number(resForm.rental),
        default_exchange_rate: Number(resForm.exchange),
        default_treatment_rate: Number(resForm.treatment),
      };
      const query = supabase.from("waste_residues" as any) as any;
      const { error } = editingResidue
        ? await query.update(payload).eq("id", editingResidue.id)
        : await query.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingResidue ? "Resíduo atualizado." : "Resíduo cadastrado.");
      setEditingResidue(null);
      setResForm({
        standardId: "",
        name: "",
        waste_class: "class_ii",
        unit: "kg",
        rental: "0",
        exchange: "0",
        treatment: "0",
        branchId: "",
      });
      refreshClient();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveStandardResidueType = useMutation({
    mutationFn: async () => {
      if (!standardResidueForm.name.trim()) throw Error("Informe o tipo padrão de resíduo.");
      const payload = {
        name: standardResidueForm.name.trim(),
        waste_class: standardResidueForm.waste_class,
        unit: standardResidueForm.unit,
        active: true,
      };
      const query = supabase.from("waste_residue_types" as any) as any;
      const { error } = editingStandardResidue
        ? await query.update(payload).eq("id", editingStandardResidue.id)
        : await query.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingStandardResidue ? "Tipo padrão atualizado." : "Tipo padrão cadastrado.");
      setEditingStandardResidue(null);
      setStandardResidueForm({ name: "", waste_class: "class_ii", unit: "kg" });
      refreshStandardResidueTypes();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addEquipment = useMutation({
    mutationFn: async () => {
      const hasActiveBranches = branches.some((branch) => branch.is_active);
      if (!clientId || !eqForm.name.trim() || !eqForm.type.trim())
        throw Error("Informe veículo/modelo e recipiente.");
      if (hasActiveBranches && !eqForm.branchId)
        throw Error("Selecione a filial ou pátio deste equipamento.");
      if (!Number.isFinite(Number(eqForm.rentalRate)) || Number(eqForm.rentalRate) < 0)
        throw Error("Informe um valor de locação válido.");
      const payload = {
        client_id: clientId,
        branch_id: branchToDb(eqForm.branchId),
        identification: eqForm.identification.trim() || null,
        name: eqForm.name.trim(),
        equipment_type: eqForm.type.trim(),
        category: "cacamba",
        capacity_value: eqForm.capacity ? Number(eqForm.capacity) : null,
        capacity_unit: eqForm.capacityUnit,
        monthly_rental_rate: Number(eqForm.rentalRate || 0),
      };
      const query = supabase.from("waste_equipment" as any) as any;
      const { error } = editingEquipment
        ? await query.update(payload).eq("id", editingEquipment.id)
        : await query.insert(payload);
      if (error) throw error;
      // O valor de locação deve entrar nos boletins ainda abertos. Boletins
      // finalizados mantêm a taxa histórica com que foram emitidos.
      if (editingEquipment) {
        const { data: draftCycles, error: cyclesError } = await (
          supabase.from("billing_v2_cycles" as any) as any
        )
          .select("id")
          .eq("client_id", clientId)
          .eq("status", "draft");
        if (cyclesError) throw cyclesError;
        const cycleIds = (draftCycles || []).map((cycle: { id: string }) => cycle.id);
        if (cycleIds.length) {
          const { error: placementsError } = await (
            supabase.from("billing_v2_placements" as any) as any
          )
            .update({ monthly_rental_rate: Number(eqForm.rentalRate || 0) })
            .in("cycle_id", cycleIds)
            .eq("equipment_id", editingEquipment.id);
          if (placementsError) throw placementsError;
        }
      }
      const existingVehicleModel = equipmentOptions.find(
        (item) =>
          item.option_type === "vehicle_model" && optionKey(item.name) === optionKey(payload.name),
      );
      const existingRecipient = equipmentOptions.find(
        (item) =>
          item.option_type === "recipient" &&
          optionKey(item.name) === optionKey(payload.equipment_type),
      );
      const { error: optionError } = await (
        supabase.from("waste_equipment_options" as any) as any
      ).upsert(
        [
          { option_type: "vehicle_model", name: existingVehicleModel?.name ?? payload.name },
          { option_type: "recipient", name: existingRecipient?.name ?? payload.equipment_type },
        ],
        { onConflict: "option_type,name" },
      );
      if (optionError) throw optionError;
    },
    onSuccess: () => {
      toast.success(editingEquipment ? "Equipamento atualizado." : "Equipamento cadastrado.");
      setEditingEquipment(null);
      setEqForm({
        branchId: "",
        identification: "",
        name: "",
        type: "",
        capacity: "",
        capacityUnit: "m3",
        rentalRate: "0",
      });
      refreshClient();
      refreshEquipmentOptions();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveExchangeRate = useMutation({
    mutationFn: async () => {
      const selectedEquipment = equipment.find((item) => item.id === exchangeForm.equipmentId);
      if (!selectedEquipment) throw Error("Selecione um equipamento.");
      if (!Number.isFinite(Number(exchangeForm.rate)) || Number(exchangeForm.rate) < 0)
        throw Error("Informe um valor de troca válido.");
      const { error } = await (supabase.from("waste_equipment" as any) as any)
        .update({
          exchange_rate: Number(exchangeForm.rate || 0),
          default_waste_residue_id: exchangeForm.residueId || null,
        })
        .eq("id", selectedEquipment.id);
      if (error) throw error;
      // O valor configurado deve entrar nos boletins ainda abertos. Boletins
      // finalizados mantêm a taxa histórica com que foram emitidos.
      const { data: draftCycles, error: cyclesError } = await (
        supabase.from("billing_v2_cycles" as any) as any
      )
        .select("id")
        .eq("client_id", clientId)
        .eq("status", "draft");
      if (cyclesError) throw cyclesError;
      const cycleIds = (draftCycles || []).map((cycle: { id: string }) => cycle.id);
      if (cycleIds.length) {
        const { error: movementsError } = await (
          supabase.from("billing_v2_movements" as any) as any
        )
          .update({ exchange_rate: Number(exchangeForm.rate || 0) })
          .in("cycle_id", cycleIds)
          .eq("equipment_id", selectedEquipment.id);
        if (movementsError) throw movementsError;
      }
    },
    onSuccess: () => {
      toast.success("Configuração de troca atualizada.");
      refreshClient();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const addService = useMutation({
    mutationFn: async () => {
      if (!clientId || !serviceForm.name.trim()) throw Error("Informe o nome do serviço.");
      const normalizedName = optionKey(serviceForm.name);
      const query = supabase.from("waste_services" as any) as any;
      let serviceId = editingService?.id || "";
      if (editingService) {
        const { error } = await query.update({ name: serviceForm.name.trim(), branch_id: branchToDb(serviceForm.branchId) }).eq("id", editingService.id);
        if (error) throw error;
      } else {
        const existing = serviceForm.outsourcedCompanyId
          ? outsourcedCompanyServices.find((link) =>
              link.outsourced_company_id === serviceForm.outsourcedCompanyId &&
              optionKey(link.waste_services?.name || "") === normalizedName &&
              branchKey(link.waste_services?.branch_id) === branchKey(branchToDb(serviceForm.branchId)),
            )
          : undefined;
        if (existing) serviceId = existing.waste_service_id;
        else {
          const { data: saved, error } = await query
            .insert({ client_id: clientId, name: serviceForm.name.trim(), default_rate: 0, branch_id: branchToDb(serviceForm.branchId) })
            .select("id").single();
          if (error) throw error;
          serviceId = saved?.id as string;
        }
      }
      if (serviceForm.outsourcedCompanyId) {
        const { error: linkError } = await (supabase.from("outsourced_company_services" as any) as any)
          .upsert({ outsourced_company_id: serviceForm.outsourcedCompanyId, waste_service_id: serviceId }, { onConflict: "outsourced_company_id,waste_service_id" });
        if (linkError) throw linkError;
      }
      const { error: rateError } = await (supabase.from("waste_client_service_rates" as any) as any)
        .upsert({ client_id: clientId, waste_service_id: serviceId, default_rate: Number(serviceForm.rate || 0) }, { onConflict: "client_id,waste_service_id" });
      if (rateError) throw rateError;
    },
    onSuccess: () => {
      toast.success(editingService ? "Serviço atualizado." : "Serviço cadastrado.");
      setEditingService(null);
      setServiceForm({ name: "", outsourcedCompanyId: "", rate: "0", branchId: "" });
      refreshClient();
      void qc.invalidateQueries({ queryKey: ["outsourced-company-services"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const createReport = useMutation({
    mutationFn: async () => {
      if (!clientId) throw Error("Selecione o cliente antes de abrir o faturamento.");
      const [y, m] = period.split("-").map(Number);
      const { data: existing, error: existingError } = await (
        supabase.from("waste_reports" as any) as any
      )
        .select("id")
        .eq("client_id", clientId)
        .eq("period_start", `${period}-01`)
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return { id: existing.id as string, created: false };
      const { data, error } = await (supabase.from("waste_reports" as any) as any)
        .insert({
          client_id: clientId,
          period_start: `${period}-01`,
          period_end: new Date(y, m, 0).toISOString().slice(0, 10),
          status: "published",
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id as string, created: true };
    },
    onSuccess: ({ id, created }) => {
      setReportId(id);
      void qc.invalidateQueries({ queryKey: ["waste-reports", clientId] });
      toast.success(
        created ? "Faturamento aberto para este período." : "Faturamento existente aberto.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addMove = useMutation({
    mutationFn: async () => {
      if (!reportId)
        throw Error("Selecione ou crie um relatório antes de registrar a movimentação.");
      if (!move.branch) throw Error("Selecione a filial ou pátio da movimentação.");
      if (!move.placementOrder) throw Error("Selecione a ordem de colocação do equipamento.");
      const placementOrder = moves.find(
        (item) => item.id === move.placementOrder && isContainerPlacement(item),
      );
      if (!placementOrder || placementOrder.branch_id !== move.branch)
        throw Error("A ordem selecionada não pertence à filial ou pátio informado.");
      const exchangeCount = move.hasExchange ? Number(move.exchangeCount) : 0;
      if (move.hasExchange && (!Number.isFinite(exchangeCount) || exchangeCount <= 0))
        throw Error("Informe quantos equipamentos foram retirados na troca.");
      const payload = {
        report_id: reportId,
        waste_residue_id: placementOrder.waste_residue_id,
        branch_id: placementOrder.branch_id,
        equipment_id: placementOrder.equipment_id,
        container_placement_id: placementOrder.id,
        operation_type: "movement",
        occurred_on: move.date,
        service_order: move.os || null,
        placed_quantity: exchangeCount,
        removed_quantity: exchangeCount,
        weight_kg: Number(move.weight),
        mtr_number: move.mtr || null,
        destination_name: move.destination || null,
      };
      const query = supabase.from("waste_movements" as any) as any;
      const { error } = editingMove
        ? await query.update(payload).eq("id", editingMove.id)
        : await query.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      setInvoiceBranch(move.branch);
      toast.success(editingMove ? "Movimentação atualizada." : "Movimentação registrada.");
      setEditingMove(null);
      setMove({
        placementOrder: "",
        residue: "",
        branch: "",
        equipment: "",
        date: today(),
        hasExchange: false,
        exchangeCount: "0",
        weight: "0",
        os: "",
        mtr: "",
        destination: "",
      });
      refreshReport();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addPlacement = useMutation({
    mutationFn: async () => {
      if (!reportId) throw Error("Selecione ou crie um relatório antes de registrar a colocação.");
      if (!placement.residue) throw Error("Selecione o resíduo.");
      if (!placement.branch) throw Error("Selecione a filial ou pátio.");
      if (!placement.equipment) throw Error("Selecione o equipamento.");
      if (Number(placement.value) <= 0) throw Error("Informe o valor da colocação.");
      const payload = {
        report_id: reportId,
        waste_residue_id: placement.residue,
        branch_id: placement.branch,
        equipment_id: placement.equipment,
        occurred_on: editingPlacement?.occurred_on || today(),
        operation_type: "container_placement",
        placement_value: Number(placement.value),
        service_order: null,
        placed_quantity: 0,
        removed_quantity: 0,
        weight_kg: 0,
        mtr_number: null,
        destination_name: null,
      };
      const query = supabase.from("waste_movements" as any) as any;
      const { error } = editingPlacement
        ? await query.update(payload).eq("id", editingPlacement.id)
        : await query.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      setInvoiceBranch(placement.branch);
      toast.success(
        editingPlacement ? "Colocação atualizada." : "Colocação de equipamento registrada.",
      );
      setEditingPlacement(null);
      setPlacement({ residue: "", branch: "", equipment: "", value: "" });
      refreshReport();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeRecord = async (table: string, id: string, refresh: () => void, label: string) => {
    if (!window.confirm(`Excluir ${label}?`)) return;
    const { error } = await (supabase.from(table as any) as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(`${label} excluído.`);
      refresh();
    }
  };
  const deleteService = async (service: Service) => {
    if (!window.confirm(`Excluir ${service.name} e seus lançamentos de teste nos demonstrativos?`))
      return;
    const { error: reportServiceError } = await (
      supabase.from("waste_report_services" as any) as any
    )
      .delete()
      .eq("waste_service_id", service.id);
    if (reportServiceError) {
      toast.error(reportServiceError.message);
      return;
    }
    const { error } = await (supabase.from("waste_services" as any) as any)
      .delete()
      .eq("id", service.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Serviço excluído.");
      refreshClient();
      refreshReport();
    }
  };
  const addTicket = useMutation({
    mutationFn: async () => {
      if (!reportId || !ticket.residue) throw Error("Selecione o resíduo.");
      const eq = equipment.find((e) => e.id === ticket.equipment);
      const { error } = await (supabase.from("waste_weighing_tickets" as any) as any).insert({
        report_id: reportId,
        waste_residue_id: ticket.residue,
        equipment_id: ticket.equipment || null,
        ticket_number: ticket.number || null,
        weighed_on: ticket.date,
        vehicle_plate: eq?.plate || null,
        net_weight_kg: ticket.net ? Number(ticket.net) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket registrado.");
      refreshReport();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const operationalMoves = moves.filter((move) => !isContainerPlacement(move));
  const placements = moves.filter(isContainerPlacement);
  const rows = useMemo(
    () =>
      active
        .filter(
          (residue) =>
            operationalMoves.some((move) => move.waste_residue_id === residue.id) &&
            !rates.find((r) => r.waste_residue_id === residue.id)?.excluded,
        )
        .map((residue) => {
          const ms = operationalMoves.filter((m) => m.waste_residue_id === residue.id);
          const rate = rates.find((r) => r.waste_residue_id === residue.id);
          const placed = ms.reduce(
              (s, m) => s + Number(m.placed_quantity || 0) - Number(m.removed_quantity || 0),
              0,
            ),
            exchanges = ms.reduce((s, m) => s + Number(m.removed_quantity || 0), 0),
            weight = ms.reduce((s, m) => s + Number(m.weight_kg || 0), 0);
          const rental = Number(rate?.rental_rate ?? residue.default_rental_rate),
            exchange = Number(rate?.exchange_rate ?? residue.default_exchange_rate),
            treatment = Number(rate?.treatment_rate ?? residue.default_treatment_rate);
          return {
            residue,
            placed,
            exchanges,
            weight,
            rental,
            exchange,
            treatment,
            total: placed * rental + exchanges * exchange + weight * treatment,
          };
        }),
    [active, operationalMoves, rates],
  );
  const serviceRows = activeServices
    .filter(
      (service) => !reportServices.find((item) => item.waste_service_id === service.id)?.excluded,
    )
    .map((service) => ({
      service,
      rate: Number(reportServices.find((item) => item.waste_service_id === service.id)?.rate ?? 0),
    }));
  const servicesTotal = serviceRows.reduce((sum, item) => sum + item.rate, 0);
  const placementTotal = placements.reduce(
    (sum, item) => sum + Number(item.placement_value || 0),
    0,
  );
  const total = rows.reduce((s, r) => s + r.total, 0) + servicesTotal + placementTotal;
  const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
  const billingBranchId =
    invoiceBranch || placements[0]?.branch_id || operationalMoves[0]?.branch_id || "";
  const selectedBranch = branches.find((branch) => branch.id === billingBranchId);
  const branchRows = selectedBranch
    ? rows.map((row) => {
        const ms = operationalMoves.filter(
          (m) => m.branch_id === selectedBranch.id && m.waste_residue_id === row.residue.id,
        );
        const placed = ms.reduce(
            (s, m) => s + Number(m.placed_quantity || 0) - Number(m.removed_quantity || 0),
            0,
          ),
          exchanges = ms.reduce((s, m) => s + Number(m.removed_quantity || 0), 0),
          weight = ms.reduce((s, m) => s + Number(m.weight_kg || 0), 0);
        return {
          ...row,
          placed,
          exchanges,
          weight,
          total: placed * row.rental + exchanges * row.exchange + weight * row.treatment,
        };
      })
    : rows;
  const invoiceRows = branchRows.filter(
    (row) => invoiceResidues.includes(row.residue.id) && row.total > 0,
  );
  const invoiceServiceRows = serviceRows.filter(
    (row) => invoiceServices.includes(row.service.id) && row.rate > 0,
  );
  const invoicePlacementRows = placements.filter((item) => item.branch_id === billingBranchId);
  const invoicePlacementTotal = invoicePlacementRows.reduce(
    (sum, row) => sum + Number(row.placement_value || 0),
    0,
  );
  const invoiceTotal =
    invoiceRows.reduce((sum, row) => sum + row.total, 0) +
    invoiceServiceRows.reduce((sum, row) => sum + row.rate, 0) +
    invoicePlacementTotal;
  useEffect(() => {
    setInvoiceBranch("");
  }, [reportId]);
  useEffect(() => {
    if (!invoiceBranch) {
      const firstBranch = placements[0]?.branch_id || moves.find((m) => m.branch_id)?.branch_id;
      if (firstBranch) setInvoiceBranch(firstBranch);
    }
  }, [moves, placements, invoiceBranch]);
  useEffect(() => {
    if (!invoiceResidues.length && rows.length)
      setInvoiceResidues(rows.map((row) => row.residue.id));
    if (!invoiceServices.length && serviceRows.length)
      setInvoiceServices(serviceRows.map((row) => row.service.id));
  }, [reportId, rows.length, serviceRows.length]);
  const saveRate = async (
    r: (typeof rows)[number],
    field: "rental_rate" | "exchange_rate" | "treatment_rate",
    value: string,
  ) => {
    const existing = rates.find((x) => x.waste_residue_id === r.residue.id);
    const { error } = await (supabase.from("waste_billing_rates" as any) as any).upsert(
      {
        id: existing?.id,
        report_id: reportId,
        waste_residue_id: r.residue.id,
        rental_rate: existing?.rental_rate ?? r.rental,
        exchange_rate: existing?.exchange_rate ?? r.exchange,
        treatment_rate: existing?.treatment_rate ?? r.treatment,
        [field]: Number(value || 0),
      },
      { onConflict: "report_id,waste_residue_id" },
    );
    if (error) toast.error(error.message);
    else refreshReport();
  };
  const removeFromReport = async (r: (typeof rows)[number]) => {
    if (
      !window.confirm(
        `Remover ${r.residue.name} somente deste relatório? O cadastro do resíduo será mantido.`,
      )
    )
      return;
    const existing = rates.find((x) => x.waste_residue_id === r.residue.id);
    const { error } = await (supabase.from("waste_billing_rates" as any) as any).upsert(
      {
        id: existing?.id,
        report_id: reportId,
        waste_residue_id: r.residue.id,
        rental_rate: existing?.rental_rate ?? r.rental,
        exchange_rate: existing?.exchange_rate ?? r.exchange,
        treatment_rate: existing?.treatment_rate ?? r.treatment,
        excluded: true,
      },
      { onConflict: "report_id,waste_residue_id" },
    );
    if (error) toast.error(error.message);
    else {
      toast.success("Item removido deste relatório.");
      refreshReport();
    }
  };
  const pdf = async () => {
    if (!report) return;
    if (!selectedBranch) {
      toast.error("Selecione a filial ou pátio do demonstrativo.");
      return;
    }
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const client = clients.find((c) => c.id === clientId);
    const pageWidth = 210;
    doc.setFillColor(62, 122, 79);
    doc.rect(0, 0, pageWidth, 50, "F");
    doc.setFillColor(101, 163, 84);
    doc.circle(196, 9, 18, "F");
    doc.setFillColor(138, 190, 92);
    doc.circle(205, 20, 17, "F");
    doc.setDrawColor(187, 215, 139);
    doc.setLineWidth(0.7);
    doc.line(182, 37, 198, 22);
    doc.line(191, 31, 185, 25);
    doc.line(194, 27, 202, 26);
    doc.setFillColor(250, 253, 249);
    doc.roundedRect(12, 6, 47, 35, 3, 3, "F");
    doc.setDrawColor(210, 229, 205);
    doc.setLineWidth(0.35);
    doc.roundedRect(12, 6, 47, 35, 3, 3, "S");
    try {
      const image = new Image();
      image.src = jacobyLogo;
      await image.decode();
      doc.addImage(image, "PNG", 15, 10, 41, 25);
    } catch {}
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(17);
    doc.setFont("helvetica", "bold");
    doc.text("DEMONSTRATIVO DE FATURAMENTO", 65, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Período: ${formatDate(report.period_start)} a ${formatDate(report.period_end)}`,
      65,
      28,
    );
    doc.text(client?.name || "Cliente", 65, 35);
    let y = 60;
    doc.setFillColor(244, 248, 242);
    doc.roundedRect(14, y, 182, 31, 3, 3, "F");
    doc.setDrawColor(184, 210, 176);
    doc.roundedRect(14, y, 182, 31, 3, 3, "S");
    doc.setTextColor(39, 61, 45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(selectedBranch.name, 20, y + 9);
    const branchDetails = [
      selectedBranch.legal_name,
      selectedBranch.cnpj && `CNPJ: ${selectedBranch.cnpj}`,
      selectedBranch.address,
      selectedBranch.responsible && `Responsável: ${selectedBranch.responsible}`,
      selectedBranch.phone,
      selectedBranch.email,
    ]
      .filter(Boolean)
      .join(" · ");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(93, 112, 97);
    const detailLines = doc.splitTextToSize(
      branchDetails || "Dados cadastrais não informados.",
      168,
    );
    doc.text(detailLines, 20, y + 16);
    y += 40;
    doc.setFillColor(35, 96, 58);
    doc.roundedRect(14, y, 182, 9, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("ITEM", 20, y + 6);
    doc.text("TIPO", 104, y + 6);
    doc.text("QUANTIDADE", 139, y + 6);
    doc.text("VALOR", 190, y + 6, { align: "right" });
    y += 9;
    const items = [
      ...invoiceRows.map((row) => ({
        name: row.residue.name,
        type: "Resíduo",
        quantity: `${n(row.weight)} ${row.residue.unit}`,
        value: row.total,
      })),
      ...invoicePlacementRows.map((item) => ({
        name: `Colocação · ${equipmentLabel(equipment.find((e) => e.id === item.equipment_id))}`,
        type: residues.find((r) => r.id === item.waste_residue_id)?.name || "Resíduo",
        quantity: "Equipamento",
        value: Number(item.placement_value || 0),
      })),
      ...invoiceServiceRows.map((row) => ({
        name: row.service.name,
        type: "Serviço",
        quantity: "Avulso",
        value: row.rate,
      })),
    ];
    if (!items.length) {
      doc.setTextColor(93, 112, 97);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Nenhum item selecionado.", 20, y + 12);
      y += 18;
    } else {
      items.forEach((item, index) => {
        if (index % 2 === 0) {
          doc.setFillColor(247, 250, 246);
          doc.rect(14, y, 182, 10, "F");
        }
        doc.setTextColor(39, 61, 45);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(item.name, 20, y + 6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(93, 112, 97);
        doc.text(item.type, 104, y + 6.5);
        doc.text(item.quantity, 139, y + 6.5);
        doc.setTextColor(39, 61, 45);
        doc.text(money(item.value), 190, y + 6.5, { align: "right" });
        y += 10;
      });
    }
    y += 8;
    doc.setFillColor(232, 244, 226);
    doc.roundedRect(118, y, 78, 18, 3, 3, "F");
    doc.setTextColor(35, 96, 58);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("TOTAL DO DEMONSTRATIVO", 124, y + 7);
    doc.setFontSize(14);
    doc.text(money(invoiceTotal), 190, y + 14, { align: "right" });
    doc.setDrawColor(153, 190, 125);
    doc.setLineWidth(0.35);
    doc.line(14, 274, 196, 274);
    doc.setFillColor(232, 244, 226);
    doc.circle(22, 281, 5, "F");
    doc.setDrawColor(65, 131, 71);
    doc.setLineWidth(0.5);
    doc.line(22, 285, 22, 278);
    doc.line(22, 281, 18, 279);
    doc.line(22, 281, 26, 278);
    doc.setTextColor(93, 112, 97);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Jacoby Soluções Ambientais · Gestão responsável de resíduos", 31, 283);
    doc.text("Soluções que respeitam o meio ambiente.", 196, 283, { align: "right" });
    doc.save(
      `demonstrativo-${selectedBranch.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${report.period_start}.pdf`,
    );
  };
  const saveServiceRate = async (item: (typeof serviceRows)[number], value: string) => {
    const existing = reportServices.find((row) => row.waste_service_id === item.service.id);
    const { error } = await (supabase.from("waste_report_services" as any) as any).upsert(
      {
        id: existing?.id,
        report_id: reportId,
        waste_service_id: item.service.id,
        rate: Number(value || 0),
      },
      { onConflict: "report_id,waste_service_id" },
    );
    if (error) toast.error(error.message);
    else refreshReport();
  };
  const setServiceIncluded = async (service: Service, included: boolean) => {
    const existing = reportServices.find((row) => row.waste_service_id === service.id);
    const { error } = await (supabase.from("waste_report_services" as any) as any).upsert(
      {
        id: existing?.id,
        report_id: reportId,
        waste_service_id: service.id,
        rate: existing?.rate ?? 0,
        excluded: !included,
      },
      { onConflict: "report_id,waste_service_id" },
    );
    if (error) toast.error(error.message);
    else refreshReport();
  };
  const pageTitle =
    catalogTab === "relatorios"
      ? "Relatórios de resíduos"
      : catalogTab === "faturamento"
        ? "Faturamento"
        : catalogTab === "configuracoes"
          ? "Configurações de movimentação"
          : "Gestão de Resíduos";
  if (loading || (isClient && !linked))
    return <div className="p-6 text-sm text-muted-foreground">Carregando o portal do cliente…</div>;
  // Mantém o faturamento legado intocado: a versão 2 possui componente e tabelas próprios.
  if (requestedCatalogTab === "faturamento2" && canManageBilling) return <BillingV2Module />;
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">
            {portal ? "Portal do Cliente" : "Controle ambiental integrado"}
          </p>
          <h1 className="text-2xl font-bold">{pageTitle}</h1>
        </div>
        {!catalogTab && report && (
          <Button onClick={() => void pdf()}>
            <Download className="mr-2 h-4 w-4" />
            Gerar PDF
          </Button>
        )}
      </header>
      {catalogTab ? (
        <Card
          className={
            catalogTab === "faturamento" ? "grid gap-3 p-4 md:grid-cols-3" : "max-w-xl p-4"
          }
        >
          <Field label="Cliente">
            {isClient ? (
              <p className="mt-2 font-medium">{clients.find((c) => c.id === clientId)?.name}</p>
            ) : (
              <Select
                value={clientId}
                onValueChange={(v) => {
                  setClientId(v);
                  setReportId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          {catalogTab === "faturamento" && isAdmin && (
            <>
              <Field label="Período do faturamento">
                <Input
                  type="month"
                  value={period}
                  onChange={(event) => setPeriod(event.target.value)}
                />
              </Field>
              <Button className="self-end" onClick={() => createReport.mutate()}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                {reportId ? "Abrir para editar" : "Abrir faturamento"}
              </Button>
            </>
          )}
        </Card>
      ) : (
        <Card className="grid gap-3 p-4 md:grid-cols-4">
          <Field label="Cliente">
            {isClient ? (
              <p className="mt-2 font-medium">{clients.find((c) => c.id === clientId)?.name}</p>
            ) : (
              <Select
                value={clientId}
                onValueChange={(v) => {
                  setClientId(v);
                  setReportId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Relatório">
            <Select value={reportId} onValueChange={setReportId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {reports.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.period_start} · {r.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {isAdmin && (
            <>
              <Field label="Novo período">
                <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
              </Field>
              <Button className="self-end" onClick={() => createReport.mutate()}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                Novo relatório
              </Button>
            </>
          )}
        </Card>
      )}
      {catalogTab === "faturamento" && view === "faturamento" && (
        <InvoiceConfigurator
          clientName={clients.find((client) => client.id === clientId)?.name || "Cliente"}
          branch={selectedBranch}
          rows={rows}
          selectedResidues={invoiceResidues}
          onResidues={setInvoiceResidues}
          services={serviceRows}
          selectedServices={invoiceServices}
          onServices={setInvoiceServices}
          placements={invoicePlacementRows.map((placementItem) => ({
            id: placementItem.id,
            equipment: equipmentLabel(
              equipment.find((equipmentItem) => equipmentItem.id === placementItem.equipment_id),
            ),
            residue:
              residues.find((residue) => residue.id === placementItem.waste_residue_id)?.name ||
              "Resíduo",
            value: Number(placementItem.placement_value || 0),
          }))}
          total={invoiceTotal}
          onEdit={() => setView("movimentos")}
          onGenerate={() => void pdf()}
        />
      )}
      <Tabs value={view} onValueChange={setView}>
        {catalogTab === "faturamento" && (
          <TabsList>
            <TabsTrigger value="colocacao">Colocação de equipamento</TabsTrigger>
            <TabsTrigger value="movimentos">Movimentações</TabsTrigger>
            <TabsTrigger value="faturamento">Demonstrativo de faturamento</TabsTrigger>
          </TabsList>
        )}
        {!catalogTab && (
          <TabsList className="h-auto w-full justify-start overflow-x-auto">
            <TabsTrigger value="painel">Relatórios</TabsTrigger>
            <TabsTrigger value="movimentos">Faturamento · movimentações</TabsTrigger>
            <TabsTrigger value="faturamento">Faturamento · demonstrativo</TabsTrigger>
            {isAdmin && <TabsTrigger value="servicos">Cadastro de serviços</TabsTrigger>}
          </TabsList>
        )}
        <TabsContent value="painel" className="space-y-4">
          <AnnualWasteReport
            moves={catalogTab === "relatorios" ? allClientMoves : moves}
            branches={branches}
            residues={residues}
            clientName={clients.find((client) => client.id === clientId)?.name || "Cliente"}
            year={reportYear}
            month={reportMonth}
            onYear={setReportYear}
            onMonth={setReportMonth}
          />
        </TabsContent>
        <TabsContent value="residuos" className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold">{editingResidue ? "Editar resíduo" : "Novo resíduo"}</h2>
            <p className="text-sm text-muted-foreground">
              O demonstrativo puxa estas categorias e os valores cadastrados.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              <Field label="Filial ou pátio">
                <Select value={resForm.branchId || BRANCH_MATRIZ} onValueChange={(value) => setResForm({ ...resForm, branchId: value === BRANCH_MATRIZ ? "" : value })}>
                  <SelectTrigger><SelectValue placeholder="Matriz (sem filial/pátio)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BRANCH_MATRIZ}>Matriz (sem filial/pátio)</SelectItem>
                    {branches.filter((branch) => branch.is_active).map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              {isAdmin && (
                <Field label="Tipo padrão">
                  <Select
                    value={resForm.standardId || "manual"}
                    onValueChange={(value) => {
                      if (value === "manual") {
                        setResForm({ ...resForm, standardId: "" });
                        return;
                      }
                      const standard = standardResidueTypes.find((item) => item.id === value);
                      if (!standard) return;
                      setResForm({
                        ...resForm,
                        standardId: standard.id,
                        name: standard.name,
                        waste_class: standard.waste_class,
                        unit: standard.unit,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Digite manualmente ou selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Digitar manualmente</SelectItem>
                      {standardResidueTypes
                        .filter((item) => item.active)
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="Tipo">
                <Input
                  value={resForm.name}
                  onChange={(e) => setResForm({ ...resForm, name: e.target.value })}
                />
              </Field>
              <Field label="Classe">
                <Select
                  value={resForm.waste_class}
                  onValueChange={(v) => setResForm({ ...resForm, waste_class: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="class_i">Classe I</SelectItem>
                    <SelectItem value="class_ii">Classe II</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Locação">
                <Input
                  type="number"
                  value={resForm.rental}
                  onChange={(e) => setResForm({ ...resForm, rental: e.target.value })}
                />
              </Field>
              <Field label="Troca">
                <Input
                  type="number"
                  value={resForm.exchange}
                  onChange={(e) => setResForm({ ...resForm, exchange: e.target.value })}
                />
              </Field>
              <Field label="Tratamento/kg">
                <Input
                  type="number"
                  value={resForm.treatment}
                  onChange={(e) => setResForm({ ...resForm, treatment: e.target.value })}
                />
              </Field>
              <div className="flex gap-2 self-end">
                <Button onClick={() => addResidue.mutate()}>
                  {editingResidue ? "Salvar" : "Cadastrar"}
                </Button>
                {editingResidue && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingResidue(null);
                      setResForm({
                        standardId: "",
                        name: "",
                        waste_class: "class_ii",
                        unit: "kg",
                        rental: "0",
                        exchange: "0",
                        treatment: "0",
                        branchId: "",
                      });
                    }}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          </Card>
          <ActionTable
            headers={["Resíduo", "Filial/pátio", "Classe", "Locação", "Troca", "Tratamento/kg", "Ações"]}
            rows={residues.map((r) => [
              r.name,
              branches.find((branch) => branch.id === r.branch_id)?.name || "Matriz (sem filial/pátio)",
              r.waste_class === "class_i" ? "Classe I" : "Classe II",
              money(r.default_rental_rate),
              money(r.default_exchange_rate),
              money(r.default_treatment_rate),
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  title="Editar"
                  onClick={() => {
                    setEditingResidue(r);
                    setResForm({
                      standardId: "",
                      name: r.name,
                      waste_class: r.waste_class,
                      unit: r.unit,
                      rental: String(r.default_rental_rate),
                      exchange: String(r.default_exchange_rate),
                      treatment: String(r.default_treatment_rate),
                      branchId: branchKey(r.branch_id),
                    });
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Excluir"
                  onClick={() =>
                    void removeRecord("waste_residues", r.id, refreshClient, "resíduo")
                  }
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>,
            ])}
          />
        </TabsContent>
        <TabsContent value="servicos" className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold">{editingService ? "Editar serviço" : "Novo serviço"}</h2>
            <p className="text-sm text-muted-foreground">
              O serviço terceirizado é único e fica disponível para todos os clientes. Defina abaixo o
              valor padrão somente para o cliente selecionado; no BM ele pode ser ajustado caso a caso.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <Field label="Nome do serviço">
                <Input
                  value={serviceForm.name}
                  onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                />
              </Field>
              <Field label="Valor para este cliente">
                <Input type="number" min="0" step="0.01" value={serviceForm.rate} onChange={(e) => setServiceForm({ ...serviceForm, rate: e.target.value })} />
              </Field>
              <Field label="Terceirizada inicial (opcional)">
                <Select
                  value={serviceForm.outsourcedCompanyId || "none"}
                  onValueChange={(value) =>
                    setServiceForm({ ...serviceForm, outsourcedCompanyId: value === "none" ? "" : value })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem terceirizada</SelectItem>
                    {outsourcedCompanies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>{company.trade_name || company.legal_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Filial ou pátio">
                <Select value={serviceForm.branchId || BRANCH_MATRIZ} onValueChange={(value) => setServiceForm({ ...serviceForm, branchId: value === BRANCH_MATRIZ ? "" : value })}>
                  <SelectTrigger><SelectValue placeholder="Matriz (sem filial/pátio)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BRANCH_MATRIZ}>Matriz (sem filial/pátio)</SelectItem>
                    {branches.filter((branch) => branch.is_active).map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex gap-2 self-end">
                <Button onClick={() => addService.mutate()}>
                  {editingService ? "Salvar" : "Cadastrar"}
                </Button>
                {editingService && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingService(null);
                      setServiceForm({ name: "", outsourcedCompanyId: "", rate: "0", branchId: "" });
                    }}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          </Card>
          <ActionTable
            headers={["Serviço", "Empresa terceirizada", "Valor para este cliente", "Ações"]}
            rows={serviceCatalog.map((s) => [
              s.name,
              outsourcedCompaniesForService(s.id),
              money(serviceRateForClient(s.id)),
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  title="Editar"
                  onClick={() => {
                    setEditingService(s);
                    setServiceForm({ name: s.name, outsourcedCompanyId: outsourcedCompanyForService(s.id), rate: String(serviceRateForClient(s.id)), branchId: branchKey(s.branch_id) });
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Excluir"
                  onClick={() => void deleteService(s)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>,
            ])}
          />
        </TabsContent>
        <TabsContent value="equipamentos" className="space-y-4">
          <Tabs defaultValue="equipamentos" className="space-y-4">
            <TabsList className="h-auto rounded-none bg-transparent p-0">
              <TabsTrigger
                value="equipamentos"
                className="rounded-lg border border-border bg-card px-4 py-2 shadow-sm data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5 data-[state=active]:text-primary"
              >
                Cadastro de equipamentos
              </TabsTrigger>
              <TabsTrigger
                value="servicos"
                className="rounded-lg border border-border bg-card px-4 py-2 shadow-sm data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5 data-[state=active]:text-primary"
              >
                Cadastro de serviços
              </TabsTrigger>
              <TabsTrigger
                value="residuos"
                className="rounded-lg border border-border bg-card px-4 py-2 shadow-sm data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5 data-[state=active]:text-primary"
              >
                Resíduos e valores
              </TabsTrigger>
              <TabsTrigger
                value="valores"
                className="rounded-lg border border-border bg-card px-4 py-2 shadow-sm data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5 data-[state=active]:text-primary"
              >
                Troca
              </TabsTrigger>
              <TabsTrigger
                value="comissionamento"
                className="rounded-lg border border-border bg-card px-4 py-2 shadow-sm data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5 data-[state=active]:text-primary"
              >
                Comissionamento
              </TabsTrigger>
            </TabsList>
            <TabsContent value="equipamentos" className="space-y-4">
              <BillingImpactNote>
                <strong>Alimenta o Faturamento →</strong> o <strong>Valor da locação</strong> cadastrado aqui vira a linha <strong>Locação de equipamentos</strong> do BM. Os equipamentos também aparecem como opção nas abas <strong>Locação</strong> e <strong>Movimentações</strong> do boletim. O valor por troca fica na aba <strong>Troca</strong>.
              </BillingImpactNote>
              <Card className="p-4">
                <h2 className="font-semibold">
                  {editingEquipment ? "Editar equipamento" : "Novo equipamento"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Selecione uma sugestão já cadastrada ou digite uma nova opção. Ao salvar, ela
                  ficará disponível para os próximos cadastros.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="Filial ou pátio">
                    {branches.some((branch) => branch.is_active) ? (
                      <Select
                        value={eqForm.branchId}
                        onValueChange={(value) => setEqForm({ ...eqForm, branchId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={BRANCH_MATRIZ}>Matriz (sem filial/pátio)</SelectItem>
                          {branches.filter((branch) => branch.is_active).map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value="Matriz (sem filial/pátio)" readOnly className="bg-muted/40 text-muted-foreground" />
                    )}
                  </Field>
                  <Field label="Identificação">
                    <Input
                      placeholder="Ex.: CAÇ-001"
                      value={eqForm.identification}
                      onChange={(event) =>
                        setEqForm({ ...eqForm, identification: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Veículo/Modelo">
                    <CreatableOptionInput
                      options={vehicleModelOptions}
                      placeholder="Selecione ou digite um modelo"
                      value={eqForm.name}
                      onChange={(value) => setEqForm({ ...eqForm, name: value })}
                    />
                  </Field>
                  <Field label="Recipiente">
                    <CreatableOptionInput
                      options={recipientOptions}
                      placeholder="Selecione ou digite um recipiente"
                      value={eqForm.type}
                      onChange={(value) => setEqForm({ ...eqForm, type: value })}
                    />
                  </Field>
                  <Field label="Capacidade">
                    <div className="grid grid-cols-[minmax(120px,1fr)_minmax(150px,170px)] gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Quantidade"
                        value={eqForm.capacity}
                        onChange={(e) => setEqForm({ ...eqForm, capacity: e.target.value })}
                      />
                      <Select
                        value={eqForm.capacityUnit}
                        onValueChange={(value) => setEqForm({ ...eqForm, capacityUnit: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="m3">Metro cúbico (m³)</SelectItem>
                          <SelectItem value="metro">Metro (m)</SelectItem>
                          <SelectItem value="tonelada">Toneladas</SelectItem>
                          <SelectItem value="litros">Litros</SelectItem>
                          <SelectItem value="kg">KG</SelectItem>
                          <SelectItem value="unidade">Unidade (un.)</SelectItem>
                          <SelectItem value="granel">Granel</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </Field>
                  <Field label="Valor da locação">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={eqForm.rentalRate}
                      onChange={(event) => setEqForm({ ...eqForm, rentalRate: event.target.value })}
                      placeholder="0,00"
                    />
                  </Field>
                  <div className="flex gap-2 self-end">
                    <Button onClick={() => addEquipment.mutate()}>
                      {editingEquipment ? "Salvar" : "Cadastrar"}
                    </Button>
                    {editingEquipment && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingEquipment(null);
                          setEqForm({
                            branchId: "",
                            identification: "",
                            name: "",
                            type: "",
                          capacity: "",
                          capacityUnit: "m3",
                          rentalRate: "0",
                          });
                        }}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
              <ActionTable
                headers={["Pátio", "Identificação", "Veículo/Modelo", "Recipiente", "Capacidade", "Ações"]}
                rows={equipment
                  .filter((equipmentItem) => !eqForm.branchId || branchKey(equipmentItem.branch_id) === eqForm.branchId)
                  .map((e) => [
                  branches.find((branch) => branch.id === e.branch_id)?.name || "Sem filial/pátio",
                  e.identification || "—",
                  e.name,
                  e.equipment_type,
                    e.capacity_value !== null
                    ? `${n(e.capacity_value)} ${capacityUnitLabel(e.capacity_unit)}`
                    : e.capacity_m3 !== null
                      ? `${n(e.capacity_m3)} m³`
                      : "—",
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Editar"
                      onClick={() => {
                        setEditingEquipment(e);
                        setEqForm({
                          branchId: branchKey(e.branch_id),
                          identification: e.identification || "",
                          name: e.name,
                          type: e.equipment_type,
                          capacity:
                            e.capacity_value !== null
                              ? String(e.capacity_value)
                              : e.capacity_m3 === null
                                ? ""
                                : String(e.capacity_m3),
                          capacityUnit: e.capacity_value !== null ? e.capacity_unit : "m3",
                          rentalRate: String(Number(e.monthly_rental_rate || 0)),
                        });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Excluir"
                      onClick={() =>
                        void removeRecord("waste_equipment", e.id, refreshClient, "equipamento")
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>,
                  ])}
              />
            </TabsContent>
            <TabsContent value="servicos" className="space-y-4">
              <BillingImpactNote>
                <span className="block font-semibold text-foreground">Como cadastrar um serviço</span>
                <span className="mt-1 block"><strong>1. Serviço base:</strong> informe o serviço, a matriz/filial/pátio e o valor padrão.</span>
                <span className="block"><strong>2. Valor específico (opcional):</strong> use somente se esse serviço tiver outro valor para determinada terceirizada ou filial/pátio. Nesse caso, o valor específico substitui o padrão apenas naquela combinação.</span>
                <span className="mt-1 block text-xs">Exemplo: valor padrão R$ 300; Cortes no Pátio 1 por R$ 250. No BM da Cortes para o Pátio 1 será usado R$ 250; nos demais casos, R$ 300.</span>
              </BillingImpactNote>
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">1</span>
                  <div>
                    <h2 className="font-semibold">
                      {editingService ? "Editar serviço base" : "Cadastrar serviço base"}
                    </h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Informe o serviço, quem o executa, onde ele pode ser usado e seu valor padrão para este cliente.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_minmax(210px,1.2fr)_minmax(190px,1fr)_minmax(140px,0.7fr)_auto]">
                  <Field label="Nome do serviço">
                    <Input
                      value={serviceForm.name}
                      onChange={(event) =>
                        setServiceForm({ ...serviceForm, name: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Terceirizada inicial (opcional)">
                    <Select
                      value={serviceForm.outsourcedCompanyId || "none"}
                      onValueChange={(value) => setServiceForm({ ...serviceForm, outsourcedCompanyId: value === "none" ? "" : value })}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem terceirizada</SelectItem>
                        {outsourcedCompanies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>{company.trade_name || company.legal_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Matriz, filial ou pátio">
                    <Select
                      value={serviceForm.branchId || BRANCH_MATRIZ}
                      onValueChange={(value) => setServiceForm({ ...serviceForm, branchId: value === BRANCH_MATRIZ ? "" : value })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={BRANCH_MATRIZ}>Matriz (serviço geral)</SelectItem>
                        {branches.filter((branch) => branch.is_active).map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Valor padrão">
                    <Input type="number" min="0" step="0.01" value={serviceForm.rate} onChange={(event) => setServiceForm({ ...serviceForm, rate: event.target.value })} />
                  </Field>
                  <div className="flex gap-2 self-end">
                    <Button onClick={() => addService.mutate()}>
                      {editingService ? "Salvar serviço" : "Cadastrar serviço"}
                    </Button>
                    {editingService && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingService(null);
                          setServiceForm({ name: "", outsourcedCompanyId: "", rate: "0", branchId: "" });
                        }}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
              <ActionTable
                headers={["Serviço", "Empresa terceirizada", "Abrangência", "Valor padrão", "Ações"]}
                rows={serviceCatalog.map((service) => [
                  service.name,
                  outsourcedCompaniesForService(service.id),
                  branches.find((branch) => branch.id === service.branch_id)?.name || "Matriz (serviço geral)",
                  money(serviceRateForClient(service.id)),
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Editar"
                      onClick={() => {
                        setEditingService(service);
                        setServiceForm({ name: service.name, outsourcedCompanyId: outsourcedCompanyForService(service.id), rate: String(serviceRateForClient(service.id)), branchId: branchKey(service.branch_id) });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Excluir"
                      onClick={() => void deleteService(service)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>,
                ])}
              />
              <ServiceRateOverridesPanel
                clientId={clientId}
                services={serviceCatalog}
                companies={outsourcedCompanies}
                branches={branches.filter((branch) => branch.is_active)}
              />
            </TabsContent>
            <TabsContent value="residuos" className="space-y-4">
              <BillingImpactNote>
                <strong>Alimenta o Faturamento →</strong> o <strong>valor de tratamento por kg</strong> (por filial/pátio) vira a linha <strong>Tratamento de resíduos</strong> do BM, calculada como <strong>peso × valor</strong> e lançada nas <strong>Movimentações</strong>. Os resíduos também viram opção na Locação e Movimentações.
              </BillingImpactNote>
              <ResidueBranchConfig clientId={clientId} branches={branches} residues={residues} onSaved={refreshClient} />
            </TabsContent>
            <TabsContent value="valores" className="space-y-4">
              <BillingImpactNote>
                <strong>Alimenta o Faturamento →</strong> o <strong>valor por troca</strong> de cada equipamento vira a linha <strong>Troca de equipamentos</strong> do BM, aplicado a cada troca confirmada nas <strong>Movimentações</strong>. Alterar aqui atualiza os BMs <strong>em edição</strong>; os já finalizados mantêm o valor da época.
              </BillingImpactNote>
              <Card className="p-4">
                <h2 className="font-semibold">Valor por troca</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Selecione a matriz ou o pátio, depois o equipamento. O BM usa este valor quando esse equipamento for retirado em uma troca.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="Filial ou pátio">
                    <Select
                      value={exchangeForm.branchId}
                      onValueChange={(value) => setExchangeForm({ branchId: value, equipmentId: "", residueId: "", rate: "0" })}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={BRANCH_MATRIZ}>Matriz (sem filial/pátio)</SelectItem>
                        {branches.filter((branch) => branch.is_active).map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Equipamento">
                    <Select
                      value={exchangeForm.equipmentId}
                      disabled={!exchangeForm.branchId}
                      onValueChange={(value) => {
                        const selected = equipmentForExchangeScope.find((item) => item.id === value);
                        setExchangeForm({
                          ...exchangeForm,
                          equipmentId: value,
                          residueId: selected?.default_waste_residue_id || "",
                          rate: String(Number(selected?.exchange_rate || 0)),
                        });
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecionar equipamento" /></SelectTrigger>
                      <SelectContent>
                        {equipmentForExchangeScope.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {[item.identification, item.name, item.equipment_type].filter(Boolean).join(" · ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Resíduo padrão da troca">
                    <Select
                      value={exchangeForm.residueId || "none"}
                      disabled={!exchangeForm.equipmentId}
                      onValueChange={(value) =>
                        setExchangeForm({ ...exchangeForm, residueId: value === "none" ? "" : value })
                      }
                    >
                      <SelectTrigger><SelectValue placeholder="Selecionar resíduo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Não definir resíduo</SelectItem>
                        {residuesForExchangeEquipment.map((residue) => (
                          <SelectItem key={residue.id} value={residue.id}>{residue.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Valor da troca">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!exchangeForm.equipmentId}
                      value={exchangeForm.rate}
                      onChange={(event) => setExchangeForm({ ...exchangeForm, rate: event.target.value })}
                    />
                  </Field>
                  <Button className="self-end" disabled={!exchangeForm.equipmentId || saveExchangeRate.isPending} onClick={() => saveExchangeRate.mutate()}>
                    {saveExchangeRate.isPending ? "Salvando..." : "Salvar valor"}
                  </Button>
                </div>
                {exchangeForm.branchId && (
                  <ActionTable
                    headers={["Equipamento", "Resíduo padrão", "Valor da troca"]}
                    rows={equipmentForExchangeScope.map((item) => [
                      [item.identification, item.name, item.equipment_type].filter(Boolean).join(" · "),
                      residues.find((residue) => residue.id === item.default_waste_residue_id)?.name || "Não definido",
                      money(Number(item.exchange_rate || 0)),
                    ])}
                  />
                )}
              </Card>
            </TabsContent>
            <TabsContent value="comissionamento" className="space-y-4">
              <BillingImpactNote tone="amber">
                <strong>Não entra no total nem no PDF do BM.</strong> As taxas de comissão cadastradas aqui alimentam o relatório de <strong>Comissões</strong> no <strong>Financeiro</strong> — calculadas automaticamente quando um BM emitido por <strong>empresa terceirizada</strong> é finalizado.
              </BillingImpactNote>
              <CommissionSettingsPanel
                clientId={clientId}
                residues={residues}
                branches={branches}
                companies={outsourcedCompanies}
              />
            </TabsContent>
            {canConfigureMovements && (
              <TabsContent value="configuracoes" className="space-y-4">
                <Card className="p-4">
                  <h2 className="font-semibold">
                    {editingStandardResidue ? "Editar tipo padrão" : "Novo tipo padrão de resíduo"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Esta lista é padrão do sistema. Ao cadastrar um resíduo para um cliente, basta
                    selecioná-lo e definir os valores específicos daquele cliente.
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <Field label="Nome do tipo">
                      <Input
                        value={standardResidueForm.name}
                        onChange={(event) =>
                          setStandardResidueForm({
                            ...standardResidueForm,
                            name: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Classe">
                      <Select
                        value={standardResidueForm.waste_class}
                        onValueChange={(value) =>
                          setStandardResidueForm({ ...standardResidueForm, waste_class: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="class_i">Classe I</SelectItem>
                          <SelectItem value="class_ii">Classe II</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Unidade padrão">
                      <Select
                        value={standardResidueForm.unit}
                        onValueChange={(value) =>
                          setStandardResidueForm({ ...standardResidueForm, unit: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="kg">KG</SelectItem>
                          <SelectItem value="litros">Litros</SelectItem>
                          <SelectItem value="unidade">Unidade</SelectItem>
                          <SelectItem value="tonelada">Tonelada</SelectItem>
                          <SelectItem value="m3">Metro cúbico</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <div className="flex gap-2 self-end">
                      <Button onClick={() => saveStandardResidueType.mutate()}>
                        {editingStandardResidue ? "Salvar" : "Cadastrar"}
                      </Button>
                      {editingStandardResidue && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingStandardResidue(null);
                            setStandardResidueForm({
                              name: "",
                              waste_class: "class_ii",
                              unit: "kg",
                            });
                          }}
                        >
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
                <ActionTable
                  headers={["Tipo padrão", "Classe", "Unidade", "Ações"]}
                  rows={standardResidueTypes.map((item) => [
                    item.name,
                    item.waste_class === "class_i" ? "Classe I" : "Classe II",
                    item.unit === "m3" ? "Metro cúbico" : item.unit,
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Editar"
                        onClick={() => {
                          setEditingStandardResidue(item);
                          setStandardResidueForm({
                            name: item.name,
                            waste_class: item.waste_class,
                            unit: item.unit,
                          });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Excluir"
                        onClick={() =>
                          void removeRecord(
                            "waste_residue_types",
                            item.id,
                            refreshStandardResidueTypes,
                            "tipo padrão",
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>,
                  ])}
                />
              </TabsContent>
            )}
          </Tabs>
        </TabsContent>
        <TabsContent value="movimentos" className="space-y-4">
          {isAdmin && (
            <Card className="p-4">
              <h2 className="font-semibold">
                {editingMove ? "Editar movimentação" : "Nova movimentação"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Escolha a filial e a ordem de colocação. O equipamento e o resíduo serão puxados da
                ordem.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                <Field label="Filial ou pátio">
                  <Select
                    value={move.branch}
                    onValueChange={(v) => {
                      setMove((current) => ({
                        ...current,
                        branch: v,
                        placementOrder: "",
                        residue: "",
                        equipment: "",
                      }));
                      setInvoiceBranch(v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches
                        .filter((b) => b.is_active)
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Ordem de colocação">
                  <Select
                    value={move.placementOrder}
                    disabled={!move.branch}
                    onValueChange={(value) => {
                      const order = placements.find((item) => item.id === value);
                      setMove((current) => ({
                        ...current,
                        placementOrder: value,
                        residue: order?.waste_residue_id || "",
                        equipment: order?.equipment_id || "",
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          move.branch ? "Selecionar ordem" : "Selecione a filial primeiro"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {placements
                        .filter((item) => item.branch_id === move.branch)
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            Ordem #{item.id.slice(-6).toUpperCase()} ·{" "}
                            {equipmentLabel(equipment.find((e) => e.id === item.equipment_id))}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Equipamento da ordem">
                  <Input
                    readOnly
                    value={equipmentLabel(equipment.find((item) => item.id === move.equipment))}
                    placeholder="Selecionada pela ordem"
                  />
                </Field>
                <Field label="Resíduo da ordem">
                  <Input
                    readOnly
                    value={residues.find((item) => item.id === move.residue)?.name || ""}
                    placeholder="Selecionado pela ordem"
                  />
                </Field>
                <Field label="Data">
                  <Input
                    type="date"
                    value={move.date}
                    onChange={(e) => setMove({ ...move, date: e.target.value })}
                  />
                </Field>
                <Field label="Peso kg">
                  <Input
                    type="number"
                    value={move.weight}
                    onChange={(e) => setMove({ ...move, weight: e.target.value })}
                  />
                </Field>
                <div className="flex items-end pb-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={move.hasExchange}
                      onCheckedChange={(checked) =>
                        setMove((current) => ({
                          ...current,
                          hasExchange: checked === true,
                          exchangeCount: checked === true ? current.exchangeCount || "1" : "0",
                        }))
                      }
                    />
                    Houve troca de equipamento?
                  </label>
                </div>
                {move.hasExchange && (
                  <Field label="Equipamentos retirados na troca">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={move.exchangeCount}
                      onChange={(event) =>
                        setMove((current) => ({ ...current, exchangeCount: event.target.value }))
                      }
                    />
                  </Field>
                )}
                <Field label="MTR">
                  <Input
                    value={move.mtr}
                    onChange={(e) => setMove({ ...move, mtr: e.target.value })}
                  />
                </Field>
                <Field label="Destinação">
                  <Input
                    value={move.destination}
                    onChange={(e) => setMove({ ...move, destination: e.target.value })}
                  />
                </Field>
                <div className="flex gap-2 self-end">
                  <Button onClick={() => addMove.mutate()}>
                    {editingMove ? "Salvar" : "Registrar"}
                  </Button>
                  {editingMove && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingMove(null);
                        setMove({
                          placementOrder: "",
                          residue: "",
                          branch: "",
                          equipment: "",
                          date: today(),
                          hasExchange: false,
                          exchangeCount: "0",
                          weight: "0",
                          os: "",
                          mtr: "",
                          destination: "",
                        });
                      }}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}
          <ActionTable
            headers={["Data", "Filial", "Ordem", "Equipamento", "Resíduo", "Peso", "MTR", "Ações"]}
            rows={operationalMoves.map((m) => [
              formatDate(m.occurred_on),
              branches.find((b) => b.id === m.branch_id)?.name || "—",
              m.container_placement_id
                ? `#${m.container_placement_id.slice(-6).toUpperCase()}`
                : "—",
              equipmentLabel(equipment.find((e) => e.id === m.equipment_id)),
              residues.find((r) => r.id === m.waste_residue_id)?.name || "—",
              `${n(m.weight_kg)} kg`,
              m.mtr_number || "—",
              isAdmin ? (
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Editar"
                    onClick={() => {
                      setEditingMove(m);
                      setInvoiceBranch(m.branch_id || "");
                      setMove({
                        placementOrder: m.container_placement_id || "",
                        residue: m.waste_residue_id || "",
                        branch: m.branch_id || "",
                        equipment: m.equipment_id || "",
                        date: m.occurred_on,
                        hasExchange: Number(m.removed_quantity || 0) > 0,
                        exchangeCount: String(m.removed_quantity || 0),
                        weight: String(m.weight_kg || 0),
                        os: m.service_order || "",
                        mtr: m.mtr_number || "",
                        destination: m.destination_name || "",
                      });
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Excluir"
                    onClick={() =>
                      void removeRecord("waste_movements", m.id, refreshReport, "movimentação")
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ) : (
                "—"
              ),
            ])}
          />
        </TabsContent>
        <TabsContent value="colocacao" className="space-y-4">
          {isAdmin && (
            <Card className="p-4">
              <h2 className="font-semibold">
                {editingPlacement
                  ? "Editar colocação de equipamento"
                  : "Nova colocação de equipamento"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Cada colocação é um lançamento individual e segue como item próprio para o
                demonstrativo.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <Field label="Filial ou pátio">
                  <Select
                    value={placement.branch}
                    onValueChange={(value) => {
                      setPlacement((current) => ({ ...current, branch: value }));
                      setInvoiceBranch(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches
                        .filter((branch) => branch.is_active)
                        .map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Equipamento">
                  <Select
                    value={placement.equipment}
                    onValueChange={(value) =>
                      setPlacement((current) => ({ ...current, equipment: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar equipamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeEq.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {equipmentLabel(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Resíduo">
                  <ResidueSelect
                    residues={active}
                    value={placement.residue}
                    onChange={(value) =>
                      setPlacement((current) => ({ ...current, residue: value }))
                    }
                  />
                </Field>
                <Field label="Valor da locação">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    value={placement.value}
                    onChange={(event) =>
                      setPlacement((current) => ({ ...current, value: event.target.value }))
                    }
                  />
                </Field>
                <div className="flex gap-2 self-end">
                  <Button onClick={() => addPlacement.mutate()}>
                    {editingPlacement ? "Salvar" : "Registrar colocação"}
                  </Button>
                  {editingPlacement && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingPlacement(null);
                        setPlacement({ residue: "", branch: "", equipment: "", value: "" });
                      }}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}
          <ActionTable
            headers={[
              "Ordem",
              "Filial ou pátio",
              "Equipamento",
              "Resíduo",
              "Valor da locação",
              "Ações",
            ]}
            rows={placements.map((item) => [
              `#${item.id.slice(-6).toUpperCase()}`,
              branches.find((branch) => branch.id === item.branch_id)?.name || "—",
              equipmentLabel(
                equipment.find((equipmentItem) => equipmentItem.id === item.equipment_id),
              ),
              residues.find((residue) => residue.id === item.waste_residue_id)?.name || "—",
              money(Number(item.placement_value || 0)),
              isAdmin ? (
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Editar"
                    onClick={() => {
                      setEditingPlacement(item);
                      setInvoiceBranch(item.branch_id || "");
                      setPlacement({
                        branch: item.branch_id || "",
                        equipment: item.equipment_id || "",
                        residue: item.waste_residue_id || "",
                        value: String(item.placement_value || 0),
                      });
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Excluir"
                    onClick={() =>
                      void removeRecord("waste_movements", item.id, refreshReport, "colocação")
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ) : (
                "—"
              ),
            ])}
          />
        </TabsContent>
        <TabsContent value="faturamento">
          <Tabs defaultValue="locacao">
            <TabsList>
              <TabsTrigger value="locacao">Valor da locação</TabsTrigger>
              <TabsTrigger value="troca">Cobrança por troca</TabsTrigger>
              <TabsTrigger value="tratamento">Tratamento</TabsTrigger>
              <TabsTrigger value="servicos">Serviços</TabsTrigger>
              <TabsTrigger value="total">Total</TabsTrigger>
            </TabsList>
            {[
              ["locacao", "rental_rate", "Locação"] as const,
              ["troca", "exchange_rate", "Valor por troca (uma por outra)"] as const,
              ["tratamento", "treatment_rate", "Tratamento/kg"] as const,
            ].map(([tab, field, label]) => (
              <TabsContent key={tab} value={tab}>
                <BillingTable
                  rows={rows}
                  label={label}
                  field={field}
                  admin={isAdmin}
                  save={saveRate}
                  remove={removeFromReport}
                />
              </TabsContent>
            ))}
            <TabsContent value="servicos">
              <ServiceReportTable
                services={activeServices}
                reportServices={reportServices}
                admin={isAdmin}
                onToggle={setServiceIncluded}
                onRate={saveServiceRate}
              />
            </TabsContent>
            <TabsContent value="total">
              <SimpleTable
                headers={["Resíduo", "Locação", "Troca", "Tratamento", "Total"]}
                rows={rows.map((r) => [
                  r.residue.name,
                  money(r.placed * r.rental),
                  money(r.exchanges * r.exchange),
                  money(r.weight * r.treatment),
                  money(r.total),
                ])}
              />
              {serviceRows.length > 0 && (
                <SimpleTable
                  headers={["Serviço", "Valor"]}
                  rows={serviceRows.map((item) => [item.service.name, money(item.rate)])}
                />
              )}
              {placements.length > 0 && (
                <SimpleTable
                  headers={["Filial ou pátio", "Equipamento", "Resíduo", "Valor"]}
                  rows={placements.map((item) => [
                    branches.find((branch) => branch.id === item.branch_id)?.name || "—",
                    equipmentLabel(
                      equipment.find((equipmentItem) => equipmentItem.id === item.equipment_id),
                    ),
                    residues.find((residue) => residue.id === item.waste_residue_id)?.name || "—",
                    money(Number(item.placement_value || 0)),
                  ])}
                />
              )}
              <Card className="p-4 text-right font-bold">Total geral: {money(total)}</Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="tickets" className="space-y-4">
          {isAdmin && (
            <Card className="p-4">
              <h2 className="font-semibold">Novo ticket</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                <Field label="Resíduo">
                  <ResidueSelect
                    residues={active}
                    value={ticket.residue}
                    onChange={(v) => setTicket({ ...ticket, residue: v })}
                  />
                </Field>
                <Field label="Equipamento">
                  <Select
                    value={ticket.equipment}
                    onValueChange={(v) => setTicket({ ...ticket, equipment: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeEq.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                          {e.plate ? ` · ${e.plate}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Data">
                  <Input
                    type="date"
                    value={ticket.date}
                    onChange={(e) => setTicket({ ...ticket, date: e.target.value })}
                  />
                </Field>
                <Field label="Peso líquido">
                  <Input
                    type="number"
                    value={ticket.net}
                    onChange={(e) => setTicket({ ...ticket, net: e.target.value })}
                  />
                </Field>
                <Button className="self-end" onClick={() => addTicket.mutate()}>
                  Registrar
                </Button>
              </div>
            </Card>
          )}
          <SimpleTable
            headers={["Data", "Resíduo", "Equipamento", "Placa", "Peso"]}
            rows={tickets.map((t) => [
              t.weighed_on || "—",
              residues.find((r) => r.id === t.waste_residue_id)?.name || "—",
              equipment.find((e) => e.id === t.equipment_id)?.name || "—",
              t.vehicle_plate || "—",
              `${n(Number(t.net_weight_kg || 0))} kg`,
            ])}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
function Metric({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex justify-between text-muted-foreground">
        <span>{title}</span>
        {icon}
      </div>
      <strong className="mt-2 block text-xl">{value}</strong>
    </Card>
  );
}
function AnnualWasteReport({
  moves,
  branches,
  residues,
  clientName,
  year,
  month,
  onYear,
  onMonth,
}: {
  moves: Movement[];
  branches: Branch[];
  residues: Residue[];
  clientName: string;
  year: string;
  month: string;
  onYear: (value: string) => void;
  onMonth: (value: string) => void;
}) {
  const reportRef = useRef<HTMLDivElement>(null);
  const reportMoves = moves.filter((move) => !isContainerPlacement(move));
  const years = Array.from(new Set(reportMoves.map((move) => move.occurred_on.slice(0, 4)))).sort(
    (a, b) => b.localeCompare(a),
  );
  const filtered = reportMoves.filter(
    (move) =>
      move.occurred_on.slice(0, 4) === year &&
      (month === "todos" || move.occurred_on.slice(5, 7) === month),
  );
  const periodLabel =
    month === "todos"
      ? `Ano de ${year}`
      : `${new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(Number(year), Number(month) - 1, 1))} de ${year}`;
  // Agrupa pelo nome: o mesmo resíduo cadastrado em vários pátios vira uma
  // única barra, e as variações de madeira (por tipo de viagem) somam juntas.
  const residueData = Array.from(
    filtered.reduce((totals, move) => {
      const residue = residues.find((item) => item.id === move.waste_residue_id);
      if (!residue) return totals;
      const name = chartResidueName(residue.name);
      return totals.set(name, (totals.get(name) || 0) + Number(move.weight_kg || 0));
    }, new Map<string, number>()),
    ([name, kg]) => ({ name, kg }),
  )
    .filter((item) => item.kg > 0)
    .sort((a, b) => b.kg - a.kg);
  const months =
    month === "todos"
      ? Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"))
      : [month];
  const monthlyData = months.map((value) => ({
    name: new Intl.DateTimeFormat("pt-BR", { month: "short" })
      .format(new Date(Number(year), Number(value) - 1, 1))
      .replace(".", ""),
    kg: filtered
      .filter((move) => move.occurred_on.slice(5, 7) === value)
      .reduce((sum, move) => sum + Number(move.weight_kg || 0), 0),
  }));
  const days = Array.from(new Set(filtered.map((move) => move.occurred_on)))
    .sort((a, b) => b.localeCompare(a))
    .map((date) => {
      const movements = filtered.filter((move) => move.occurred_on === date);
      const units = Array.from(new Set(movements.map((move) => move.branch_id || "matriz"))).map(
        (branchId) => {
          const unitMoves = movements.filter((move) => (move.branch_id || "matriz") === branchId);
          return {
            name:
              branchId === "matriz"
                ? "Matriz"
                : branches.find((branch) => branch.id === branchId)?.name || "Filial",
            weight: unitMoves.reduce((sum, move) => sum + Number(move.weight_kg || 0), 0),
          };
        },
      );
      return { date, units, total: units.reduce((sum, unit) => sum + unit.weight, 0) };
    });
  const exportPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFillColor(62, 122, 79);
    doc.rect(0, 0, 210, 42, "F");
    doc.setFillColor(138, 190, 92);
    doc.circle(198, 12, 17, "F");
    try {
      const image = new Image();
      image.src = jacobyLogo;
      await image.decode();
      doc.addImage(image, "PNG", 14, 7, 42, 25);
    } catch {}
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("RELATÓRIO DE GESTÃO DE RESÍDUOS", 64, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(clientName, 64, 26);
    doc.text(periodLabel, 64, 33);
    let y = 54;
    doc.setTextColor(39, 61, 45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Resíduos mais movimentados", 14, y);
    doc.setFont("helvetica", "normal");
    const topResidues = residueData.slice(0, 6);
    const maxResidue = Math.max(...topResidues.map((item) => item.kg), 1);
    topResidues.forEach((item) => {
      y += 10;
      doc.setTextColor(39, 61, 45);
      doc.setFontSize(9);
      doc.text(item.name, 14, y);
      doc.setFillColor(229, 240, 225);
      doc.roundedRect(70, y - 5, 92, 5, 2, 2, "F");
      doc.setFillColor(55, 122, 74);
      doc.roundedRect(70, y - 5, (92 * item.kg) / maxResidue, 5, 2, 2, "F");
      doc.setTextColor(39, 61, 45);
      doc.text(`${n(item.kg)} kg`, 196, y, { align: "right" });
    });
    if (!topResidues.length) {
      doc.setTextColor(93, 112, 97);
      doc.text("Nenhum resíduo movimentado no período.", 14, y + 10);
      y += 10;
    }
    y += 18;
    doc.setTextColor(39, 61, 45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Evolução mensal", 14, y);
    doc.setFont("helvetica", "normal");
    const maxMonth = Math.max(...monthlyData.map((item) => item.kg), 1);
    const barWidth = monthlyData.length === 1 ? 36 : 11;
    monthlyData.forEach((item, index) => {
      const x = 18 + index * 14;
      const height = (48 * item.kg) / maxMonth;
      doc.setFillColor(127, 176, 105);
      doc.roundedRect(x, y + 54 - height, barWidth, height, 2, 2, "F");
      doc.setTextColor(93, 112, 97);
      doc.setFontSize(7);
      doc.text(item.name, x + barWidth / 2, y + 61, { align: "center" });
      if (item.kg > 0) {
        doc.setTextColor(39, 61, 45);
        doc.text(n(item.kg), x + barWidth / 2, y + 51 - height, { align: "center" });
      }
    });
    y += 75;
    doc.setFillColor(244, 248, 242);
    doc.roundedRect(14, y, 182, 27, 3, 3, "F");
    doc.setTextColor(39, 61, 45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Resumo do período", 20, y + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const totalKg = filtered.reduce((sum, move) => sum + Number(move.weight_kg || 0), 0);
    doc.text(
      `Peso movimentado: ${n(totalKg)} kg · Resíduos registrados: ${residueData.length} · Lançamentos: ${filtered.length}`,
      20,
      y + 18,
    );
    doc.setDrawColor(153, 190, 125);
    doc.line(14, 274, 196, 274);
    doc.setTextColor(93, 112, 97);
    doc.text("Jacoby Soluções Ambientais · Gestão responsável de resíduos", 14, 283);
    doc.text("Soluções que respeitam o meio ambiente.", 196, 283, { align: "right" });
    appendDetailedMovements(doc, filtered, branches, residues, clientName, periodLabel);
    doc.save(`relatorio-residuos-${year}${month === "todos" ? "" : `-${month}`}.pdf`);
  };
  return (
    <>
      <Card className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]">
        <Field label="Ano">
          <Select value={year} onValueChange={onYear}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(years.length ? years : [String(new Date().getFullYear())]).map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Mês">
          <Select value={month} onValueChange={onMonth}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os meses</SelectItem>
              {Array.from({ length: 12 }, (_, index) => {
                const value = String(index + 1).padStart(2, "0");
                return (
                  <SelectItem key={value} value={value}>
                    {new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(
                      new Date(2026, index, 1),
                    )}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </Field>
        <Button className="self-end" onClick={() => void exportPdf()}>
          <Download className="mr-2 h-4 w-4" />
          Exportar PDF
        </Button>
      </Card>
      <div ref={reportRef} className="space-y-4 bg-background p-1">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm text-primary">Relatório de gestão de resíduos</p>
          <h2 className="text-xl font-bold">{clientName}</h2>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
        </div>
        <Suspense fallback={<div className="h-64 rounded-lg border bg-card" />}>
          <WasteReportCharts residueData={residueData} monthlyData={monthlyData} formatWeight={n} />
        </Suspense>
        <Card className="p-4">
          <h2 className="font-semibold">Resumo dos resíduos</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {residueData.map((item) => (
              <div key={item.name} className="rounded-md bg-muted/50 p-3">
                <strong className="block">{item.name}</strong>
                <span className="text-sm text-primary">{n(item.kg)} kg</span>
              </div>
            ))}
            {!residueData.length && (
              <p className="text-sm text-muted-foreground">
                Nenhum resíduo movimentado no período.
              </p>
            )}
          </div>
        </Card>
      </div>
      <div className="space-y-3">
        {days.map((day) => (
          <Card key={day.date} className="p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
              <h2 className="font-semibold">{formatDate(day.date)}</h2>
              <span className="text-sm text-muted-foreground">Movimentações do dia</span>
            </div>
            <div className="space-y-2 py-3">
              {day.units.map((unit) => (
                <div key={unit.name} className="flex items-center justify-between text-sm">
                  <span>{unit.name}</span>
                  <strong>{n(unit.weight)} kg</strong>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 text-right">
              <span className="mr-2 text-sm text-muted-foreground">Total do dia</span>
              <strong className="text-primary">{n(day.total)} kg</strong>
            </div>
          </Card>
        ))}
        {!days.length && (
          <Card className="p-8 text-center text-muted-foreground">
            Nenhuma movimentação encontrada no período selecionado.
          </Card>
        )}
      </div>
    </>
  );
}
function appendDetailedMovements(
  doc: any,
  moves: Movement[],
  branches: Branch[],
  residues: Residue[],
  clientName: string,
  periodLabel: string,
) {
  doc.addPage();
  doc.setFillColor(62, 122, 79);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("MOVIMENTAÇÕES POR FILIAL", 14, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${clientName} · ${periodLabel}`, 14, 20);
  let y = 40;
  doc.setFillColor(232, 244, 226);
  doc.roundedRect(14, y, 182, 8, 2, 2, "F");
  doc.setTextColor(39, 61, 45);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("DATA", 18, y + 5);
  doc.text("FILIAL / PÁTIO", 48, y + 5);
  doc.text("RESÍDUO", 107, y + 5);
  doc.text("KG", 192, y + 5, { align: "right" });
  y += 14;
  moves
    .slice()
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
    .forEach((move, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      if (index % 2 === 0) {
        doc.setFillColor(247, 250, 246);
        doc.rect(14, y - 5, 182, 8, "F");
      }
      doc.setTextColor(39, 61, 45);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(formatDate(move.occurred_on), 18, y);
      doc.text(
        move.branch_id
          ? branches.find((branch) => branch.id === move.branch_id)?.name || "Filial"
          : "Matriz",
        48,
        y,
      );
      doc.text(
        residues.find((residue) => residue.id === move.waste_residue_id)?.name || "—",
        107,
        y,
      );
      doc.text(`${n(move.weight_kg)} kg`, 192, y, { align: "right" });
      y += 8;
    });
  if (!moves.length) {
    doc.setTextColor(93, 112, 97);
    doc.text("Nenhuma movimentação encontrada no período.", 14, y);
  }
  doc.setTextColor(93, 112, 97);
  doc.setFontSize(8);
  doc.text("Jacoby Soluções Ambientais · Gestão responsável de resíduos", 14, 286);
}
function InvoiceConfigurator({
  clientName,
  branch,
  rows,
  selectedResidues,
  onResidues,
  services,
  selectedServices,
  onServices,
  placements,
  total,
  onEdit,
  onGenerate,
}: {
  clientName: string;
  branch: Branch | undefined;
  rows: any[];
  selectedResidues: string[];
  onResidues: (value: string[]) => void;
  services: any[];
  selectedServices: string[];
  onServices: (value: string[]) => void;
  placements: { id: string; equipment: string; residue: string; value: number }[];
  total: number;
  onEdit: () => void;
  onGenerate: () => void;
}) {
  const toggle = (items: string[], set: (value: string[]) => void, id: string) =>
    set(items.includes(id) ? items.filter((value) => value !== id) : [...items, id]);
  return (
    <Card className="space-y-4 border-primary/20 p-4">
      <div>
        <h2 className="font-semibold">Personalizar demonstrativo</h2>
        <p className="text-sm text-muted-foreground">
          A filial é definida pelo primeiro lançamento da fila (colocação ou movimentação). Para
          emitir outro pátio, volte à etapa anterior e selecione a unidade correta.
        </p>
      </div>
      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Cliente: </span>
            <strong>{clientName}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Filial ou pátio: </span>
            <strong>{branch?.name || "Nenhum lançamento com filial registrado"}</strong>
          </div>
        </div>
      </div>
      <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
        <div className="mb-2 flex items-center justify-between gap-3">
          <strong>Colocações de equipamento desta filial</strong>
          <strong>{money(placements.reduce((sum, item) => sum + item.value, 0))}</strong>
        </div>
        {placements.map((item) => (
          <div
            key={item.id}
            className="flex justify-between gap-3 border-t py-2 first:border-t-0 first:pt-0"
          >
            <span>
              {item.equipment} · {item.residue}
            </span>
            <span>{money(item.value)}</span>
          </div>
        ))}
        {!placements.length && (
          <span className="text-muted-foreground">
            Nenhuma colocação registrada para esta filial.
          </span>
        )}
        {placements.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            A locação é incluída no total do demonstrativo mesmo quando não houver movimentações.
          </p>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Resíduos</Label>
          {rows.map((row) => (
            <label key={row.residue.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedResidues.includes(row.residue.id)}
                onCheckedChange={() => toggle(selectedResidues, onResidues, row.residue.id)}
              />
              {row.residue.name}
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <Label>Serviços</Label>
          {services.map((row) => (
            <label key={row.service.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedServices.includes(row.service.id)}
                onCheckedChange={() => toggle(selectedServices, onServices, row.service.id)}
              />
              {row.service.name}
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <strong>Total selecionado: {money(total)}</strong>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEdit}>
            Editar lançamentos
          </Button>
          <Button onClick={onGenerate} disabled={!branch}>
            Imprimir PDF
          </Button>
        </div>
      </div>
    </Card>
  );
}
function ResidueSelect({
  residues,
  value,
  onChange,
}: {
  residues: Residue[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Selecionar" />
      </SelectTrigger>
      <SelectContent>
        {residues.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <Card className="overflow-x-auto p-4">
      <table className="min-w-[650px] w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="p-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b">
              {row.map((cell, j) => (
                <td key={j} className="p-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td className="p-8 text-center text-muted-foreground" colSpan={headers.length}>
                Nenhum registro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
function ResidueBranchConfig({
  clientId,
  branches,
  residues,
  onSaved,
}: {
  clientId: string;
  branches: Branch[];
  residues: Residue[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ id: "", branchId: "", name: "", treatment: "0" });
  const currentRows = form.branchId
    ? residues.filter((residue) => residue.active && residue.branch_id === form.branchId)
    : residues.filter((residue) => residue.active && !residue.branch_id);
  const configuredNames = new Set(currentRows.map((residue) => optionKey(residue.name)));
  const inheritedRows = form.branchId
    ? residues.filter(
        (residue) =>
          residue.active && !residue.branch_id && !configuredNames.has(optionKey(residue.name)),
      )
    : [];
  const knownResidueNames = Array.from(new Set(residues.filter((residue) => residue.active).map((residue) => residue.name))).sort();
  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw Error("Informe o nome do resíduo.");
      const normalizedName = optionKey(form.name);
      const existing = residues.find(
        (residue) =>
          residue.client_id === clientId &&
          (residue.branch_id || "") === (form.branchId || "") &&
          optionKey(residue.name) === normalizedName,
      );
      const payload = {
        client_id: clientId,
        branch_id: form.branchId || null,
        name: form.name.trim(),
        waste_class: "class_ii",
        unit: "kg",
        default_rental_rate: 0,
        default_exchange_rate: 0,
        default_treatment_rate: Number(form.treatment || 0),
      };
      const request = supabase.from("waste_residues" as any) as any;
      const targetId = form.id || existing?.id;
      const { error } = targetId
        ? await request.update(payload).eq("id", targetId)
        : await request.insert(payload);
      if (error) throw error;
      return { updated: Boolean(targetId) };
    },
    onSuccess: ({ updated }: { updated: boolean }) => {
      setForm((current) => ({ id: "", branchId: current.branchId, name: "", treatment: "0" }));
      onSaved();
      toast.success(updated ? "Valor de tratamento atualizado." : "Resíduo e valor de tratamento salvos.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeResidue = useMutation({
    mutationFn: async (residue: Residue) => {
      const { error } = await (supabase.from("waste_residues" as any) as any)
        .update({ active: false })
        .eq("id", residue.id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (form.id) setForm((current) => ({ ...current, id: "", name: "", treatment: "0" }));
      onSaved();
      toast.success("Resíduo excluído das opções do BM.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const defineInheritedResidue = useMutation({
    mutationFn: async (residue: Residue) => {
      if (!form.branchId) throw Error("Escolha a filial ou pátio antes de definir o valor.");
      const existing = residues.find(
        (item) =>
          item.client_id === clientId &&
          item.branch_id === form.branchId &&
          optionKey(item.name) === optionKey(residue.name),
      );
      const payload = {
        client_id: clientId,
        branch_id: form.branchId,
        name: residue.name,
        waste_class: residue.waste_class,
        unit: residue.unit,
        default_rental_rate: Number(residue.default_rental_rate || 0),
        default_exchange_rate: Number(residue.default_exchange_rate || 0),
        default_treatment_rate: Number(residue.default_treatment_rate || 0),
        active: true,
      };
      const request = supabase.from("waste_residues" as any) as any;
      const { error } = existing
        ? await request.update(payload).eq("id", existing.id)
        : await request.insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      onSaved();
      toast.success("Valor padrão aplicado a este pátio. Use Editar para alterar o valor.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <>
      <Card className="p-4">
        <h2 className="font-semibold">Resíduo e valor por matriz, filial ou pátio</h2>
        <p className="mt-1 text-sm text-muted-foreground">Escolha a matriz ou o pátio para visualizar e definir seus valores próprios. O valor por kg entra no BM apenas quando a movimentação for confirmada.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Field label="Filial ou pátio">
            <Select value={form.branchId || BRANCH_MATRIZ} onValueChange={(value) => setForm({ id: "", branchId: value === BRANCH_MATRIZ ? "" : value, name: "", treatment: "0" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={BRANCH_MATRIZ}>Matriz (sem filial/pátio)</SelectItem>{branches.filter((branch) => branch.is_active).map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Resíduo"><><Input list="known-residues" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Lixo comercial" /><datalist id="known-residues">{knownResidueNames.map((name) => <option key={name} value={name} />)}</datalist></></Field>
          <Field label="Tratamento por kg"><Input type="number" min="0" step="0.01" value={form.treatment} onChange={(event) => setForm({ ...form, treatment: event.target.value })} /></Field>
          <Button className="self-end" onClick={() => save.mutate()} disabled={save.isPending}>{form.id ? "Salvar" : "Cadastrar resíduo"}</Button>
        </div>
      </Card>
      <ActionTable
        headers={["Resíduo", "Filial/pátio", "Tratamento/kg", "Ações"]}
        rows={[
          ...currentRows.map((residue) => [
          residue.name,
          branches.find((branch) => branch.id === residue.branch_id)?.name || "Matriz (sem filial/pátio)",
          money(residue.default_treatment_rate),
          <div key={residue.id} className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setForm({ id: residue.id, branchId: branchKey(residue.branch_id), name: residue.name, treatment: String(residue.default_treatment_rate || 0) })}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
            <Button variant="ghost" size="icon" title="Excluir resíduo" disabled={removeResidue.isPending} onClick={() => {
              if (confirm(`Excluir o resíduo “${residue.name}” desta configuração? Ele deixará de aparecer no BM e nos novos lançamentos.`)) removeResidue.mutate(residue);
            }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>,
          ]),
          ...inheritedRows.map((residue) => [
            residue.name,
            "Valor padrão",
            money(residue.default_treatment_rate),
            <Button key={residue.id} variant="outline" size="sm" disabled={defineInheritedResidue.isPending} onClick={() => defineInheritedResidue.mutate(residue)}>Definir para este pátio</Button>,
          ]),
        ]}
      />
    </>
  );
}

function ActionTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <Card className="overflow-x-auto p-4">
      <table className="min-w-[650px] w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="p-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b">
              {row.map((cell, j) => (
                <td key={j} className="p-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td className="p-8 text-center text-muted-foreground" colSpan={headers.length}>
                Nenhum registro.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
function BillingTable({
  rows,
  label,
  field,
  admin,
  save,
  remove,
}: {
  rows: any[];
  label: string;
  field: "rental_rate" | "exchange_rate" | "treatment_rate";
  admin: boolean;
  save: (r: any, f: any, v: string) => Promise<void>;
  remove: (r: any) => Promise<void>;
}) {
  const qty = (r: any) =>
    field === "rental_rate" ? r.placed : field === "exchange_rate" ? r.exchanges : r.weight;
  const rate = (r: any) =>
    field === "rental_rate" ? r.rental : field === "exchange_rate" ? r.exchange : r.treatment;
  return (
    <Card className="overflow-x-auto p-4">
      <table className="min-w-[650px] w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2">Resíduo</th>
            <th className="p-2">{field === "treatment_rate" ? "Peso (kg)" : "Quantidade"}</th>
            <th className="p-2">{label}</th>
            <th className="p-2">Subtotal</th>
            {admin && <th className="p-2">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.residue.id} className="border-b">
              <td className="p-2 font-medium">{r.residue.name}</td>
              <td className="p-2">{n(qty(r))}</td>
              <td className="p-2">
                {admin ? (
                  <Input
                    className="h-8 max-w-32"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={rate(r)}
                    onBlur={(e) => void save(r, field, e.target.value)}
                  />
                ) : (
                  money(rate(r))
                )}
              </td>
              <td className="p-2">{money(qty(r) * rate(r))}</td>
              {admin && (
                <td className="p-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Remover deste relatório"
                    onClick={() => void remove(r)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td className="p-8 text-center text-muted-foreground" colSpan={admin ? 5 : 4}>
                Nenhum resíduo incluído neste relatório.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {admin && (
        <p className="mt-3 text-xs text-muted-foreground">
          Altere o valor no campo ou use a lixeira para remover o item somente deste relatório.
        </p>
      )}
    </Card>
  );
}
function ServiceRateOverridesPanel({
  clientId,
  services,
  companies,
  branches,
}: {
  clientId: string;
  services: Pick<Service, "id" | "name" | "active">[];
  companies: OutsourcedCompany[];
  branches: Branch[];
}) {
  const qc = useQueryClient();
  const [serviceId, setServiceId] = useState("");
  const [companyId, setCompanyId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [rate, setRate] = useState("0");
  const overridesQuery = useQuery({
    queryKey: ["waste-client-service-rate-overrides", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("waste_client_service_rate_overrides" as any) as any)
        .select("id,client_id,waste_service_id,outsourced_company_id,branch_id,default_rate")
        .eq("client_id", clientId);
      if (error) throw error;
      return (data || []) as ClientServiceRateOverride[];
    },
  });
  const overrides = overridesQuery.data || [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["waste-client-service-rate-overrides", clientId] });
    void qc.invalidateQueries({ queryKey: ["billing-v2-client-service-rate-overrides", clientId] });
    void qc.invalidateQueries({ queryKey: ["outsourced-company-services"] });
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!serviceId) throw Error("Selecione o serviço.");
      const parsedRate = Number(rate);
      if (!Number.isFinite(parsedRate) || parsedRate < 0) throw Error("Informe um valor válido.");
      const scopedCompanyId = companyId === "all" ? null : companyId;
      const scopedBranchId = branchId === "all" ? null : branchId;
      if (scopedCompanyId) {
        const { error: linkError } = await (supabase.from("outsourced_company_services" as any) as any)
          .upsert(
            { outsourced_company_id: scopedCompanyId, waste_service_id: serviceId },
            { onConflict: "outsourced_company_id,waste_service_id" },
          );
        if (linkError) throw linkError;
      }
      const existing = overrides.find(
        (item) =>
          item.waste_service_id === serviceId &&
          item.outsourced_company_id === scopedCompanyId &&
          item.branch_id === scopedBranchId,
      );
      const query = supabase.from("waste_client_service_rate_overrides" as any) as any;
      const { error } = existing
        ? await query.update({ default_rate: parsedRate }).eq("id", existing.id)
        : await query.insert({
            client_id: clientId,
            waste_service_id: serviceId,
            outsourced_company_id: scopedCompanyId,
            branch_id: scopedBranchId,
            default_rate: parsedRate,
          });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Valor específico salvo.");
      setServiceId("");
      setCompanyId("all");
      setBranchId("all");
      setRate("0");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("waste_client_service_rate_overrides" as any) as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Valor específico removido.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const labelCompany = (id: string | null) =>
    id
      ? companies.find((company) => company.id === id)?.trade_name ||
        companies.find((company) => company.id === id)?.legal_name ||
        "Terceirizada"
      : "Todas as empresas";
  const labelBranch = (id: string | null) =>
    id ? branches.find((branch) => branch.id === id)?.name || "Filial/pátio" : "Todas as filiais/pátios";
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">2</span>
        <div>
          <h2 className="font-semibold">Definir valor específico</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Use somente quando o valor padrão mudar conforme a terceirizada ou a filial/pátio.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.25fr)_minmax(210px,1.15fr)_minmax(190px,1fr)_minmax(140px,0.7fr)_auto]">
        <Field label="Serviço">
          <Select value={serviceId} onValueChange={setServiceId}>
            <SelectTrigger><SelectValue placeholder="Selecionar serviço" /></SelectTrigger>
            <SelectContent>{services.map((service) => <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Empresa terceirizada">
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.trade_name || company.legal_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Filial ou pátio">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as filiais/pátios</SelectItem>
              {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Valor unitário">
          <Input type="number" min="0" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} />
        </Field>
        <Button className="self-end" onClick={() => save.mutate()} disabled={save.isPending}>Salvar valor específico</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        No BM, o valor mais específico é usado primeiro: terceirizada + filial/pátio, depois terceirizada, filial/pátio e, por último, o valor padrão.
      </p>
      <div className="mt-5 flex items-center justify-between border-t pt-4">
        <h3 className="text-sm font-semibold">Valores específicos cadastrados</h3>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {overrides.length} {overrides.length === 1 ? "regra" : "regras"}
        </span>
      </div>
      <div className="mt-2 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-muted-foreground">
              <th className="p-3">Serviço</th>
              <th className="p-3">Terceirizada</th>
              <th className="p-3">Filial/pátio</th>
              <th className="p-3">Valor</th>
              <th className="w-16 p-3 text-center">Ação</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{services.find((service) => service.id === item.waste_service_id)?.name || "Serviço removido"}</td>
                <td className="p-3">{labelCompany(item.outsourced_company_id)}</td>
                <td className="p-3">{labelBranch(item.branch_id)}</td>
                <td className="p-3 font-semibold">{money(item.default_rate)}</td>
                <td className="p-2 text-center">
                  <Button size="icon" variant="ghost" title="Excluir valor específico" onClick={() => remove.mutate(item.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {!overrides.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  Nenhum valor específico cadastrado. O BM usará o valor padrão do serviço.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CommissionSettingsPanel({
  clientId,
  residues,
  branches,
  companies,
}: {
  clientId: string;
  residues: Residue[];
  branches: Branch[];
  companies: OutsourcedCompany[];
}) {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [form, setForm] = useState({ tax: "11", rental: "10", exchange: "10", active: true });
  const settingsQuery = useQuery({
    queryKey: ["outsourced-commission-settings", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("outsourced_commission_settings" as any) as any)
        .select("*")
        .eq("client_id", clientId);
      if (error) throw error;
      return (data || []) as OutsourcedCommissionSetting[];
    },
  });
  const settings = settingsQuery.data || [];
  useEffect(() => {
    if (!companyId && companies.length) setCompanyId(companies[0].id);
  }, [companyId, companies]);
  const current = settings.find((setting) => setting.outsourced_company_id === companyId);
  const templateQuery = useQuery({
    queryKey: ["outsourced-commission-template", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("outsourced_commission_templates" as any) as any)
        .select("*")
        .eq("outsourced_company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as OutsourcedCommissionTemplate | null;
    },
  });
  const template = templateQuery.data;
  useEffect(() => {
    setForm({
      tax: String(current?.tax_withholding_rate ?? template?.tax_withholding_rate ?? 11),
      rental: String(current?.rental_commission_rate ?? template?.rental_commission_rate ?? 10),
      exchange: String(current?.exchange_commission_rate ?? template?.exchange_commission_rate ?? 10),
      active: current?.active ?? template?.active ?? true,
    });
  }, [current?.id, current?.tax_withholding_rate, current?.rental_commission_rate, current?.exchange_commission_rate, current?.active, template?.id, template?.tax_withholding_rate, template?.rental_commission_rate, template?.exchange_commission_rate, template?.active]);
  const ratesQuery = useQuery({
    queryKey: ["outsourced-treatment-commission-rates", current?.id],
    enabled: Boolean(current?.id),
    queryFn: async () => {
      const { data, error } = await (supabase.from("outsourced_treatment_commission_rates" as any) as any)
        .select("*")
        .eq("commission_setting_id", current!.id);
      if (error) throw error;
      return (data || []) as OutsourcedTreatmentCommissionRate[];
    },
  });
  const treatmentRates = ratesQuery.data || [];
  const templateRatesQuery = useQuery({
    queryKey: ["outsourced-treatment-commission-template-rates", template?.id],
    enabled: Boolean(template?.id),
    queryFn: async () => {
      const { data, error } = await (supabase.from("outsourced_treatment_commission_template_rates" as any) as any)
        .select("*")
        .eq("commission_template_id", template!.id);
      if (error) throw error;
      return (data || []) as OutsourcedTreatmentCommissionTemplateRate[];
    },
  });
  const templateRates = templateRatesQuery.data || [];
  const number = (value: string) => Math.max(0, Number(value.replace(",", ".")) || 0);
  const upsertSetting = async () => {
    const { data, error } = await (supabase.from("outsourced_commission_settings" as any) as any).upsert(
      {
        client_id: clientId,
        outsourced_company_id: companyId,
        tax_withholding_rate: number(form.tax),
        rental_commission_rate: number(form.rental),
        exchange_commission_rate: number(form.exchange),
        active: form.active,
      },
      { onConflict: "client_id,outsourced_company_id" },
    ).select("id").single();
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["outsourced-commission-settings", clientId] });
    return data.id as string;
  };
  const saveSettings = async () => {
    if (!clientId || !companyId) return toast.error("Selecione a empresa terceirizada.");
    try {
      await upsertSetting();
      toast.success("Regra de comissionamento salva.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  // Valor por resíduo de um pátio específico. Se o cliente ainda segue o modelo
  // padrão da terceirizada, a regra do cliente é criada com os valores da tela.
  const saveTreatment = async (residueId: string, outsourcedRate: string, jacobyRate: string) => {
    if (!clientId || !companyId) return toast.error("Selecione a empresa terceirizada.");
    try {
      const settingId = current?.id || await upsertSetting();
      const { error } = await (supabase.from("outsourced_treatment_commission_rates" as any) as any).upsert(
        {
          commission_setting_id: settingId,
          waste_residue_id: residueId,
          outsourced_treatment_rate: number(outsourcedRate),
          jacoby_treatment_rate: jacobyRate.trim() === "" ? null : number(jacobyRate),
        },
        { onConflict: "commission_setting_id,waste_residue_id" },
      );
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["outsourced-treatment-commission-rates", settingId] });
      toast.success("Valor salvo. As comissões dos BMs finalizados foram recalculadas.");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };
  const removeTreatment = async (rateId: string) => {
    const { error } = await (supabase.from("outsourced_treatment_commission_rates" as any) as any).delete().eq("id", rateId);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["outsourced-treatment-commission-rates", current?.id] });
    toast.success("Exceção removida. O pátio volta a usar o modelo padrão.");
  };
  const branchLabel = (id: string | null) => id ? branches.find((branch) => branch.id === id)?.name || "Pátio" : "Todos os pátios (geral)";
  const residueBranchIds = Array.from(new Set(residues.filter((residue) => residue.active).map((residue) => residue.branch_id || "")));
  const visibleResidues = residues
    .filter((residue) => residue.active && (branchFilter === "all" || (residue.branch_id || "") === branchFilter))
    .sort((a, b) => branchLabel(a.branch_id).localeCompare(branchLabel(b.branch_id)) || a.name.localeCompare(b.name));
  const companyLabel = companies.find((company) => company.id === companyId)?.trade_name || companies.find((company) => company.id === companyId)?.legal_name || "terceirizada";
  return <>
    <Card className="p-4">
      <h2 className="font-semibold">Comissionamento de terceirizadas</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Na locação e na troca, o abatimento é aplicado ao valor do BM antes do percentual da Jacoby. No tratamento, o abatimento incide somente sobre a parcela/kg da Jacoby.
      </p>
      {template && !current && <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Modelo padrão da {companies.find((company) => company.id === companyId)?.trade_name || companies.find((company) => company.id === companyId)?.legal_name} aplicado. Ao salvar, você cria uma exceção editável somente para este cliente.</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Empresa terceirizada">
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
            <SelectContent>{companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.trade_name || company.legal_name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Abatimento antes da comissão (%)"><Input type="number" min="0" max="100" step="0.01" value={form.tax} onChange={(event) => setForm({ ...form, tax: event.target.value })} /></Field>
        <Field label="Comissão de locação (%)"><Input type="number" min="0" max="100" step="0.01" value={form.rental} onChange={(event) => setForm({ ...form, rental: event.target.value })} /></Field>
        <Field label="Comissão de troca (%)"><Input type="number" min="0" max="100" step="0.01" value={form.exchange} onChange={(event) => setForm({ ...form, exchange: event.target.value })} /></Field>
        <Button className="self-end" onClick={() => void saveSettings()}>Salvar regra</Button>
      </div>
    </Card>
    <Card className="overflow-x-auto p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Tratamento por resíduo e pátio</h2>
          <p className="mt-1 text-sm text-muted-foreground">Quanto a Jacoby recebe por kg em cada resíduo de cada pátio. Ex.: lixo a R$ 0,35/kg = R$ 0,30 da LDJ + R$ 0,05 da Jacoby; sucata da Eliana = R$ 0,10/kg para a Jacoby.</p>
        </div>
        <div className="w-64"><Field label="Pátio">
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os pátios</SelectItem>
              {residueBranchIds.map((id) => <SelectItem key={id || "geral"} value={id}>{branchLabel(id || null)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field></div>
      </div>
      <div className="mt-3 grid gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground md:grid-cols-3">
        <p><span className="mr-1 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">Modelo padrão</span> valor do modelo da {companyLabel}, igual para todos os clientes.</p>
        <p><span className="mr-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">Exceção do pátio</span> valor próprio deste cliente neste pátio; tem prioridade sobre o modelo.</p>
        <p><strong className="text-foreground">Jacoby/kg vazio</strong> = automático: valor do cliente/kg − valor da terceirizada/kg. Ao salvar, os BMs finalizados são recalculados.</p>
      </div>
      <table className="mt-4 min-w-[920px] w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Pátio</th><th className="p-2">Resíduo</th><th className="p-2">Valor do cliente/kg</th><th className="p-2">Terceirizada/kg</th><th className="p-2">Jacoby/kg</th><th className="p-2">Origem</th><th className="p-2">Ação</th></tr></thead><tbody>{visibleResidues.map((residue) => {
        const rate = treatmentRates.find((item) => item.waste_residue_id === residue.id);
        const templateRate = templateRates.find((item) => item.residue_name.trim().toLocaleLowerCase() === residue.name.trim().toLocaleLowerCase());
        const provider = String(rate?.outsourced_treatment_rate ?? templateRate?.outsourced_treatment_rate ?? 0);
        const jacobyValue = rate?.jacoby_treatment_rate ?? templateRate?.jacoby_treatment_rate;
        const jacoby = jacobyValue == null ? "" : String(jacobyValue);
        return <tr key={`${current?.id || template?.id || companyId}-${residue.id}-${rate?.id || "t"}`} className="border-b"><td className="p-2 text-muted-foreground">{branchLabel(residue.branch_id)}</td><td className="p-2 font-medium">{residue.name}</td><td className="p-2">{money(Number(residue.default_treatment_rate || 0))}</td><td className="p-2"><Input className="h-8 w-28" type="number" min="0" step="0.0001" defaultValue={provider} id={`provider-${residue.id}`} /></td><td className="p-2"><Input className="h-8 w-28" type="number" min="0" step="0.0001" placeholder="Automático" defaultValue={jacoby} id={`jacoby-${residue.id}`} /></td><td className="p-2">{rate ? <span className="whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Exceção do pátio</span> : templateRate ? <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs font-medium">Modelo padrão</span> : <span className="text-xs text-muted-foreground">Automático</span>}</td><td className="p-2"><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => void saveTreatment(residue.id, (document.getElementById(`provider-${residue.id}`) as HTMLInputElement)?.value || "0", (document.getElementById(`jacoby-${residue.id}`) as HTMLInputElement)?.value || "")}>Salvar</Button>{rate && <Button size="sm" variant="ghost" title="Remover exceção e voltar ao modelo padrão" onClick={() => void removeTreatment(rate.id)}><Undo2 className="h-4 w-4" /></Button>}</div></td></tr>;
      })}{!visibleResidues.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum resíduo ativo para este pátio.</td></tr>}</tbody></table>
    </Card>
  </>;
}

function ClientMovementPrices({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["waste-client-billing-settings", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("waste_client_billing_settings" as any) as any)
        .select("exchange_rate,treatment_rate,rental_rate")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as { exchange_rate: number; treatment_rate: number; rental_rate: number } | null;
    },
  });
  const [form, setForm] = useState({ exchange: "0" });
  useEffect(() => {
    setForm({ exchange: String(data?.exchange_rate || 0) });
  }, [data]);
  const save = async () => {
    if (!clientId) return;
    const { error } = await (supabase.from("waste_client_billing_settings" as any) as any).upsert(
      { client_id: clientId, exchange_rate: Number(form.exchange || 0), treatment_rate: Number(data?.treatment_rate || 0), rental_rate: Number(data?.rental_rate || 0) },
      { onConflict: "client_id" },
    );
    if (error) toast.error(error.message);
    else {
      toast.success("Valor por troca salvo.");
      void qc.invalidateQueries({ queryKey: ["waste-client-billing-settings", clientId] });
    }
  };
  return (
    <Card className="max-w-3xl p-4">
      <h2 className="font-semibold">Valor por troca</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Este valor é aplicado a cada troca confirmada no BM. A locação é definida individualmente no cadastro de equipamentos; o tratamento é definido em Resíduos e valores, por filial/pátio.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Field label="Valor fixo por troca">
          <Input type="number" min="0" step="0.01" value={form.exchange} disabled={isLoading} onChange={(event) => setForm({ ...form, exchange: event.target.value })} />
        </Field>
        <Button className="self-end" onClick={() => void save()}>Salvar valores</Button>
      </div>
    </Card>
  );
}

function ServiceReportTable({
  services,
  reportServices,
  admin,
  onToggle,
  onRate,
}: {
  services: Service[];
  reportServices: ReportService[];
  admin: boolean;
  onToggle: (service: Service, included: boolean) => Promise<void>;
  onRate: (item: { service: Service; rate: number }, value: string) => Promise<void>;
}) {
  return (
    <Card className="overflow-x-auto p-4">
      <p className="mb-3 text-sm text-muted-foreground">
        Inclua somente os serviços deste faturamento e informe o valor cobrado. Os serviços
        desmarcados não entram no total nem no PDF.
      </p>
      <table className="min-w-[600px] w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2">Incluir</th>
            <th className="p-2">Serviço</th>
            <th className="p-2">Valor neste relatório</th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => {
            const current = reportServices.find((item) => item.waste_service_id === service.id);
            const included = !current?.excluded;
            const rate = Number(current?.rate ?? 0);
            return (
              <tr key={service.id} className="border-b">
                <td className="p-2">
                  <Checkbox
                    checked={included}
                    disabled={!admin}
                    onCheckedChange={(checked) => void onToggle(service, checked === true)}
                  />
                </td>
                <td className="p-2 font-medium">{service.name}</td>
                <td className="p-2">
                  {admin ? (
                    <Input
                      key={`${service.id}-${rate}`}
                      className="h-8 max-w-32"
                      disabled={!included}
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={rate}
                      onBlur={(e) => void onRate({ service, rate }, e.target.value)}
                    />
                  ) : (
                    money(rate)
                  )}
                </td>
              </tr>
            );
          })}
          {!services.length && (
            <tr>
              <td className="p-8 text-center text-muted-foreground" colSpan={3}>
                Nenhum serviço cadastrado para este cliente.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function BillingImpactNote({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "amber" }) {
  const box =
    tone === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-primary/20 bg-primary/5 text-muted-foreground";
  const icon = tone === "amber" ? "text-amber-600" : "text-primary";
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${box}`}>
      <Info className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
