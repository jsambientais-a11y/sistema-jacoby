import { useEffect, useMemo, useState } from "react";
import { useSessionView } from "@/hooks/use-session-view";
import { useQuery } from "@tanstack/react-query";
import {
  Maximize2,
  Minimize2,
  ArrowRight,
  ChevronRight,
  GitBranch,
  Info,
  Network,
  Pencil,
  RefreshCw,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ResidueMindMap } from "@/components/ResidueMindMap";
import { ResidueMapEditor } from "@/components/ResidueMapEditor";
import type { MapEditTarget } from "@/lib/residue-map-edit";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  residueConnections,
  sameScopeResidues,
  type MapResidue,
  type MapStandardResidue,
  type MapBranch,
  type MapCompany,
  type MapDetail,
  type MapCycle,
  type MapSetting,
} from "@/lib/residue-map";

// Read every page: Supabase's default row limit must not hide dependencies.
async function rows<T>(
  table: string,
  fields: string,
  filter?: { field: string; values: string[] },
): Promise<T[]> {
  if (filter && !filter.values.length) return [];
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    let request = (supabase.from(table as any) as any)
      .select(fields)
      .order("id")
      .range(offset, offset + 499);
    if (filter) request = request.in(filter.field, filter.values);
    const response = await request;
    if (response.error) throw new Error(`${table}: ${response.error.message}`);
    const page = response.data || [];
    result.push(...page);
    if (page.length < 500) return result;
  }
}
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(value || 0));
const flow = [
  { title: "Cadastro", text: "O nome, o cliente, o pátio e o valor padrão ficam aqui." },
  { title: "Movimentação", text: "Cada lançamento aponta para o ID de um cadastro de resíduo." },
  {
    title: "Boletim de medição",
    text: "Reúne os lançamentos. No tratamento, peso × taxa da movimentação.",
  },
  {
    title: "Comissão",
    text: "Depende da terceirizada emissora e das regras por resíduo ou do modelo dela.",
  },
  {
    title: "Faturamento",
    text: "Acompanha repasse, nota e recebimento por BM, categoria e empresa.",
  },
];
function Tag({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}
    >
      {children}
    </span>
  );
}

