import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, FileText, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import jacobyLogo from "@/assets/jacoby-logo-transparent.png";

export const Route = createFileRoute("/_app/portal/boletins")({ component: ClientBulletinsPage });

type Bulletin = { id: string; bulletin_number: number; display_number?: string | null; waste_residue_id?: string | null; branch_id: string | null; period_start: string; period_end: string; finalized_at: string | null; client_branches?: { name: string | null } | null; billing_v2_cycle_services?: { amount: number; waste_services?: { name: string | null } | null }[] };
type Movement = { occurred_on: string; weight_kg: number; removed_quantity: number; treatment_rate: number; exchange_rate: number; service_order: string | null; waste_residues?: { name: string | null } | null };
type Placement = { quantity: number; monthly_rental_rate: number; started_on: string; ended_on: string | null };
type HistoricalBulletin = { id: string; bulletin_number: string; description: string | null; issuer_name: string | null; period_start: string; period_end: string; issued_on: string | null; total_amount: number | null; file_name: string; storage_path: string; client_branches?: { name: string | null } | null };

const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

function ClientBulletinsPage() {
  const { clientId } = useAuth();
  const { data: bulletins = [], isLoading } = useQuery({
    queryKey: ["portal-published-bulletins", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data: cycles, error } = await (supabase.from("billing_v2_cycles") as any)
        .select("id,bulletin_number,branch_id,period_start,period_end,finalized_at,client_branches(name),billing_v2_cycle_services(amount,waste_services(name))")
        .eq("client_id", clientId).eq("status", "closed").eq("client_portal_visible", true).order("finalized_at", { ascending: false });
      if (error) throw error;
      const { data: emissions, error: emissionsError } = await (supabase.from("billing_v2_residue_emissions") as any)
        .select("id,waste_residue_id,display_number,finalized_at,billing_v2_cycles!inner(id,bulletin_number,branch_id,period_start,period_end,client_id,client_branches(name))")
        .eq("client_portal_visible", true)
        .eq("billing_v2_cycles.client_id", clientId)
        .order("finalized_at", { ascending: false });
      if (emissionsError) throw emissionsError;
      const filtered = (emissions ?? []).map((item: any) => ({
        ...item.billing_v2_cycles,
        id: item.billing_v2_cycles.id,
        display_number: item.display_number,
        waste_residue_id: item.waste_residue_id,
        finalized_at: item.finalized_at,
      })) as Bulletin[];
      return [...((cycles ?? []) as Bulletin[]), ...filtered].sort((a, b) => String(b.finalized_at).localeCompare(String(a.finalized_at)));
    },
  });

  // Boletins emitidos antes do sistema: o cliente consulta o PDF original.
  const { data: historical = [] } = useQuery({
    queryKey: ["portal-historical-bulletins", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_historical_bulletins" as any) as any)
        .select("id,bulletin_number,description,issuer_name,period_start,period_end,issued_on,total_amount,file_name,storage_path,client_branches(name)")
        .eq("client_id", clientId).order("period_start", { ascending: false }).order("bulletin_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HistoricalBulletin[];
    },
  });
  const openHistorical = async (bulletin: HistoricalBulletin, download = false) => {
    const { data, error } = await supabase.storage.from("historical-bulletins").createSignedUrl(bulletin.storage_path, 600, download ? { download: bulletin.file_name } : undefined);
    if (error || !data?.signedUrl) return toast.error(error?.message || "Não foi possível abrir o boletim.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  // Filtros pelo mês de referência do boletim (início do período) e pela unidade.
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedBranch, setSelectedBranch] = useState("all");
  const all = [...bulletins, ...historical] as { period_start: string; client_branches?: { name: string | null } | null }[];
  const years = useMemo(() => Array.from(new Set(all.map((item) => item.period_start.slice(0, 4)))).sort().reverse(), [bulletins, historical]);
  const branchNames = useMemo(() => Array.from(new Set(all.map((item) => item.client_branches?.name || "Matriz"))).sort(), [bulletins, historical]);
  const matches = (item: { period_start: string; client_branches?: { name: string | null } | null }) =>
    (selectedYear === "all" || item.period_start.slice(0, 4) === selectedYear) &&
    (selectedMonth === "all" || item.period_start.slice(5, 7) === selectedMonth) &&
    (selectedBranch === "all" || (item.client_branches?.name || "Matriz") === selectedBranch);
  const shownBulletins = bulletins.filter(matches);
  const shownHistorical = historical.filter(matches);
  const filtering = selectedYear !== "all" || selectedMonth !== "all" || selectedBranch !== "all";

  const generatePdf = async (bulletin: Bulletin, openOnly = false) => {
    const [{ data: movements, error }, { data: placements, error: placementsError }] = await Promise.all([
      (supabase.from("billing_v2_movements") as any).select("occurred_on,weight_kg,removed_quantity,treatment_rate,exchange_rate,service_order,waste_residues(name)").eq("cycle_id", bulletin.id).eq("confirmed", true).order("occurred_on"),
      (supabase.from("billing_v2_placements") as any).select("quantity,monthly_rental_rate,started_on,ended_on").eq("cycle_id", bulletin.id).order("started_on"),
    ]);
    if (error || placementsError) return toast.error(error?.message || placementsError?.message || "Não foi possível carregar o boletim.");
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF();
    const services = bulletin.waste_residue_id ? [] : bulletin.billing_v2_cycle_services ?? [];
    const items = ((movements ?? []) as Movement[]).filter((item: any) => !bulletin.waste_residue_id || item.waste_residue_id === bulletin.waste_residue_id);
    const rentalItems = ((placements ?? []) as Placement[]).filter((item: any) => !bulletin.waste_residue_id || item.waste_residue_id === bulletin.waste_residue_id);
    pdf.setFillColor(62, 122, 79); pdf.rect(0, 0, 210, 46, "F");
    pdf.setFillColor(250, 253, 249); pdf.roundedRect(12, 6, 40, 28, 3, 3, "F");
    pdf.setDrawColor(210, 229, 205); pdf.setLineWidth(0.35); pdf.roundedRect(12, 6, 40, 28, 3, 3, "S");
    try { const image = new Image(); image.src = jacobyLogo; await image.decode(); pdf.addImage(image, "PNG", 15, 9, 34, 21); } catch { /* a marca não bloqueia a emissão */ }
    pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.text("BOLETIM DE MEDIÇÃO", 105, 16, { align: "center" });
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.text(`Período: ${date(bulletin.period_start)} a ${date(bulletin.period_end)}`, 105, 23, { align: "center" });
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.text(`BOLETIM #${bulletin.display_number || String(bulletin.bulletin_number).padStart(3, "0")}`, 105, 30, { align: "center" });
    pdf.setFillColor(236, 246, 228); pdf.roundedRect(14, 51, 182, 11, 2, 2, "F"); pdf.setTextColor(35, 96, 58); pdf.setFontSize(9); pdf.text("JACOBY SOLUÇÕES AMBIENTAIS · BOLETIM OPERACIONAL", 105, 58, { align: "center" });
    pdf.setFillColor(247, 250, 246); pdf.roundedRect(14, 69, 182, 27, 3, 3, "F"); pdf.setDrawColor(184, 210, 176); pdf.roundedRect(14, 69, 182, 27, 3, 3, "S");
    pdf.setTextColor(35, 96, 58); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.text("EMPRESA GERADORA / UNIDADE", 20, 76);
    pdf.setTextColor(39, 61, 45); pdf.setFontSize(10); pdf.text(bulletin.client_branches?.name || "Matriz", 20, 84);
    pdf.setTextColor(93, 112, 97); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.text("Documento disponibilizado para consulta no Portal do Cliente.", 20, 91);
    const rows = [
      ...rentalItems.map((item) => ({ name: "Locação de equipamento", type: "Equipamento", quantity: `${new Intl.NumberFormat("pt-BR").format(Number(item.quantity || 0))} un.`, value: Number(item.quantity || 0) * Number(item.monthly_rental_rate || 0) })),
      ...items.filter((item) => Number(item.removed_quantity || 0) > 0).map((item) => ({ name: `Troca · ${item.service_order || "Movimentação"}`, type: "Troca", quantity: `${new Intl.NumberFormat("pt-BR").format(Number(item.removed_quantity || 0))} un.`, value: Number(item.removed_quantity || 0) * Number(item.exchange_rate || 0) })),
      ...items.filter((item) => Number(item.weight_kg || 0) > 0).map((item) => ({ name: item.waste_residues?.name || "Tratamento de resíduos", type: "Resíduo", quantity: `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(item.weight_kg || 0))} kg`, value: Number(item.weight_kg || 0) * Number(item.treatment_rate || 0) })),
      ...services.map((item) => ({ name: item.waste_services?.name || "Serviço", type: "Serviço", quantity: "Avulso", value: Number(item.amount || 0) })),
    ];
    let y = 109;
    pdf.setFillColor(35, 96, 58); pdf.roundedRect(14, y, 182, 9, 2, 2, "F"); pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.text("ITEM", 20, y + 6); pdf.text("TIPO", 104, y + 6); pdf.text("QUANTIDADE", 139, y + 6); pdf.text("VALOR", 190, y + 6, { align: "right" }); y += 9;
    if (!rows.length) { pdf.setTextColor(93, 112, 97); pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text("Nenhum lançamento financeiro neste boletim.", 20, y + 8); y += 10; }
    rows.forEach((item, index) => { if (y > 270) { pdf.addPage(); y = 20; } if (index % 2 === 0) { pdf.setFillColor(247, 250, 246); pdf.rect(14, y, 182, 10, "F"); } pdf.setTextColor(39, 61, 45); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.text(item.name.slice(0, 42), 20, y + 6.5); pdf.setTextColor(93, 112, 97); pdf.text(item.type, 104, y + 6.5); pdf.text(item.quantity, 139, y + 6.5); pdf.setTextColor(39, 61, 45); pdf.text(money(item.value), 190, y + 6.5, { align: "right" }); y += 10; });
    const total = rows.reduce((sum, item) => sum + item.value, 0);
    if (y > 271) { pdf.addPage(); y = 24; }
    pdf.setFillColor(236, 246, 228); pdf.roundedRect(125, y + 4, 69, 12, 2, 2, "F"); pdf.setTextColor(35, 96, 58); pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.text("TOTAL DO BOLETIM", 130, y + 11); pdf.text(money(total), 190, y + 11, { align: "right" });
    pdf.setFontSize(8); pdf.setTextColor(93, 112, 97); pdf.text("Boletim disponibilizado no Portal do Cliente.", 105, Math.min(y + 26, 288), { align: "center" });
    const blob = pdf.output("blob"); const url = URL.createObjectURL(blob);
    if (openOnly) window.open(url, "_blank", "noopener,noreferrer");
    else { const link = document.createElement("a"); link.href = url; link.download = `Boletim-${bulletin.display_number || String(bulletin.bulletin_number).padStart(3, "0")}.pdf`; link.click(); }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6"><header><p className="text-sm font-medium text-primary">Portal do Cliente</p><h1 className="text-2xl font-bold">Boletins emitidos</h1><p className="text-sm text-muted-foreground">Consulte e baixe os boletins disponibilizados pela equipe Jacoby, com os valores e detalhes do período.</p></header><Card className="grid gap-4 p-4 sm:grid-cols-3"><div className="space-y-1.5"><label className="text-sm font-medium">Ano</label><Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os anos</SelectItem>{years.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><label className="text-sm font-medium">Mês</label><Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os meses</SelectItem>{months.map((month, index) => <SelectItem key={month} value={String(index + 1).padStart(2, "0")}>{month}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><label className="text-sm font-medium">Filial ou pátio</label><Select value={selectedBranch} onValueChange={setSelectedBranch}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os pátios e filiais</SelectItem>{branchNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></div></Card><Card className="overflow-hidden">{isLoading ? <p className="p-8 text-sm text-muted-foreground">Carregando boletins...</p> : shownBulletins.length ? <div className="divide-y">{shownBulletins.map((bulletin) => { const services = Array.from(new Set((bulletin.billing_v2_cycle_services ?? []).map((item) => item.waste_services?.name).filter(Boolean))); return <div key={`${bulletin.id}-${bulletin.display_number || "base"}`} className="flex flex-wrap items-center gap-4 p-5"><FileText className="h-6 w-6 text-primary" /><div className="min-w-0 flex-1"><p className="font-semibold">Boletim #{bulletin.display_number || String(bulletin.bulletin_number).padStart(3, "0")}</p><p className="text-sm text-muted-foreground">{bulletin.client_branches?.name || "Matriz"} · {date(bulletin.period_start)} a {date(bulletin.period_end)}</p>{bulletin.waste_residue_id && <p className="mt-1 text-sm text-muted-foreground">Emissão filtrada por resíduo.</p>}{services.length > 0 && <p className="mt-1 text-sm text-muted-foreground">Serviços: {services.join(" · ")}</p>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => void generatePdf(bulletin, true)}><Eye className="mr-2 h-4 w-4" />Visualizar</Button><Button onClick={() => void generatePdf(bulletin)}><Download className="mr-2 h-4 w-4" />Baixar PDF</Button></div></div>; })}</div> : <p className="p-10 text-center text-sm text-muted-foreground">{filtering ? "Nenhum boletim para os filtros selecionados." : "Nenhum boletim foi disponibilizado para consulta."}</p>}</Card>{shownHistorical.length > 0 && <section className="space-y-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><History className="h-5 w-5 text-primary" />Boletins anteriores</h2><p className="text-sm text-muted-foreground">Boletins emitidos antes do portal, disponíveis no documento original.</p></div><Card className="overflow-hidden"><div className="divide-y">{shownHistorical.map((bulletin) => <div key={bulletin.id} className="flex flex-wrap items-center gap-4 p-5"><FileText className="h-6 w-6 text-primary" /><div className="min-w-0 flex-1"><p className="font-semibold">Boletim nº {bulletin.bulletin_number}{bulletin.description ? ` · ${bulletin.description}` : ""}</p><p className="text-sm text-muted-foreground">{bulletin.client_branches?.name || "Matriz"} · {date(bulletin.period_start)} a {date(bulletin.period_end)}{bulletin.issuer_name ? ` · ${bulletin.issuer_name}` : ""}</p>{bulletin.total_amount != null && <p className="mt-1 text-sm text-muted-foreground">Total: {money(Number(bulletin.total_amount))}</p>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => void openHistorical(bulletin)}><Eye className="mr-2 h-4 w-4" />Visualizar</Button><Button onClick={() => void openHistorical(bulletin, true)}><Download className="mr-2 h-4 w-4" />Baixar PDF</Button></div></div>)}</div></Card></section>}</div>;
}
