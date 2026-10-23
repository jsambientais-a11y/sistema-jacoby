import { useMemo, useRef, useState } from "react";
import { EquipmentLinks } from "@/components/EquipmentLinks";
import { mapEquipmentInScope } from "@/lib/map-equipment";
import { useSessionView } from "@/hooks/use-session-view";
import {
  Building2,
  GitBranch,
  Leaf,
  Minus,
  Plus,
  Scan,
  Pencil,
  ExternalLink,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResidueImpactTrace } from "@/components/ResidueImpactTrace";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  residueConnections,
  type MapResidue,
  type MapBranch,
  type MapDetail,
  type MapEquipment,
} from "@/lib/residue-map";

type Node = {
  id: string;
  label: string;
  subtitle: string;
  x: number;
  y: number;
  kind: string;
  record?: MapResidue | MapBranch | MapEquipment;
  clientId?: string;
  explanation?: string;
  items?: string[];
  screen?: string;
};
export function ResidueMindMap({
  fullScreen = false,
  clients,
  residues,
  branches,
  detail,
  canEdit,
  canEditBranch,
  onEditResidue,
  onEditBranch,
  onEditSetting,
  onEditRate,
  companyName,
  onDetails,
  onRefresh,
}: {
  fullScreen?: boolean;
  clients: { id: string; name: string }[];
  residues: MapResidue[];
  branches: MapBranch[];
  detail?: MapDetail;
  canEdit: boolean;
  canEditBranch: boolean;
  onEditResidue: (item: MapResidue) => void;
  onEditBranch: (item: MapBranch) => void;
  onEditSetting: (
    item: MapDetail["settings"][number] | MapDetail["templates"][number],
    template?: boolean,
  ) => void;
  onEditRate: (
    item: MapDetail["rates"][number] | MapDetail["templateRates"][number],
    template?: boolean,
  ) => void;
  companyName: (id?: string) => string;
  onDetails: (item: MapResidue) => void;
  onRefresh: () => void;
}) {
  const [client, setClient] = useSessionView("jacoby:residue-map:canvas:client", "");
  const [branch, setBranch] = useSessionView<string | null>(
    "jacoby:residue-map:canvas:branch",
    null,
    (value) => value === null || typeof value === "string",
  );
  const [residue, setResidue] = useSessionView("jacoby:residue-map:canvas:residue", "");
  const [selected, setSelected] = useSessionView("jacoby:residue-map:canvas:selected", "root");
  const [search, setSearch] = useSessionView("jacoby:residue-map:canvas:search", "");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [zoom, setZoom] = useSessionView(
    "jacoby:residue-map:canvas:zoom",
    0.8,
    (value) => typeof value === "number" && Number.isFinite(value) && value >= 0.3 && value <= 1.6,
  );
  const [pan, setPan] = useSessionView(
    "jacoby:residue-map:canvas:pan",
    { x: 30, y: 35 },
    (value) =>
      !!value &&
      typeof value === "object" &&
      Number.isFinite((value as { x?: number }).x) &&
      Number.isFinite((value as { y?: number }).y),
  );
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const nodes = useMemo(() => {
    const mapResidues = residues.filter((item) => includeInactive || item.active);
    const residueLabel = includeInactive ? "resíduos" : "resíduos ativos";
    const equipmentLabel = includeInactive ? "equipamentos" : "equipamentos ativos";
    const mapEquipment = (detail?.equipment || []).filter((item) => includeInactive || item.active);
    const list: Node[] = [
      {
        id: "root",
        label: "Jacoby · conexões",
        subtitle: `${clients.length} empresas · ${branches.length} filiais · ${mapResidues.length} ${residueLabel} · ${mapEquipment.length} ${equipmentLabel}`,
        x: 0,
        y: 120,
        kind: "root",
        explanation:
          "Explore as empresas. Por padrão, o mapa mostra somente resíduos e equipamentos ativos. Marque Incluir desativados para consultar os cadastros históricos. Os vínculos usam os IDs dos cadastros.",
      },
    ];
    const q = search.trim().toLocaleLowerCase("pt-BR");
    const matches = clients.filter(
      (c) =>
        !q ||
        `${c.name} ${branches
          .filter((b) => b.client_id === c.id)
          .map((b) => b.name)
          .join(" ")} ${mapResidues
          .filter((r) => r.client_id === c.id)
          .map((r) => r.name)
          .join(" ")} ${mapEquipment
          .filter((e) => e.client_id === c.id)
          .map((e) => `${e.identification || ""} ${e.name}`)
          .join(" ")}`
          .toLocaleLowerCase("pt-BR")
          .includes(q),
    );
    matches.forEach((c, i) =>
      list.push({
        id: `client:${c.id}`,
        label: c.name,
        subtitle: `${branches.filter((b) => b.client_id === c.id).length} filiais · ${mapResidues.filter((r) => r.client_id === c.id).length} ${residueLabel} · ${mapEquipmentInScope(mapEquipment, c.id, null, true).length} ${equipmentLabel}`,
        x: 310,
        y: i * 116,
        kind: "client",
        clientId: c.id,
        screen: "residuos",
        explanation:
          "O cliente define a abrangência dos cadastros, equipamentos, boletins e regras específicas. Abra uma filial ou a abrangência geral para explorar.",
      }),
    );
    if (!client || !matches.some((c) => c.id === client)) return list;
    const groups = [
      { id: "general", name: "Geral do cliente" },
      ...branches.filter((b) => b.client_id === client),
    ];
    groups.forEach((b, i) =>
      list.push({
        id: `branch:${b.id}`,
        label: b.name,
        subtitle:
          b.id === "general"
            ? `${mapResidues.filter((r) => r.client_id === client && !r.branch_id).length} ${residueLabel} · ${mapEquipmentInScope(mapEquipment, client, "general", true).length} ${equipmentLabel} sem filial`
            : `${mapResidues.filter((r) => r.branch_id === b.id).length} ${residueLabel} · ${mapEquipmentInScope(mapEquipment, client, b.id, true).length} ${equipmentLabel}`,
        x: 640,
        y: i * 116,
        kind: "branch",
        clientId: client,
        record: b.id === "general" ? undefined : (b as MapBranch),
        screen: "residuos",
        explanation:
          "Os equipamentos e resíduos sem filial ficam em Geral do cliente. Os demais aparecem na filial correspondente. Um equipamento cadastrado aparece aqui mesmo sem resíduo ou BM vinculado.",
      }),
    );
    if (branch === null) return list;
    const items = mapResidues.filter(
      (r) => r.client_id === client && (r.branch_id || "general") === branch,
    );
    if (!items.length)
      list.push({
        id: "empty-residues",
        label: includeInactive ? "Nenhum resíduo cadastrado" : "Nenhum resíduo ativo",
        subtitle: "Nesta abrangência do cliente",
        x: 970,
        y: 0,
        kind: "empty",
        clientId: client,
        explanation: includeInactive
          ? "Não há cadastros de resíduos nesta abrangência."
          : "Não há resíduos ativos nesta abrangência. Para consultar cadastros desativados, marque Incluir desativados.",
      });
    items.forEach((r, i) =>
      list.push({
        id: `residue:${r.id}`,
        label: r.name,
        subtitle: `${r.active ? "Ativo" : "Desativado"} · ${r.unit || "kg"}`,
        x: 970,
        y: i * 116,
        kind: "residue",
        record: r,
        clientId: client,
        screen: "residuos",
        explanation:
          "Este é um cadastro individual. Nomes iguais podem ter filiais e valores diferentes. Os históricos continuam associados ao ID original.",
      }),
    );
    const equipmentInScope = mapEquipmentInScope(mapEquipment, client, branch, true);
    equipmentInScope.forEach((equipment, index) => {
      const placements = detail?.placements.filter((p) => p.equipment_id === equipment.id) || [];
      const movements =
        detail?.movements.filter(
          (m) => m.equipment_id === equipment.id || m.replacement_equipment_id === equipment.id,
        ) || [];
      const cycleIds = new Set([...placements, ...movements].map((row) => row.cycle_id));
      const equipmentCycles = detail?.cycles.filter((cycle) => cycleIds.has(cycle.id)) || [];
      list.push({
        id: `equipment:${equipment.id}`,
        label: equipment.identification
          ? `${equipment.identification} · ${equipment.name}`
          : equipment.name,
        subtitle: `Equipamento ${equipment.active ? "ativo" : "desativado"} · ${equipment.default_waste_residue_id ? "com resíduo padrão" : "sem resíduo padrão"}`,
        x: 970,
        y: (Math.max(items.length, 1) + index) * 116,
        kind: "equipment",
        record: equipment,
        clientId: client,
        screen: "equipamentos",
        explanation:
          "Cadastro direto desta empresa e abrangência. Não é necessário ter resíduo, colocação ou BM para aparecer no mapa. O cadastro completo mantém as regras de atualização dos valores do sistema.",
        items: [
          `Resíduo padrão: ${residues.find((r) => r.id === equipment.default_waste_residue_id)?.name || "não definido"}`,
          `${placements.length} colocações · ${movements.length} movimentações`,
          ...equipmentCycles.map(
            (c) => `BM #${String(c.bulletin_number).padStart(3, "0")} · ${c.status}`,
          ),
        ],
      });
    });
    const current = items.find((r) => r.id === residue);
    if (!current || !detail) return list;
    const links = residueConnections(current, detail);
    const sections = [
      {
        key: "equipment",
        label: "Equipamentos",
        screen: "equipamentos",
        text: "O resíduo padrão orienta novas seleções. Também aparecem equipamentos usados nos lançamentos vinculados.",
        items: links.equipment.map((e) => `${e.name} · ${e.identification || "sem identificação"}`),
      },
      {
        key: "movements",
        label: "Movimentações",
        screen: "bm",
        text: "Cada movimentação aponta para este ID. Taxas já registradas não são substituídas ao editar o valor padrão do cadastro.",
        items: [
          ...links.movements.map(
            (m) => `Movimentação ${m.id} · ${m.confirmed ? "confirmada" : "pendente"}`,
          ),
          ...links.legacyMovements.map((m) => `Movimentação antiga ${m.id}`),
        ],
      },
      {
        key: "bm",
        label: "Boletins de medição",
        screen: "bm",
        text: "Boletins ligados a este resíduo por movimentações, colocações, emissões ou comissões. O total do BM pode incluir outros resíduos.",
        items: [
          ...links.cycles.map(
            (b) => `BM #${String(b.bulletin_number).padStart(3, "0")} · ${b.status}`,
          ),
          ...links.emissions.map((e) => `Emissão ${e.display_number}`),
          ...links.legacyReports.map((b) => `Demonstrativo antigo · ${b.period_start}`),
        ],
      },
      {
        key: "commission",
        label: "Comissionamento",
        screen: "comissionamento",
        text: "Regras específicas apontam para o ID. Modelos por nome são correspondências possíveis; sua aplicação depende da terceirizada e das exceções do cliente. Edite as regras em Resíduos e conexões.",
        items: [
          ...links.rules.map((r) => `Regra específica ${r.id}`),
          ...links.templates.map((t) => `Modelo por nome ${t.id}`),
          ...links.commissions.map((c) => `Comissão ${c.id} · ${c.payment_status}`),
        ],
      },
      {
        key: "billing",
        label: "Faturamento",
        screen: "finance",
        text: "Acompanhamentos dos BMs relacionados. Esses registros são do BM e categoria, e não necessariamente exclusivos deste resíduo.",
        items: links.tracking.map(
          (t) => `${t.category} · NF ${t.invoice_number || "não informada"} · ${t.id}`,
        ),
      },
    ];
    sections.forEach((s, i) =>
      list.push({
        id: `impact:${s.key}`,
        label: s.label,
        subtitle: `${s.items.length} registros / correspondências`,
        x: 1340,
        y: i * 136,
        kind: "impact",
        clientId: client,
        screen: s.screen,
        explanation: s.text,
        items: s.items,
      }),
    );
    return list;
  }, [clients, branches, residues, detail, client, branch, residue, search, includeInactive]);
  const current = nodes.find((n) => n.id === selected) || nodes[0];
  const edges = nodes
    .filter((n) => n.id !== "root")
    .map((n) => {
      const parent =
        n.kind === "client"
          ? "root"
          : n.kind === "branch"
            ? `client:${client}`
            : n.kind === "residue" || n.kind === "empty" || n.kind === "equipment"
              ? `branch:${branch}`
              : `residue:${residue}`;
      return { from: nodes.find((a) => a.id === parent), to: n };
    });
  function choose(n: Node) {
    setSelected(n.id);
    if (n.id === "impact:billing" || n.id === "impact:commission") setTraceOpen(true);
    if (n.kind === "client") {
      setClient(n.clientId!);
      setBranch(null);
      setResidue("");
    }
    if (n.kind === "branch") {
      setBranch(n.id.slice(7));
      setResidue("");
    }
    if (n.kind === "residue") setResidue(n.record!.id);
    if (n.kind === "equipment") setResidue("");
    // Keep the selected node and the newly expanded column in view.
    setPan((p) => ({ ...p, x: Math.min(30, 160 - n.x * zoom), y: Math.min(35, 160 - n.y * zoom) }));
  }
  function screen(n: Node) {
    const params = new URLSearchParams({
      aba: n.screen === "bm" ? "faturamento2" : "configuracoes",
      mapCliente: n.clientId || client,
    });
    if (n.kind === "equipment" && n.record) params.set("mapEquipment", n.record.id);
    if (!["finance", "bm"].includes(n.screen || ""))
      params.set("mapConfig", n.screen || "residuos");
    setPreview({
      url: n.screen === "finance" ? "/financeiro" : `/portal/residuos?${params}`,
      title: n.label,
    });
  }
  return (
    <section
      className={`${fullScreen ? "flex min-h-0 flex-1 flex-col" : ""} overflow-hidden rounded-2xl border bg-card`}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h3 className="text-lg font-semibold">Mapa de conexões</h3>
          <p className="text-sm text-muted-foreground">
            Clique para expandir · arraste o fundo para navegar · use + e − para aproximar
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={includeInactive}
              onCheckedChange={(checked) => {
                setIncludeInactive(checked === true);
                setSelected(branch ? `branch:${branch}` : client ? `client:${client}` : "root");
              }}
            />
            Incluir desativados
          </label>
          <Input
            className="w-full sm:w-80"
            placeholder="Encontrar empresa, filial, resíduo ou equipamento…"
            aria-label="Buscar no mapa"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPan({ x: 30, y: 35 });
            }}
          />
        </div>
      </div>
      {!detail && (
        <p className="bg-muted p-3 text-sm">
          Carregando as conexões. Os impactos aparecerão quando a leitura terminar.
        </p>
      )}
      <div
        className={`${fullScreen ? "min-h-0 flex-1 overflow-y-auto" : ""} grid lg:grid-cols-[minmax(0,1fr)_320px]`}
      >
        <div
          className={`relative ${fullScreen ? "h-[60dvh] min-h-[280px] lg:h-full lg:min-h-0" : "h-[680px]"} overflow-hidden bg-[#f7f9f6] touch-none`}
          style={{
            backgroundImage: "radial-gradient(#cbd5c3 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current)
              setPan({
                x: drag.current.px + e.clientX - drag.current.x,
                y: drag.current.py + e.clientY - drag.current.y,
              });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}
          >
            <svg
              className="pointer-events-none absolute overflow-visible"
              width="1"
              height="1"
              aria-hidden="true"
            >
              {edges.map(
                ({ from, to }) =>
                  from && (
                    <path
                      key={to.id}
                      d={`M ${from.x + 260} ${from.y + 43} C ${from.x + 290} ${from.y + 43}, ${to.x - 35} ${to.y + 43}, ${to.x} ${to.y + 43}`}
                      fill="none"
                      stroke={selected === to.id ? "#397751" : "#b8c6b2"}
                      strokeWidth="2"
                    />
                  ),
              )}
            </svg>
            {nodes.map((n) => (
              <button
                key={n.id}
                onClick={() => choose(n)}
                aria-pressed={current.id === n.id}
                className={`absolute w-[260px] rounded-xl border-2 bg-white p-4 text-left text-slate-800 shadow-sm transition-shadow hover:shadow-lg ${current.id === n.id ? "border-green-700 ring-4 ring-green-100" : n.kind === "impact" ? "border-sky-200" : "border-slate-200"}`}
                style={{ left: n.x, top: n.y }}
              >
                <div className="mb-1 flex items-start gap-2">
                  {n.kind === "equipment" ? (
                    <Truck className="mt-1 h-4 w-4 shrink-0 text-sky-700" />
                  ) : n.kind === "residue" ? (
                    <Leaf className="mt-1 h-4 w-4 shrink-0 text-green-700" />
                  ) : n.kind === "client" ? (
                    <Building2 className="mt-1 h-4 w-4 shrink-0 text-green-700" />
                  ) : (
                    <GitBranch className="mt-1 h-4 w-4 shrink-0 text-green-700" />
                  )}
                  <span className="line-clamp-2 font-semibold leading-5">{n.label}</span>
                </div>
                <p className="line-clamp-2 text-xs text-slate-500" title={n.subtitle}>{n.subtitle}</p>
              </button>
            ))}
          </div>
          <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-xl border bg-white p-2 text-slate-800 shadow">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Diminuir mapa"
              onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-12 text-center text-sm">{Math.round(zoom * 100)}%</span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Ampliar mapa"
              onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Voltar ao início do mapa"
              onClick={() => {
                setZoom(0.8);
                setPan({ x: 30, y: 35 });
              }}
            >
              <Scan className="h-4 w-4" />
            </Button>
          </div>
          {!nodes.some((n) => n.kind === "client") && (
            <p className="absolute left-10 top-60 rounded-lg bg-white p-4 text-slate-700">
              Nenhuma empresa corresponde à busca.
            </p>
          )}
        </div>
        <aside
          className={`${fullScreen ? "min-h-0 lg:h-full" : "max-h-[680px]"} space-y-4 overflow-y-auto border-t bg-background p-5 lg:border-l lg:border-t-0`}
          aria-live="polite"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Entenda esta conexão
          </span>
          <h4 className="text-xl font-semibold">{current.label}</h4>
          <p className="text-sm text-muted-foreground">{current.explanation}</p>
          {current.clientId && (
            <p className="text-xs text-muted-foreground">
              {clients.find((c) => c.id === current.clientId)?.name}
            </p>
          )}
          {current.record && (
            <p className="break-all rounded-lg bg-muted p-2 font-mono text-[11px]">
              ID: {current.record.id}
            </p>
          )}
          {current.kind === "residue" && (
            <>
              <Button
                className="w-full"
                disabled={!canEdit}
                onClick={() => onEditResidue(current.record as MapResidue)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Editar este cadastro
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => onDetails(current.record as MapResidue)}
              >
                Ver valores e regras vinculadas
              </Button>
            </>
          )}
          {current.kind === "equipment" && current.record && (
            <div className="space-y-2">
              <Button className="w-full" disabled={!canEdit} onClick={() => screen(current)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar equipamento no cadastro
              </Button>
              <EquipmentLinks
                equipmentId={current.record.id}
                clientId={current.clientId!}
                label={(current.record as MapEquipment).identification || current.record.name}
              />
            </div>
          )}
          {current.kind === "branch" && current.record && (
            <Button
              className="w-full"
              disabled={!canEditBranch}
              onClick={() => onEditBranch(current.record as MapBranch)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Editar esta filial
            </Button>
          )}
          {current.clientId && (
            <Button className="w-full" onClick={() => setTraceOpen(true)}>
              Rastrear configuração → resultado
            </Button>
          )}
          {current.screen && (
            <>
              <Button className="w-full" variant="outline" onClick={() => screen(current)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Ver tela real do sistema
              </Button>
              <p className="text-xs text-muted-foreground">
                Abre o módulo real. Nos cadastros, a empresa já vai selecionada. Use os registros
                abaixo para localizar o lançamento; a tela pode incluir outros resíduos da empresa.
              </p>
            </>
          )}
          {current.items && (
            <div className="space-y-2">
              <h5 className="text-sm font-semibold">Registros vinculados</h5>
              {current.items.length ? (
                current.items.map((item, i) => (
                  <div key={i} className="break-words rounded-lg border p-3 text-xs">
                    {item}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum registro encontrado nesta conexão.
                </p>
              )}
            </div>
          )}
          <div className="rounded-xl bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            Navegar e arrastar o mapa não altera cadastros. As edições são revisadas antes de
            salvar. Use Incluir desativados para consultar os cadastros históricos.
          </div>
        </aside>
      </div>
      <Dialog open={traceOpen} onOpenChange={setTraceOpen}>
        <DialogContent className="flex h-[96dvh] w-[96vw] max-w-none flex-col overflow-hidden p-4 sm:max-w-none">
          <DialogTitle>Mapa de impactos · origem e aplicação</DialogTitle>
          <DialogDescription>
            Configuração, cálculo do BM e acordo de faturamento no contexto selecionado.
          </DialogDescription>
          <div className="min-h-0 flex-1 overflow-y-auto pr-2">
            <ResidueImpactTrace
              residues={residues}
              clientId={current.clientId || client}
              clientName={
                clients.find((item) => item.id === (current.clientId || client))?.name || "Cliente"
              }
              branchId={current.kind === "client" || current.kind === "equipment" ? null : branch}
              equipmentId={current.kind === "equipment" ? current.record?.id : undefined}
              residue={
                current.kind === "client" || current.kind === "branch" || current.kind === "equipment"
                  ? undefined
                  : residues.find((item) => item.id === residue && (includeInactive || item.active))
              }
              detail={detail}
              companyName={companyName}
              canEdit={canEdit}
              onEditSetting={onEditSetting}
              onEditRate={onEditRate}
              onOpen={(url, title) => setPreview({ url, title })}
            />
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) {
            setPreview(null);
            onRefresh();
          }
        }}
      >
        <DialogContent
          className={`flex ${fullScreen ? "h-[100dvh] w-screen rounded-none" : "h-[92vh] w-[96vw]"} max-w-none flex-col gap-2 p-4 sm:max-w-none`}
        >
          <DialogTitle>Tela do sistema · {preview?.title}</DialogTitle>
          <DialogDescription>
            Módulo real conectado ao cadastro. Alterações salvas nesta tela são efetivas.
          </DialogDescription>
          {preview && (
            <iframe
              title={`Tela real: ${preview.title}`}
              src={preview.url}
              className="min-h-0 flex-1 rounded-lg border bg-background"
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