export function ResidueImpactMap({
  clients,
  clientId,
  onClientChange,
}: {
  clients: { id: string; name: string }[];
  clientId: string;
  onClientChange: (id: string) => void;
}) {
  const { isAdmin, hasPermission } = useAuth();
  const canReadBilling = isAdmin || hasPermission("billing");
  const [search, setSearch] = useSessionView("jacoby:residue-map:detail:search", "");
  const [status, setStatus] = useState("active");
  const [branch, setBranch] = useSessionView("jacoby:residue-map:detail:branch", "all");
  const [selected, setSelected] = useSessionView("jacoby:residue-map:detail:selected", "");
  const [scopeClient, setScopeClient] = useSessionView(
    "jacoby:residue-map:detail:scopeClient",
    "all",
  );
  const [view, setView] = useSessionView("jacoby:residue-map:detail:view", "map");
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => {
    if (!fullScreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const exit = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[role="dialog"]'))
        setFullScreen(false);
    };
    window.addEventListener("keydown", exit);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", exit);
    };
  }, [fullScreen]);
  const [editing, setEditing] = useState<MapEditTarget | null>(null);
  const canEdit = isAdmin || hasPermission("movement_settings");
  const canEditBranch = isAdmin || hasPermission("clients");
  const catalog = useQuery({
    queryKey: ["residue-impact-catalog"],
    queryFn: async () => {
      const [residues, branches, companies, standards] = await Promise.all([
        rows<MapResidue>("waste_residues", "*"),
        rows<MapBranch>("client_branches", "id,client_id,name,is_active"),
        rows<MapCompany>("outsourced_companies", "id,trade_name,legal_name"),
        rows<MapStandardResidue>("waste_residue_types", "*"),
      ]);
      return { residues, branches, companies, standards };
    },
  });
  const detail = useQuery({
    queryKey: ["residue-impact-detail", "all", canReadBilling],
    queryFn: async (): Promise<MapDetail> => {
      const filter = undefined;
      const [cycles, settings] = await Promise.all([
        rows<MapCycle>(
          "billing_v2_cycles",
          "id,client_id,bulletin_number,branch_id,status,outsourced_company_id,issuer_type,period_start,period_end",
          filter,
        ),
        rows<MapSetting>("outsourced_commission_settings", "*", filter),
      ]);
      const cycleFilter = undefined;
      const [
        movements,
        placements,
        equipment,
        rates,
        templates,
        templateRates,
        emissions,
        commissions,
        tracking,
        legacyMovements,
        legacyRates,
        tickets,
        legacyReports,
      ] = await Promise.all([
        rows<MapDetail["movements"][number]>(
          "billing_v2_movements",
          "id,cycle_id,waste_residue_id,confirmed,treatment_rate,equipment_id,replacement_equipment_id",
          cycleFilter,
        ),
        rows<MapDetail["placements"][number]>(
          "billing_v2_placements",
          "id,cycle_id,waste_residue_id,equipment_id",
          filter,
        ),
        rows<MapDetail["equipment"][number]>("waste_equipment", "*", filter),
        rows<MapDetail["rates"][number]>(
          "outsourced_treatment_commission_rates",
          "id,commission_setting_id,waste_residue_id,outsourced_treatment_rate,jacoby_treatment_rate",
          undefined,
        ),
        rows<MapDetail["templates"][number]>("outsourced_commission_templates", "*"),
        rows<MapDetail["templateRates"][number]>(
          "outsourced_treatment_commission_template_rates",
          "id,commission_template_id,residue_name,outsourced_treatment_rate,jacoby_treatment_rate",
        ),
        rows<MapDetail["emissions"][number]>(
          "billing_v2_residue_emissions",
          "id,cycle_id,waste_residue_id,display_number,client_portal_visible",
          cycleFilter,
        ),
        canReadBilling
          ? rows<MapDetail["commissions"][number]>(
              "outsourced_movement_commissions",
              "*",
              filter,
            )
          : [],
        canReadBilling
          ? rows<MapDetail["tracking"][number]>(
              "billing_receivable_tracking",
              "*",
              cycleFilter,
            )
          : [],
        rows<NonNullable<MapDetail["legacyMovements"]>[number]>(
          "waste_movements",
          "id,report_id,waste_residue_id",
        ),
        rows<NonNullable<MapDetail["legacyRates"]>[number]>(
          "waste_billing_rates",
          "id,report_id,waste_residue_id",
        ),
        rows<NonNullable<MapDetail["tickets"]>[number]>(
          "waste_weighing_tickets",
          "id,report_id,waste_residue_id",
        ),
        rows<NonNullable<MapDetail["legacyReports"]>[number]>(
          "waste_reports",
          "id,client_id,period_start,status",
        ),
      ]);
      return {
        cycles,
        settings,
        movements,
        placements,
        equipment,
        rates,
        templates,
        templateRates,
        emissions,
        commissions,
        tracking,
        legacyMovements,
        legacyRates,
        tickets,
        legacyReports,
      };
    },
  });
  const residues = catalog.data?.residues || [];
  const clientResidues =
    scopeClient === "all" ? residues : residues.filter((item) => item.client_id === scopeClient);
  const allBranches = catalog.data?.branches || [];
  const branches =
    scopeClient === "all"
      ? allBranches
      : allBranches.filter((item) => item.client_id === scopeClient);
  const clientLabel = (id: string) =>
    clients.find((item) => item.id === id)?.name || "Empresa não encontrada";
  const branchName = (id: string | null) =>
    id
      ? allBranches.find((item) => item.id === id)?.name || "Pátio não encontrado"
      : "Geral do cliente";
  const companyName = (id?: string) => {
    const item = catalog.data?.companies.find((item) => item.id === id);
    return item?.trade_name || item?.legal_name || "Empresa não encontrada";
  };
  const visible = clientResidues
    .filter(
      (item) =>
        (status === "all" || item.active === (status === "active")) &&
        (branch === "all" ||
          (item.branch_id || "general") === branch ||
          (!item.branch_id &&
            item.client_id === allBranches.find((row) => row.id === branch)?.client_id)) &&
        `${item.name} ${branchName(item.branch_id)} ${clientLabel(item.client_id)}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.trim().toLocaleLowerCase("pt-BR")),
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "pt-BR") ||
        branchName(a.branch_id).localeCompare(branchName(b.branch_id)),
    );
  const current = visible.find((item) => item.id === selected) || visible[0];
  const connections = useMemo(
    () => (current && detail.data ? residueConnections(current, detail.data) : null),
    [current, detail.data],
  );
  const siblings = current ? sameScopeResidues(current, clientResidues) : [];
  const activeTwins = siblings.filter((item) => item.active);
  const clientName =
    scopeClient === "all" ? "Todas as empresas, filiais e resíduos" : clientLabel(scopeClient);
  const duplicateScopes = new Set(
    clientResidues
      .filter(
        (item) =>
          item.active &&
          sameScopeResidues(item, clientResidues).filter((row) => row.active).length > 1,
      )
      .map((item) => `${item.client_id}:${item.branch_id}:${item.name.toLocaleLowerCase("pt-BR")}`),
  ).size;
  const refresh = () => {
    void catalog.refetch();
    void detail.refetch();
  };
  function editResidue(item: MapResidue) {
    const links = detail.data ? residueConnections(item, detail.data) : null;
    const countLinks = links
      ? `${links.movements.length} movimentações, ${links.cycles.length} BMs, ${links.rules.length} regras específicas e ${links.legacyReports.length} demonstrativos antigos ligados a este ID.`
      : "Os vínculos ainda estão carregando.";
    setEditing({
      table: "waste_residues",
      id: item.id,
      title: "Editar resíduo",
      context: `${clientLabel(item.client_id)} · ${branchName(item.branch_id)} · ID ${item.id}`,
      record: { ...item },
      fields: [
        { key: "name", label: "Nome", kind: "text" },
        {
          key: "branch_id",
          label: "Abrangência / filial",
          emptyLabel: "Geral do cliente",
          kind: "select",
          nullable: true,
          options: allBranches
            .filter((row) => row.client_id === item.client_id)
            .map((row) => ({ value: row.id, label: row.name })),
        },
        { key: "default_treatment_rate", label: "Tratamento padrão por kg", kind: "number" },
        { key: "default_rental_rate", label: "Valor padrão de locação do resíduo", kind: "number" },
        { key: "default_exchange_rate", label: "Valor padrão de troca do resíduo", kind: "number" },
        { key: "active", label: "Disponível nos cadastros", kind: "boolean" },
      ],
      impact: [
        countLinks,
        "A mudança de nome pode alterar a correspondência com modelos de comissão por nome.",
        "Mudar a filial altera a abrangência do cadastro. As movimentações existentes mantêm suas próprias filiais e taxas.",
        "Desativar ou reativar muda a disponibilidade nas seleções. Os IDs e os registros históricos são preservados.",
      ],
    });
  }
  function editBranch(item: MapBranch) {
    setEditing({
      table: "client_branches",
      id: item.id,
      title: "Editar filial / pátio",
      context: clientLabel(item.client_id),
      record: { ...item },
      fields: [
        { key: "name", label: "Nome", kind: "text" },
        { key: "is_active", label: "Filial ativa", kind: "boolean" },
      ],
      impact: [
        `${residues.filter((row) => row.branch_id === item.id).length} resíduos e ${detail.data?.cycles.filter((row) => row.branch_id === item.id).length ?? "…"} BMs ligados a esta filial.`,
        "O ID e os vínculos são mantidos. A mudança de nome aparece nas telas que consultam o cadastro; desativar pode ocultar a filial de novas seleções.",
      ],
    });
  }
  function editRate(
    item: MapDetail["rates"][number] | MapDetail["templateRates"][number],
    template = false,
  ) {
    const affects = template
      ? residues.filter(
          (row) =>
            row.name.toLocaleLowerCase("pt-BR") ===
            (item as MapDetail["templateRates"][number]).residue_name.toLocaleLowerCase("pt-BR"),
        )
      : residues.filter((row) => row.id === (item as MapDetail["rates"][number]).waste_residue_id);
    setEditing({
      table: template
        ? "outsourced_treatment_commission_template_rates"
        : "outsourced_treatment_commission_rates",
      id: item.id,
      title: template ? "Editar modelo de tratamento" : "Editar regra de tratamento",
      context: template
        ? "Modelo compartilhado da terceirizada"
        : "Regra específica do cadastro selecionado",
      record: { ...item },
      fields: [
        { key: "outsourced_treatment_rate", label: "Terceirizada por kg", kind: "number" },
        {
          key: "jacoby_treatment_rate",
          label: "Jacoby por kg (vazio = automático)",
          kind: "number",
          nullable: true,
        },
      ],
      impact: [
        `${affects.length} cadastro(s) com correspondência nesta regra ou modelo.`,
        template
          ? "Este modelo pode alcançar vários clientes. Exceções específicas têm prioridade."
          : "A regra é vinculada ao ID do resíduo e à configuração da terceirizada.",
        "Salvar uma regra de comissão pode recalcular comissões de BMs já finalizados pelas regras existentes do sistema. Confira o antes e depois.",
      ],
    });
  }
  function editEquipment(item: MapDetail["equipment"][number]) {
    setEditing({
      table: "waste_equipment",
      id: item.id,
      title: "Editar equipamento e vínculo do resíduo",
      context: `${clientLabel(item.client_id)} · ${branchName(item.branch_id)}`,
      record: { ...item },
      fields: [
        { key: "name", label: "Nome / veículo", kind: "text" },
        { key: "identification", label: "Identificação", kind: "text", nullable: true },
        {
          key: "default_waste_residue_id",
          label: "Resíduo padrão",
          emptyLabel: "Sem resíduo padrão",
          kind: "select",
          nullable: true,
          options: residues
            .filter(
              (row) =>
                row.client_id === item.client_id &&
                ((row.active && (!row.branch_id || row.branch_id === item.branch_id)) ||
                  row.id === item.default_waste_residue_id),
            )
            .map((row) => ({
              value: row.id,
              label: `${row.name} · ${branchName(row.branch_id)}${row.active ? "" : " (desativado)"}`,
            })),
        },
        { key: "active", label: "Equipamento ativo", kind: "boolean" },
      ],
      impact: [
        "O resíduo padrão orienta novas seleções de troca deste equipamento.",
        "As movimentações já registradas não são reassociadas por esta edição.",
        "O ID do equipamento e seus vínculos de locação são preservados.",
      ],
    });
  }
  function editSetting(
    item: MapDetail["settings"][number] | MapDetail["templates"][number],
    template = false,
  ) {
    setEditing({
      table: template ? "outsourced_commission_templates" : "outsourced_commission_settings",
      id: item.id,
      title: template ? "Editar modelo da terceirizada" : "Editar configuração de comissão",
      context: companyName(item.outsourced_company_id),
      record: { ...item },
      fields: [
        { key: "tax_withholding_rate", label: "Abatimento (%)", kind: "number", max: 100 },
        {
          key: "rental_commission_rate",
          label: "Comissão de locação (%)",
          kind: "number",
          max: 100,
        },
        {
          key: "exchange_commission_rate",
          label: "Comissão de troca (%)",
          kind: "number",
          max: 100,
        },
        { key: "active", label: "Configuração ativa", kind: "boolean" },
      ],
      impact: [
        template
          ? "Modelo usado por clientes que não têm uma exceção aplicável."
          : `Exceção do cliente ${clientLabel((item as MapDetail["settings"][number]).client_id)}.`,
        "Salvar pode recalcular comissões de BMs finalizados vinculados à terceirizada. Não altera o total das notas nem registra recebimento.",
      ],
    });
  }
  return (
    <div
      className={
        fullScreen
          ? "fixed inset-0 z-40 flex flex-col gap-3 overflow-y-auto bg-background p-3 sm:p-4"
          : "space-y-5"
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-3">
        <p className="text-sm font-medium">
          {fullScreen ? "Mapa e impactos · tela cheia" : "Explore as conexões do sistema"}
        </p>
        <Button
          variant="outline"
          aria-pressed={fullScreen}
          onClick={() => setFullScreen((value) => !value)}
        >
          {fullScreen ? (
            <Minimize2 className="mr-2 h-4 w-4" />
          ) : (
            <Maximize2 className="mr-2 h-4 w-4" />
          )}
          {fullScreen ? "Sair da tela cheia" : "Abrir em tela cheia"}
        </Button>
      </div>
      <Card className={`${fullScreen ? "hidden" : ""} overflow-hidden border-primary/15`}>
        <div className="flex flex-wrap items-start justify-between gap-4 bg-primary/5 p-5 sm:p-6">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <Network className="h-4 w-4" />
              Configurações avançadas · visão geral e edição
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Mapa dos resíduos e seus impactos
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Navegue pelas conexões do mapa e abra as telas reais para entender o fluxo. Use os
              botões de edição para revisar os dados e o impacto antes de salvar. Nomes iguais podem
              representar pátios e valores diferentes: o vínculo real é o ID do cadastro.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={refresh}
            disabled={catalog.isFetching || detail.isFetching}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${catalog.isFetching || detail.isFetching ? "animate-spin" : ""}`}
            />
            Atualizar mapa
          </Button>
        </div>
        <div className={`${view === "map" ? "hidden" : "grid"} gap-2 p-4 sm:grid-cols-5`}>
          {flow.map((step, index) => (
            <div key={step.title} className="relative rounded-xl border bg-background p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-primary">0{index + 1}</span>
                {index < flow.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>
      </Card>
      {catalog.error && (
        <Card role="alert" className="border-destructive/30 p-5">
          <p className="font-medium">Não foi possível carregar os cadastros.</p>
          <p className="mt-1 text-sm text-muted-foreground">{catalog.error.message}</p>
          <Button variant="outline" className="mt-3" onClick={refresh}>
            Tentar novamente
          </Button>
        </Card>
      )}
      {detail.error && (
        <Card role="alert" className="border-destructive/30 p-4">
          <p className="font-medium">Algumas conexões não puderam ser carregadas.</p>
          <p className="mt-1 text-sm text-muted-foreground">{detail.error.message}</p>
          <Button variant="outline" className="mt-2" onClick={() => void detail.refetch()}>
            Tentar novamente
          </Button>
        </Card>
      )}
      <div className="flex shrink-0 flex-wrap gap-2" role="tablist" aria-label="Visões do mapa">
        {[
          ["map", "Mapa visual"],
          ["overview", "Todos os cadastros"],
          ["residues", "Resíduos e conexões"],
          ["branches", "Filiais e pátios"],
          ["companies", "Terceirizadas e regras"],
        ].map(([key, label]) => (
          <Button
            key={key}
            role="tab"
            aria-selected={view === key}
            variant={view === key ? "default" : "outline"}
            onClick={() => setView(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div
        className={view === "map" ? (fullScreen ? "flex min-h-0 flex-1 flex-col" : "") : "hidden"}
      >
        <ResidueMindMap
          fullScreen={fullScreen}
          clients={clients}
          residues={residues}
          branches={allBranches}
          detail={detail.data}
          canEdit={canEdit}
          canEditBranch={canEditBranch}
          onRefresh={refresh}
          onEditResidue={editResidue}
          onEditBranch={editBranch}
          onEditSetting={editSetting}
          onEditRate={editRate}
          companyName={companyName}
          onDetails={(item) => {
            setScopeClient(item.client_id);
            setBranch("all");
            setSearch("");
            setStatus("all");
            setSelected(item.id);
            setView("residues");
          }}
        />
      </div>
      {view === "overview" && (
        <Card className="p-5">
          <h3 className="text-lg font-semibold">Tipos padrão de resíduos · catálogo do sistema</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            São sugestões para novos cadastros. O vínculo com cada cliente é uma configuração
            própria: renomear o tipo padrão não renomeia automaticamente os resíduos já cadastrados.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {catalog.data?.standards.map((item) => (
              <Button
                key={item.id}
                variant="outline"
                disabled={!canEdit}
                onClick={() =>
                  setEditing({
                    table: "waste_residue_types",
                    id: item.id,
                    title: "Editar tipo padrão",
                    context: "Catálogo compartilhado do sistema",
                    record: { ...item },
                    fields: [
                      { key: "name", label: "Nome do tipo", kind: "text" },
                      { key: "unit", label: "Unidade", kind: "text" },
                      {
                        key: "waste_class",
                        label: "Classe",
                        kind: "select",
                        options: [
                          { value: "class_i", label: "Classe I" },
                          { value: "class_ii", label: "Classe II" },
                        ],
                      },
                      { key: "active", label: "Tipo ativo", kind: "boolean" },
                    ],
                    impact: [
                      "Este tipo aparece como sugestão em cadastros compatíveis.",
                      "Cadastros, valores e regras de clientes existentes não são substituídos por esta edição.",
                    ],
                  })
                }
              >
                {item.name}
                {!item.active ? " · desativado" : ""}
                {canEdit && <Pencil className="ml-2 h-3 w-3" />}
              </Button>
            ))}
            {catalog.data && !catalog.data.standards.length && (
              <p className="text-sm text-muted-foreground">
                Nenhum tipo padrão cadastrado. Os resíduos dos clientes estão listados abaixo.
              </p>
            )}
          </div>
        </Card>
      )}
      {view === "overview" && (
        <Card className="overflow-hidden">
          <div className="space-y-4 p-5">
            <div>
              <h3 className="text-xl font-semibold">Tudo junto · empresas, filiais e resíduos</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {clients.length} empresas · {allBranches.length} filiais/pátios · {residues.length}{" "}
                cadastros de resíduos. Todos os registros aparecem nesta tabela, incluindo
                desativados e filiais sem resíduo próprio.
              </p>
            </div>
            <Input
              aria-label="Buscar na visão geral"
              placeholder="Buscar em todas as empresas, filiais e resíduos"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="max-h-[75vh] overflow-auto">
            <table className="w-full min-w-[1250px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr className="border-b text-left">
                  {[
                    "Empresa",
                    "Filial / abrangência",
                    "Resíduo",
                    "Situação",
                    "Tratamento",
                    "Movimentações",
                    "BMs",
                    "Comissões / terceirizadas",
                    "Ações",
                  ].map((label) => (
                    <th key={label} className="p-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.flatMap((client) => {
                  const items = residues.filter((row) => row.client_id === client.id);
                  const emptyBranches = allBranches.filter(
                    (row) =>
                      row.client_id === client.id &&
                      !items.some((item) => item.branch_id === row.id),
                  );
                  const query = search.trim().toLocaleLowerCase("pt-BR");
                  const lines = items
                    .filter((item) =>
                      `${client.name} ${branchName(item.branch_id)} ${item.name}`
                        .toLocaleLowerCase("pt-BR")
                        .includes(query),
                    )
                    .map((item) => {
                      const links = detail.data ? residueConnections(item, detail.data) : null;
                      const companies = links
                        ? [
                            ...new Set([
                              ...links.rules.map((row) =>
                                companyName(row.setting?.outsourced_company_id),
                              ),
                              ...links.templates.map((row) =>
                                companyName(row.template?.outsourced_company_id),
                              ),
                            ]),
                          ]
                        : [];
                      return (
                        <tr
                          key={item.id}
                          className={`border-b align-top ${item.active ? "" : "bg-muted/30"}`}
                        >
                          <td className="p-3 font-medium">{client.name}</td>
                          <td className="p-3">{branchName(item.branch_id)}</td>
                          <td className="p-3">
                            <p className="font-semibold">{item.name}</p>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {item.id.slice(0, 8)}
                            </span>
                          </td>
                          <td className="p-3">
                            <Tag muted={!item.active}>{item.active ? "Ativo" : "Desativado"}</Tag>
                          </td>
                          <td className="whitespace-nowrap p-3">
                            {money(item.default_treatment_rate)}/{item.unit}
                          </td>
                          <td className="p-3">
                            {links
                              ? `${links.movements.length} atuais · ${links.legacyMovements.length} antigas`
                              : "…"}
                          </td>
                          <td className="p-3">
                            {links
                              ? `${links.cycles.length} atuais · ${links.legacyReports.length} antigos`
                              : "…"}
                          </td>
                          <td className="max-w-[250px] p-3">
                            <p className="text-xs">
                              {links
                                ? `${links.rules.length} regras específicas · ${links.templates.length} modelos`
                                : "…"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {companies.join(" · ") ||
                                (links ? "Sem regra de tratamento" : "Carregando…")}
                            </p>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setScopeClient("all");
                                  setBranch("all");
                                  setStatus("all");
                                  setSearch("");
                                  setSelected(item.id);
                                  setView("residues");
                                }}
                              >
                                Conexões
                              </Button>
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={!detail.data}
                                  onClick={() => editResidue(item)}
                                >
                                  Editar
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  for (const patio of emptyBranches.filter((row) =>
                    `${client.name} ${row.name}`.toLocaleLowerCase("pt-BR").includes(query),
                  ))
                    lines.push(
                      <tr key={`empty:${patio.id}`} className="border-b text-muted-foreground">
                        <td className="p-3">{client.name}</td>
                        <td className="p-3">{patio.name}</td>
                        <td className="p-3" colSpan={2}>
                          Sem resíduo específico
                        </td>
                        <td className="p-3" colSpan={4}>
                          Pode usar o cadastro geral do cliente, quando disponível.
                        </td>
                        <td className="p-3">
                          {canEditBranch && (
                            <Button variant="ghost" size="sm" onClick={() => editBranch(patio)}>
                              Editar filial
                            </Button>
                          )}
                        </td>
                      </tr>,
                    );
                  if (
                    !items.length &&
                    !emptyBranches.length &&
                    client.name.toLocaleLowerCase("pt-BR").includes(query)
                  )
                    lines.push(
                      <tr key={`empty:${client.id}`} className="border-b text-muted-foreground">
                        <td className="p-3">{client.name}</td>
                        <td className="p-3" colSpan={7}>
                          Sem filiais ou resíduos cadastrados.
                        </td>
                        <td className="p-3">
                          {canEditBranch && (
                            <Button asChild variant="ghost" size="sm">
                              <a href={`/clients/${client.id}/edit`}>Editar empresa</a>
                            </Button>
                          )}
                        </td>
                      </tr>,
                    );
                  return lines;
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {view === "branches" && (
        <Card className="overflow-x-auto p-5">
          <h3 className="mb-4 text-xl font-semibold">Todas as filiais e pátios</h3>
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-3">Empresa</th>
                <th className="p-3">Filial / pátio</th>
                <th className="p-3">Situação</th>
                <th className="p-3">Resíduos próprios</th>
                <th className="p-3">Conexões</th>
                <th className="p-3">Edição</th>
              </tr>
            </thead>
            <tbody>
              {allBranches.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="p-3">{clientLabel(item.client_id)}</td>
                  <td className="p-3 font-medium">{item.name}</td>
                  <td className="p-3">{item.is_active ? "Ativa" : "Desativada"}</td>
                  <td className="p-3">
                    {residues.filter((row) => row.branch_id === item.id).length}
                  </td>
                  <td className="p-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setScopeClient(item.client_id);
                        setBranch(item.id);
                        setSearch("");
                        setStatus("all");
                        setView("residues");
                      }}
                    >
                      Ver resíduos
                    </Button>
                  </td>
                  <td className="p-3">
                    {canEditBranch && (
                      <Button variant="ghost" size="sm" onClick={() => editBranch(item)}>
                        Editar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {view === "companies" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {catalog.data?.companies.map((company) => (
            <Card key={company.id} className="space-y-4 p-5">
              <h3 className="text-lg font-semibold">{companyName(company.id)}</h3>
              {detail.isPending ? (
                <p>Carregando regras…</p>
              ) : detail.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {detail.error.message}
                </p>
              ) : (
                <>
                  {detail.data?.templates
                    .filter((row) => row.outsourced_company_id === company.id)
                    .map((template) => (
                      <section key={template.id} className="rounded-lg border bg-muted/30 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-medium">
                            Modelo geral · {template.active ? "ativo" : "inativo"}
                          </h4>
                          {canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => editSetting(template, true)}
                            >
                              Editar modelo
                            </Button>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Abatimento {template.tax_withholding_rate}% · Locação{" "}
                          {template.rental_commission_rate}% · Troca{" "}
                          {template.exchange_commission_rate}%
                        </p>
                        {detail.data?.templateRates
                          .filter((row) => row.commission_template_id === template.id)
                          .map((rate) => (
                            <div
                              key={rate.id}
                              className="mt-3 flex items-center justify-between gap-2 border-t pt-2"
                            >
                              <span className="text-sm">
                                {rate.residue_name} · {money(rate.outsourced_treatment_rate)}/kg
                              </span>
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => editRate(rate, true)}
                                >
                                  Editar
                                </Button>
                              )}
                            </div>
                          ))}
                      </section>
                    ))}
                  {detail.data?.settings
                    .filter((row) => row.outsourced_company_id === company.id)
                    .map((setting) => (
                      <section key={setting.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-medium">{clientLabel(setting.client_id)}</h4>
                          {canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => editSetting(setting)}
                            >
                              Editar configuração
                            </Button>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {setting.active ? "Ativa" : "Inativa"} · Abatimento{" "}
                          {setting.tax_withholding_rate}% · Locação {setting.rental_commission_rate}
                          % · Troca {setting.exchange_commission_rate}%
                        </p>
                        {detail.data?.rates
                          .filter((row) => row.commission_setting_id === setting.id)
                          .map((rate) => {
                            const residue = residues.find(
                              (row) => row.id === rate.waste_residue_id,
                            );
                            return (
                              <div
                                key={rate.id}
                                className="mt-3 flex items-center justify-between gap-2 border-t pt-2"
                              >
                                <span className="text-xs">
                                  {residue?.name || "Resíduo indisponível"} ·{" "}
                                  {branchName(residue?.branch_id || null)} ·{" "}
                                  {money(rate.outsourced_treatment_rate)}/kg
                                </span>
                                {canEdit && (
                                  <Button variant="ghost" size="sm" onClick={() => editRate(rate)}>
                                    Editar
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                      </section>
                    ))}
                  {!detail.data?.settings.some((row) => row.outsourced_company_id === company.id) &&
                    !detail.data?.templates.some(
                      (row) => row.outsourced_company_id === company.id,
                    ) && (
                      <p className="text-sm text-muted-foreground">
                        Sem configuração de comissão cadastrada.
                      </p>
                    )}
                </>
              )}
            </Card>
          ))}
        </div>
      )}
      <div
        className={`${view === "residues" ? "grid" : "hidden"} items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)]`}
      >
        <Card className="p-3">
          <h3 className="px-2 pt-2 font-semibold">Empresas clientes</h3>
          <p className="px-2 pb-3 pt-1 text-xs text-muted-foreground">
            Ativos e desativados por empresa
          </p>
          <div className="max-h-[560px] space-y-1 overflow-y-auto">
            <button
              type="button"
              className={`w-full rounded-lg p-3 text-left text-sm font-semibold ${scopeClient === "all" ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
              onClick={() => {
                setScopeClient("all");
                setBranch("all");
                setSelected("");
              }}
            >
              Todas as empresas
            </button>
            {clients.map((client) => {
              const items = residues.filter((item) => item.client_id === client.id);
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => {
                    onClientChange(client.id);
                    setScopeClient(client.id);
                    setSelected("");
                    setBranch("all");
                    setSearch("");
                  }}
                  className={`w-full rounded-lg p-3 text-left transition-colors ${client.id === scopeClient ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                >
                  <span className="block text-sm font-medium leading-snug">{client.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {catalog.isPending || catalog.error
                      ? "Dados indisponíveis"
                      : `${items.filter((item) => item.active).length} ativos · ${items.filter((item) => !item.active).length} desativados`}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Abrangência do mapa
            </p>
            <h3 className="mt-1 text-xl font-semibold">{clientName}</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              ["Cadastros", clientResidues.length],
              ["Ativos", clientResidues.filter((item) => item.active).length],
              ["Desativados", clientResidues.filter((item) => !item.active).length],
              ["Possíveis duplicidades", duplicateScopes],
            ].map(([label, count]) => (
              <Card key={label} className="p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold">
                  {catalog.isPending || catalog.error ? "—" : count}
                </p>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                aria-label="Buscar resíduo ou pátio no mapa"
                placeholder="Buscar empresa, resíduo ou pátio"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44" aria-label="Situação no mapa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os cadastros</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Desativados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-52" aria-label="Pátio no mapa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os pátios</SelectItem>
                <SelectItem value="general">Geral do cliente</SelectItem>
                {branches.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {scopeClient === "all" ? `${clientLabel(item.client_id)} · ` : ""}
                    {item.name}
                    {!item.is_active ? " (inativo)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(230px,.85fr)_minmax(0,1.4fr)]">
            <Card className="max-h-[780px] overflow-y-auto p-2">
              {catalog.isPending ? (
                <p className="p-4 text-sm text-muted-foreground">Carregando cadastros…</p>
              ) : visible.length ? (
                visible.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item.id)}
                    className={`mb-1 w-full rounded-lg border p-3 text-left ${current?.id === item.id ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-muted/50"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{item.name}</span>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {clientLabel(item.client_id)} · {branchName(item.branch_id)}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Tag muted={!item.active}>{item.active ? "Ativo" : "Desativado"}</Tag>
                      <span className="text-xs font-medium">
                        {money(item.default_treatment_rate)}/{item.unit || "kg"}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  Nenhum cadastro encontrado para estes filtros.
                </p>
              )}
            </Card>
            {current && (
              <Card className="min-w-0 space-y-5 p-5">
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Tag muted={!current.active}>{current.active ? "Ativo" : "Desativado"}</Tag>
                    <Tag muted>
                      {current.branch_id ? "Específico do pátio" : "Padrão do cliente"}
                    </Tag>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-xl font-semibold">{current.name}</h3>
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => editResidue(current)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Editar resíduo
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {clientLabel(current.client_id)} · {branchName(current.branch_id)} ·{" "}
                    {money(current.default_treatment_rate)}/{current.unit || "kg"}
                  </p>
                  <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                    ID: {current.id}
                  </p>
                </div>
                {activeTwins.length > 1 && (
                  <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                    Há {activeTwins.length} cadastros ativos com o mesmo nome nesta abrangência.
                    Compare os IDs e os vínculos antes de desativar qualquer um.
                  </div>
                )}
                {!current.active && (
                  <p className="rounded-lg bg-muted p-3 text-sm">
                    Este cadastro está desativado. Ele pode desaparecer das opções de novos
                    lançamentos e do comissionamento, mesmo mantendo vínculos históricos.
                  </p>
                )}
                {detail.isPending ? (
                  <p className="text-sm text-muted-foreground">
                    Consultando os vínculos deste cliente…
                  </p>
                ) : detail.error ? (
                  <div role="alert" className="rounded-lg border border-destructive/30 p-3">
                    <p className="font-medium">Não foi possível consultar os vínculos.</p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {detail.error.message}
                    </p>
                    <Button
                      variant="outline"
                      className="mt-2"
                      onClick={() => void detail.refetch()}
                    >
                      Tentar novamente
                    </Button>
                  </div>
                ) : (
                  connections && (
                    <>
                      <section>
                        <h4 className="mb-3 flex items-center gap-2 font-semibold">
                          <GitBranch className="h-4 w-4 text-primary" />
                          Vínculos encontrados
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            ["Movimentações", connections.movements.length],
                            ["Locações / colocações", connections.placements.length],
                            ["BMs relacionados", connections.cycles.length],
                            ["Emissões por resíduo", connections.emissions.length],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-lg border p-3">
                              <p className="text-lg font-semibold">{value}</p>
                              <p className="text-xs text-muted-foreground">{label}</p>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Contagem por ID exato. Os vínculos dos demonstrativos antigos estão
                          discriminados abaixo.
                        </p>
                      </section>
                      <section>
                        <h4 className="mb-2 font-semibold">Terceirizadas e regras de tratamento</h4>
                        <div className="space-y-2">
                          {connections.rules.map((rule) => (
                            <div key={rule.id} className="rounded-lg border p-3 text-sm">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium">
                                  {companyName(rule.setting?.outsourced_company_id)}
                                </p>
                                {canEdit && (
                                  <Button variant="ghost" size="sm" onClick={() => editRate(rule)}>
                                    Editar regra
                                  </Button>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Regra vinculada a este ID ·{" "}
                                {rule.setting?.active
                                  ? "configuração ativa"
                                  : "configuração inativa ou indisponível"}
                              </p>
                              <p className="mt-2">
                                Terceirizada: {money(rule.outsourced_treatment_rate)}/kg · Jacoby:{" "}
                                {rule.jacoby_treatment_rate === null
                                  ? "automático"
                                  : `${money(rule.jacoby_treatment_rate)}/kg`}
                              </p>
                            </div>
                          ))}
                          {connections.templates.map((rule) => {
                            const overridden = connections.rules.some(
                              (item) =>
                                item.setting?.outsourced_company_id ===
                                rule.template?.outsourced_company_id,
                            );
                            return (
                              <div
                                key={rule.id}
                                className="rounded-lg border border-dashed p-3 text-sm"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-medium">
                                    {companyName(rule.template?.outsourced_company_id)}
                                  </p>
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => editRate(rule, true)}
                                    >
                                      Editar modelo
                                    </Button>
                                  )}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Modelo pelo nome do resíduo ·{" "}
                                  {overridden
                                    ? "regra específica acima tem prioridade"
                                    : rule.template?.active
                                      ? "modelo ativo"
                                      : "modelo inativo"}
                                </p>
                                <p className="mt-2">
                                  Terceirizada: {money(rule.outsourced_treatment_rate)}/kg · Jacoby:{" "}
                                  {rule.jacoby_treatment_rate === null
                                    ? "automático"
                                    : `${money(rule.jacoby_treatment_rate)}/kg`}
                                </p>
                              </div>
                            );
                          })}
                          {!connections.rules.length && !connections.templates.length && (
                            <p className="text-sm text-muted-foreground">
                              Nenhuma regra específica nem modelo com este nome encontrado. Isso não
                              determina sozinho o comissionamento de locação ou troca.
                            </p>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          A existência de uma regra não prova que ela foi aplicada: depende do
                          emissor do BM e das condições do lançamento.
                        </p>
                      </section>
                      <section>
                        <h4 className="mb-2 font-semibold">Onde este cadastro já foi usado</h4>
                        {connections.cycles.length ? (
                          <div className="flex flex-wrap gap-2">
                            {connections.cycles.map((cycle) => (
                              <span key={cycle.id} className="rounded-lg border px-3 py-2 text-xs">
                                BM #{String(cycle.bulletin_number).padStart(3, "0")} ·{" "}
                                {cycle.status === "closed" ? "finalizado" : "em edição"}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Nenhum BM V2 diretamente vinculado a este cadastro.
                          </p>
                        )}
                        {connections.equipment.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-sm font-medium">
                              Equipamentos vinculados pelo padrão ou pelos lançamentos
                            </p>
                            {connections.equipment.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                              >
                                <span>
                                  {item.identification || item.name} · {branchName(item.branch_id)}
                                </span>
                                {canEdit && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => editEquipment(item)}
                                  >
                                    Editar vínculo
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {connections.emissions.length > 0 && (
                          <p className="mt-3 text-sm">
                            Emissões:{" "}
                            {connections.emissions
                              .map(
                                (item) =>
                                  `#${item.display_number}${item.client_portal_visible ? " (visível no portal)" : " (fora do portal)"}`,
                              )
                              .join(", ")}
                            .
                          </p>
                        )}
                      </section>
                      <section className="rounded-lg border p-4">
                        <h4 className="font-semibold">Conexões nos demonstrativos antigos</h4>
                        <p className="mt-2 text-sm">
                          {connections.legacyMovements.length} movimentações ·{" "}
                          {connections.legacyRates.length} tabelas de valores ·{" "}
                          {connections.tickets.length} tickets de pesagem ·{" "}
                          {connections.legacyReports.length} demonstrativos.
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Vínculos diretos com o mesmo ID de resíduo. Os registros sem resíduo
                          cadastrado não são atribuídos por aproximação de nome.
                        </p>
                      </section>
                      <section className="rounded-xl bg-muted/50 p-4">
                        <h4 className="font-semibold">Reflexos no Faturamento</h4>
                        {canReadBilling ? (
                          <>
                            <p className="mt-2 text-sm">
                              {connections.commissions.length} registro(s) de comissão com este
                              resíduo e {connections.tracking.length} acompanhamento(s) nos BMs
                              relacionados.
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              O acompanhamento financeiro é do BM/categoria/empresa. Não representa
                              uma nota ou um valor exclusivo deste resíduo.
                            </p>
                          </>
                        ) : (
                          <p className="mt-2 text-sm">
                            Seu acesso não inclui Faturamento. Os registros financeiros não foram
                            consultados.
                          </p>
                        )}
                      </section>
                    </>
                  )
                )}
                <section className="border-t pt-4">
                  <h4 className="mb-2 flex items-center gap-2 font-semibold">
                    <Info className="h-4 w-4 text-primary" />O que muda se eu mexer aqui?
                  </h4>
                  <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                    <li>
                      <strong className="text-foreground">Cadastrar um tipo padrão:</strong> cria
                      uma opção de catálogo; não configura automaticamente o valor de todos os
                      clientes.
                    </li>
                    <li>
                      <strong className="text-foreground">Valor geral do cliente:</strong> serve de
                      padrão onde não há uma configuração ativa específica do pátio. Não é
                      necessário criar cópias para explicar essa herança.
                    </li>
                    <li>
                      <strong className="text-foreground">Renomear:</strong> mantém o ID, mas pode
                      mudar a correspondência com modelos de comissão por nome.
                    </li>
                    <li>
                      <strong className="text-foreground">Alterar valor ou comissão:</strong> afeta
                      regras distintas. Movimentações guardam taxas próprias; salvar comissão pode
                      recalcular registros de BMs finalizados.
                    </li>
                    <li>
                      <strong className="text-foreground">Desativar:</strong> oculta opções em
                      algumas telas; não é o mesmo que apagar. Nomes repetidos não garantem que os
                      cadastros sejam intercambiáveis.
                    </li>
                  </ul>
                </section>
              </Card>
            )}
          </div>
        </div>
      </div>
      {editing && (
        <ResidueMapEditor
          key={`${editing.table}:${editing.id}`}
          target={editing}
          fullScreen={fullScreen}
          onClose={() => setEditing(null)}
        />
      )}
      <p className={fullScreen ? "hidden" : "text-xs text-muted-foreground"}>
        O mapa usa os dados acessíveis pela sua conta. Abrir e explorar não altera nada; somente o
        botão Salvar alterações grava as edições revisadas. O banco configurado é o mesmo da Jacoby.
      </p>
    </div>
  );
}
