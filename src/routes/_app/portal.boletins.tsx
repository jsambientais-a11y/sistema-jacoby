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
import { usePdfPreview } from "@/components/PdfPreviewDialog";
import { bulletinNumber, generateBulletinPdf } from "@/lib/bulletin-pdf";

export const Route = createFileRoute("/_app/portal/boletins")({ component: ClientBulletinsPage });

type Bulletin = { id: string; client_id: string; issuer_type: string; outsourced_company_id: string | null; bulletin_number: number; display_number?: string | null; waste_residue_id?: string | null; branch_id: string | null; period_start: string; period_end: string; finalized_at: string | null; client_branches?: { name: string | null } | null; billing_v2_cycle_services?: { amount: number; waste_services?: { name: string | null } | null }[] };
type HistoricalBulletin = { id: string; bulletin_number: string; description: string | null; issuer_name: string | null; period_start: string; period_end: string; issued_on: string | null; total_amount: number | null; file_name: string; storage_path: string; client_branches?: { name: string | null } | null };

const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

function ClientBulletinsPage() {
  const { clientId } = useAuth();
  const { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  const { data: bulletins = [], isLoading } = useQuery({
    queryKey: ["portal-published-bulletins", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data: cycles, error } = await (supabase.from("billing_v2_cycles") as any)
        .select("id,client_id,issuer_type,outsourced_company_id,bulletin_number,branch_id,period_start,period_end,finalized_at,client_branches(name),billing_v2_cycle_services(amount,waste_services(name))")
        .eq("client_id", clientId).eq("status", "closed").eq("client_portal_visible", true).order("finalized_at", { ascending: false });
      if (error) throw error;
      const { data: emissions, error: emissionsError } = await (supabase.from("billing_v2_residue_emissions") as any)
        .select("id,waste_residue_id,display_number,finalized_at,billing_v2_cycles!inner(id,bulletin_number,branch_id,period_start,period_end,client_id,issuer_type,outsourced_company_id,client_branches(name))")
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
    if (download) return void window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    openPdfPreview({ title: `Boletim nº ${bulletin.bulletin_number}`, subtitle: `${bulletin.client_branches?.name || "Matriz"} · ${date(bulletin.period_start)} a ${date(bulletin.period_end)}`, fileName: bulletin.file_name, url: data.signedUrl });
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

  // Mesmo gerador usado pela equipe no Boletim de Medição: o cliente recebe o documento idêntico.
  const generatePdf = async (bulletin: Bulletin, openOnly = false) => {
    try {
      const table = (name: string) => supabase.from(name as any) as any;
      const [placements, movements, services, client, branches, equipment, residues, profile] = await Promise.all([
        table("billing_v2_placements").select("*").eq("cycle_id", bulletin.id).order("started_on"),
        table("billing_v2_movements").select("*").eq("cycle_id", bulletin.id).order("occurred_on"),
        table("billing_v2_cycle_services").select("*").eq("cycle_id", bulletin.id),
        table("clients").select("*").eq("id", bulletin.client_id).maybeSingle(),
        table("client_branches").select("id,name,cnpj,address").eq("client_id", bulletin.client_id),
        table("waste_equipment").select("id,identification,name,equipment_type").eq("client_id", bulletin.client_id),
        table("waste_residues").select("id,name").eq("client_id", bulletin.client_id),
        table("company_profiles").select("legal_name,trade_name,cnpj,address,postal_code,phone,email,environmental_license,logo_url").limit(1).maybeSingle(),
      ]);
      const failure = [placements, movements, services, client, branches, equipment, residues, profile].find((result) => result.error);
      if (failure) throw failure.error;
      const cycleServices = services.data ?? [];
      const companyIds = [...new Set([bulletin.outsourced_company_id, ...cycleServices.map((item: any) => item.outsourced_company_id)].filter(Boolean))];
      const serviceIds = [...new Set(cycleServices.map((item: any) => item.waste_service_id).filter(Boolean))];
      const [companies, wasteServices] = await Promise.all([
        companyIds.length ? table("outsourced_companies").select("id,legal_name,trade_name,logo_url,cnpj,address,postal_code,phone,environmental_license").in("id", companyIds) : { data: [], error: null },
        serviceIds.length ? table("waste_services").select("id,name").in("id", serviceIds) : { data: [], error: null },
      ]);
      if (companies.error || wasteServices.error) throw companies.error || wasteServices.error;
      const residueId = bulletin.waste_residue_id || "all";
      const scoped = residueId !== "all";
      const label = bulletin.display_number ? `#${bulletin.display_number}` : bulletinNumber(bulletin.bulletin_number);
      const pdf = await generateBulletinPdf({
        cycle: bulletin,
        placements: (placements.data ?? []).filter((item: any) => !scoped || item.waste_residue_id === residueId),
        movements: (movements.data ?? []).filter((item: any) => !scoped || item.waste_residue_id === residueId),
        services: scoped ? [] : cycleServices,
        residueId,
        bulletinLabel: label,
        client: client.data ? { ...client.data, name: client.data.name } : null,
        branches: branches.data ?? [],
        equipment: equipment.data ?? [],
        residues: residues.data ?? [],
        wasteServices: wasteServices.data ?? [],
        outsourcedCompanies: companies.data ?? [],
        companyProfile: profile.data ?? null,
      });
      const url = URL.createObjectURL(pdf.blob);
      if (openOnly) {
        openPdfPreview({ title: `Boletim ${label}`, subtitle: `${bulletin.client_branches?.name || "Matriz"} · ${date(bulletin.period_start)} a ${date(bulletin.period_end)}`, fileName: pdf.fileName, url, revokeOnClose: true });
        return;
      }
      const link = document.createElement("a"); link.href = url; link.download = `Boletim-${bulletin.display_number || String(bulletin.bulletin_number).padStart(3, "0")}.pdf`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error((error as { message?: string } | null)?.message || "Não foi possível carregar o boletim.");
    }
  };

  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">{pdfPreviewDialog}<header><p className="text-sm font-medium text-primary">Portal do Cliente</p><h1 className="text-2xl font-bold">Boletins emitidos</h1><p className="text-sm text-muted-foreground">Consulte e baixe os boletins disponibilizados pela equipe Jacoby, com os valores e detalhes do período.</p></header><Card className="grid gap-4 p-4 sm:grid-cols-3"><div className="space-y-1.5"><label className="text-sm font-medium">Ano</label><Select value={selectedYear} onValueChange={setSelectedYear}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os anos</SelectItem>{years.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><label className="text-sm font-medium">Mês</label><Select value={selectedMonth} onValueChange={setSelectedMonth}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os meses</SelectItem>{months.map((month, index) => <SelectItem key={month} value={String(index + 1).padStart(2, "0")}>{month}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><label className="text-sm font-medium">Filial ou pátio</label><Select value={selectedBranch} onValueChange={setSelectedBranch}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os pátios e filiais</SelectItem>{branchNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent></Select></div></Card><Card className="overflow-hidden">{isLoading ? <p className="p-8 text-sm text-muted-foreground">Carregando boletins...</p> : shownBulletins.length ? <div className="divide-y">{shownBulletins.map((bulletin) => { const services = Array.from(new Set((bulletin.billing_v2_cycle_services ?? []).map((item) => item.waste_services?.name).filter(Boolean))); return <div key={`${bulletin.id}-${bulletin.display_number || "base"}`} className="flex flex-wrap items-center gap-4 p-5"><FileText className="h-6 w-6 text-primary" /><div className="min-w-0 flex-1"><p className="font-semibold">Boletim #{bulletin.display_number || String(bulletin.bulletin_number).padStart(3, "0")}</p><p className="text-sm text-muted-foreground">{bulletin.client_branches?.name || "Matriz"} · {date(bulletin.period_start)} a {date(bulletin.period_end)}</p>{bulletin.waste_residue_id && <p className="mt-1 text-sm text-muted-foreground">Emissão filtrada por resíduo.</p>}{services.length > 0 && <p className="mt-1 text-sm text-muted-foreground">Serviços: {services.join(" · ")}</p>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => void generatePdf(bulletin, true)}><Eye className="mr-2 h-4 w-4" />Visualizar</Button><Button onClick={() => void generatePdf(bulletin)}><Download className="mr-2 h-4 w-4" />Baixar PDF</Button></div></div>; })}</div> : <p className="p-10 text-center text-sm text-muted-foreground">{filtering ? "Nenhum boletim para os filtros selecionados." : "Nenhum boletim foi disponibilizado para consulta."}</p>}</Card>{shownHistorical.length > 0 && <section className="space-y-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><History className="h-5 w-5 text-primary" />Boletins anteriores</h2><p className="text-sm text-muted-foreground">Boletins emitidos antes do portal, disponíveis no documento original.</p></div><Card className="overflow-hidden"><div className="divide-y">{shownHistorical.map((bulletin) => <div key={bulletin.id} className="flex flex-wrap items-center gap-4 p-5"><FileText className="h-6 w-6 text-primary" /><div className="min-w-0 flex-1"><p className="font-semibold">Boletim nº {bulletin.bulletin_number}{bulletin.description ? ` · ${bulletin.description}` : ""}</p><p className="text-sm text-muted-foreground">{bulletin.client_branches?.name || "Matriz"} · {date(bulletin.period_start)} a {date(bulletin.period_end)}{bulletin.issuer_name ? ` · ${bulletin.issuer_name}` : ""}</p>{bulletin.total_amount != null && <p className="mt-1 text-sm text-muted-foreground">Total: {money(Number(bulletin.total_amount))}</p>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => void openHistorical(bulletin)}><Eye className="mr-2 h-4 w-4" />Visualizar</Button><Button onClick={() => void openHistorical(bulletin, true)}><Download className="mr-2 h-4 w-4" />Baixar PDF</Button></div></div>)}</div></Card></section>}</div>;
}
