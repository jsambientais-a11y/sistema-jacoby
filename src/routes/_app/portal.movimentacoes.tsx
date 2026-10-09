import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ClipboardCheck, FileText, Recycle, Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/portal/movimentacoes")({ component: ClientMovementsPage });

type Movement = {
  id: string; occurred_on: string; branch_name: string; residue_name: string | null;
  removed_equipment: string | null; placed_equipment: string | null; placed_quantity: number;
  removed_quantity: number; weight_kg: number; service_order: string | null; observation: string | null;
  attachments: MovementAttachment[];
};
type MovementAttachment = { id: string; name: string; path: string };
type Branch = { id: string; name: string };
const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const formatKg = (value: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value || 0)} kg`;
// As variações de madeira (por tipo de viagem) aparecem como um único resíduo.
const residueLabel = (name: string | null) => {
  const clean = (name || "").trim();
  return clean.toLocaleUpperCase("pt-BR").startsWith("MADEIRA") ? "MADEIRA" : clean || null;
};
const HISTORY_TAG = "[Histórico LDJ]";

function ClientMovementsPage() {
  const { clientId } = useAuth();
  const { data: movements = [], isLoading } = useQuery({
    // Nunca reutilizar a memória de outro login no mesmo navegador. Isso evita
    // que uma troca de conta mostre momentaneamente dados de outro cliente.
    queryKey: ["client-confirmed-movements", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const [{ data, error }, history] = await Promise.all([
        (supabase.rpc("jacoby_client_confirmed_movements") as any),
        // Coletas anteriores ao sistema, importadas dos relatórios mensais publicados.
        (supabase.from("waste_movements" as any) as any)
          .select("id,occurred_on,weight_kg,service_order,observation,placed_quantity,removed_quantity,operation_type,waste_residues(name),client_branches(name),waste_reports!inner(client_id,status)")
          .eq("waste_reports.client_id", clientId)
          .eq("waste_reports.status", "published")
          .neq("operation_type", "container_placement"),
      ]);
      if (error) throw error;
      if (history.error) throw history.error;
      const historical = (history.data ?? []).map((item: any) => ({
        id: item.id, occurred_on: item.occurred_on, branch_name: item.client_branches?.name || "Matriz",
        residue_name: item.waste_residues?.name ?? null, removed_equipment: null, placed_equipment: null,
        placed_quantity: Number(item.placed_quantity || 0), removed_quantity: Number(item.removed_quantity || 0),
        weight_kg: Number(item.weight_kg || 0), service_order: item.service_order,
        observation: String(item.observation || "").replace(HISTORY_TAG, "").trim() || null, attachments: [],
      })) as Movement[];
      return [...((data ?? []) as Movement[]), ...historical]
        .map((item) => ({ ...item, residue_name: residueLabel(item.residue_name) }))
        .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
    },
  });
  const { data: clientBranches = [] } = useQuery({
    queryKey: ["client-movement-branches", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_branches") as any)
        .select("id,name")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });
  const years = useMemo(() => Array.from(new Set(movements.map((item) => item.occurred_on.slice(0, 4)))).sort().reverse(), [movements]);
  const branches = useMemo(() => Array.from(new Set([
    ...clientBranches.map((branch) => branch.name),
    ...movements.map((item) => item.branch_name || "Unidade não informada"),
  ])).sort(), [clientBranches, movements]);
  const residues = useMemo(() => Array.from(new Set(movements.map((item) => item.residue_name || "Sem resíduo"))).sort(), [movements]);
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [selectedResidue, setSelectedResidue] = useState("all");
  const yearAndBranchMovements = useMemo(() => movements.filter((item) => item.occurred_on.slice(0, 4) === selectedYear && (selectedBranch === "all" || (item.branch_name || "Unidade não informada") === selectedBranch)), [movements, selectedYear, selectedBranch]);
  const yearBranchAndResidueMovements = useMemo(() => yearAndBranchMovements.filter((item) => selectedResidue === "all" || (item.residue_name || "Sem resíduo") === selectedResidue), [yearAndBranchMovements, selectedResidue]);
  const filteredMovements = useMemo(() => yearBranchAndResidueMovements.filter((item) => selectedMonth === "all" || item.occurred_on.slice(5, 7) === selectedMonth), [yearBranchAndResidueMovements, selectedMonth]);
  const chartData = useMemo(() => months.map((month, index) => {
    const items = yearBranchAndResidueMovements.filter((item) => Number(item.occurred_on.slice(5, 7)) === index + 1);
    return { month, movimentacoes: items.length, peso: items.reduce((sum, item) => sum + Number(item.weight_kg || 0), 0) };
  }), [yearBranchAndResidueMovements]);
  const totalWeight = filteredMovements.reduce((sum, item) => sum + Number(item.weight_kg || 0), 0);
  const periodLabel = `${selectedMonth === "all" ? "Todo o ano" : months[Number(selectedMonth) - 1]} de ${selectedYear}${selectedBranch === "all" ? "" : ` · ${selectedBranch}`}${selectedResidue === "all" ? "" : ` · ${selectedResidue}`}`;
  const openAttachment = async (attachment: MovementAttachment) => {
    const { data, error } = await supabase.storage.from("movement-documents").createSignedUrl(attachment.path, 600);
    if (error || !data?.signedUrl) return toast.error(error?.message || "Não foi possível abrir o PDF.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <header><p className="text-sm font-medium text-primary">Portal do Cliente</p><h1 className="text-2xl font-bold">Movimentações</h1><p className="text-sm text-muted-foreground">Acompanhe as movimentações confirmadas para cobrança. Os valores completos de cada boletim estão em Boletins emitidos.</p></header>
    <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4"><div className="space-y-1.5"><label className="text-sm font-medium">Ano</label><Select value={selectedYear} onValueChange={(year) => { setSelectedYear(year); setSelectedMonth("all"); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from(new Set([String(new Date().getFullYear()), ...years])).sort().reverse().map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><label className="text-sm font-medium">Mês</label><Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os meses</SelectItem>{months.map((month, index) => <SelectItem key={month} value={String(index + 1).padStart(2, "0")}>{month}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><label className="text-sm font-medium">Filial ou pátio</label><Select value={selectedBranch} onValueChange={setSelectedBranch}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os pátios e filiais</SelectItem>{branches.map((branch) => <SelectItem key={branch} value={branch}>{branch}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><label className="text-sm font-medium">Resíduo</label><Select value={selectedResidue} onValueChange={setSelectedResidue}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os resíduos</SelectItem>{residues.map((residue) => <SelectItem key={residue} value={residue}>{residue}</SelectItem>)}</SelectContent></Select></div></Card>
    <div className="grid gap-4 sm:grid-cols-3"><Metric icon={ClipboardCheck} label="Movimentações confirmadas" value={String(filteredMovements.length)} /><Metric icon={Scale} label="Peso movimentado" value={formatKg(totalWeight)} /><Metric icon={Recycle} label="Resíduos movimentados" value={String(new Set(filteredMovements.map((item) => item.residue_name || "Sem resíduo")).size)} /></div>
    <Card className="p-5"><div className="mb-4"><h2 className="font-semibold">Movimentações por mês</h2><p className="text-sm text-muted-foreground">Gráfico anual de {selectedYear}{selectedBranch === "all" ? "" : ` para ${selectedBranch}`}{selectedResidue === "all" ? "" : ` · ${selectedResidue}`}. Ele é alimentado automaticamente pelas movimentações confirmadas.</p></div><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip formatter={(value: number, name: string) => [name === "peso" ? formatKg(value) : value, name === "peso" ? "Peso" : "Movimentações"]} /><Bar dataKey="movimentacoes" name="Movimentações" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
    <Card className="overflow-hidden"><div className="border-b p-5"><h2 className="font-semibold">Movimentações confirmadas · {periodLabel}</h2><p className="text-sm text-muted-foreground">Registro operacional do período.</p></div>{isLoading ? <p className="p-8 text-sm text-muted-foreground">Carregando movimentações...</p> : !filteredMovements.length ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma movimentação confirmada para estes filtros.</p> : <div className="divide-y">{filteredMovements.map((item) => <div key={item.id} className="flex flex-wrap items-start gap-4 p-4"><Recycle className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="font-medium">{item.residue_name || "Resíduo não informado"}</p><span className="text-sm text-muted-foreground">· {item.branch_name || "Unidade não informada"}</span></div><p className="mt-1 text-sm text-muted-foreground">{new Intl.DateTimeFormat("pt-BR").format(new Date(`${item.occurred_on}T00:00:00`))}{item.service_order ? ` · OS ${item.service_order}` : ""}</p><p className="mt-1 text-sm text-muted-foreground">Retirada: {item.removed_equipment || "—"} · Colocação: {item.placed_equipment || "—"}{item.observation ? ` · ${item.observation}` : ""}</p></div><div className="flex flex-col items-end gap-1 text-right text-sm"><div><p className="font-semibold">{formatKg(Number(item.weight_kg || 0))}</p><p className="text-muted-foreground">{Number(item.removed_quantity || 0)} retirada(s) · {Number(item.placed_quantity || 0)} colocada(s)</p></div>{(item.attachments || []).map((attachment) => <Button key={attachment.id} size="sm" variant="outline" title={attachment.name} onClick={() => void openAttachment(attachment)}><FileText className="mr-2 h-4 w-4" /><span className="max-w-48 truncate">{attachment.name}</span></Button>)}</div></div>)}</div>}</Card>
  </div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof ClipboardCheck; label: string; value: string }) {
  return <Card className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div><Icon className="h-5 w-5 text-primary" /></div></Card>;
}
