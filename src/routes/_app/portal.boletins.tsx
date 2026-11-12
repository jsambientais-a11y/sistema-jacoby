import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Download, Eye, FileText, History, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { type PdfPreviewTarget, usePdfPreview } from "@/components/PdfPreviewDialog";
import { bulletinNumber, generateBulletinPdf } from "@/lib/bulletin-pdf";

import { matchesBulletinNumber } from "@/lib/billing-bulletins";
import { residueNameKey, uniqueResidueNames } from "@/lib/residue-names";
import { CYCLE_INVOICE_BUCKET, listCycleInvoices } from "@/lib/cycle-invoices";

export const Route = createFileRoute("/_app/portal/boletins")({ component: ClientBulletinsPage });

type Bulletin = {
  id: string;
  client_id: string;
  issuer_type: string;
  outsourced_company_id: string | null;
  bulletin_number: number;
  display_number?: string | null;
  waste_residue_id?: string | null;
  branch_id: string | null;
  period_start: string;
  period_end: string;
  finalized_at: string | null;
  client_branches?: { name: string | null } | null;
  billing_v2_cycle_services?: { amount: number; waste_services?: { name: string | null } | null }[];
};
type HistoricalBulletin = {
  id: string;
  bulletin_number: string;
  description: string | null;
  issuer_name: string | null;
  period_start: string;
  period_end: string;
  issued_on: string | null;
  total_amount: number | null;
  file_name: string;
  storage_path: string;
  client_branches?: { name: string | null } | null;
};

const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const months = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

type PortalResidue = { id: string; name: string; inFullBm: boolean };
type PortalInvoice = { path: string; name: string };

const labelFor = (bulletin: Bulletin) =>
  bulletin.display_number
    ? `#${bulletin.display_number}`
    : bulletinNumber(bulletin.bulletin_number);

function BulletinInvoices({
  bulletin,
  userId,
  openPdfPreview,
}: {
  bulletin: Bulletin;
  userId?: string;
  openPdfPreview: (target: PdfPreviewTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const bucket = supabase.storage.from(CYCLE_INVOICE_BUCKET);
  const {
    data: invoices = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["portal-bulletin-invoices", userId, bulletin.client_id, bulletin.id],
    enabled: expanded && !!userId,
    queryFn: async () => {
      const [direct, serviceResult] = await Promise.all([
        listCycleInvoices(bucket, bulletin.id),
        (supabase.from("billing_v2_cycle_services") as any)
          .select("id,invoice_pdf_path,invoice_pdf_name")
          .eq("cycle_id", bulletin.id)
          .not("invoice_pdf_path", "is", null),
      ]);
      if (serviceResult.error) throw serviceResult.error;
      const files = new Map<string, PortalInvoice>(direct.map((file) => [file.path, file]));
      for (const service of (serviceResult.data ?? []) as {
        id: string;
        invoice_pdf_path: string;
        invoice_pdf_name: string | null;
      }[]) {
        const path = service.invoice_pdf_path;
        if (files.has(path) || !path.startsWith(`service-invoices/${service.id}/`)) continue;
        const basename = path.split("/").pop() || "Nota fiscal";
        files.set(path, { path, name: service.invoice_pdf_name || basename.replace(/^\d+-/, "") });
      }
      return [...files.values()];
    },
  });

  const openInvoice = async (file: PortalInvoice) => {
    setOpening(file.path);
    try {
      const previewable = /\.(pdf|png|jpe?g|webp|gif)$/i.test(file.name);
      const { data, error } = await bucket.createSignedUrl(
        file.path,
        300,
        previewable ? undefined : { download: file.name },
      );
      if (error || !data?.signedUrl) throw error || new Error("URL indisponível");
      if (previewable) {
        openPdfPreview({
          title: file.name,
          subtitle: `Nota fiscal do BM ${labelFor(bulletin)}`,
          fileName: file.name,
          url: data.signedUrl,
        });
      } else {
        const link = document.createElement("a");
        link.href = data.signedUrl;
        link.click();
      }
    } catch {
      toast.error("Não foi possível abrir o arquivo. Ele pode ter sido removido ou substituído.");
      void refetch();
    } finally {
      setOpening(null);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        aria-expanded={expanded}
        aria-controls={`bm-invoices-${bulletin.id}`}
        onClick={() => setExpanded(!expanded)}
      >
        <Paperclip className="mr-2 h-4 w-4" />
        Notas fiscais
        <ChevronDown
          className={`ml-2 h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </Button>
      {expanded && (
        <div
          id={`bm-invoices-${bulletin.id}`}
          className="basis-full space-y-2 rounded-lg border bg-muted/30 p-3"
        >
          {isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Carregando notas fiscais…
            </p>
          ) : isError ? (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-sm">
                Não foi possível carregar as notas fiscais.
              </p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma nota fiscal anexada a este BM.</p>
          ) : (
            <ul className="divide-y">
              {invoices.map((file) => (
                <li
                  key={file.path}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="min-w-0 break-all text-sm">{file.name}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={opening !== null}
                    onClick={() => void openInvoice(file)}
                  >
                    {opening === file.path
                      ? "Abrindo…"
                      : /\.(pdf|png|jpe?g|webp|gif)$/i.test(file.name)
                        ? "Visualizar nota"
                        : "Baixar arquivo"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function ClientBulletinsPage() {
  const { clientId, user } = useAuth();
  const { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  const {
    data: bulletins = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["portal-published-bulletins", user?.id, clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: cycles, error } = await (supabase.from("billing_v2_cycles") as any)
        .select(
          "id,client_id,issuer_type,outsourced_company_id,bulletin_number,branch_id,period_start,period_end,finalized_at,client_branches(name),billing_v2_cycle_services(amount,waste_services(name))",
        )
        .eq("client_id", clientId)
        .eq("status", "closed")
        .eq("client_portal_visible", true)
        .order("finalized_at", { ascending: false });
      if (error) throw error;
      const { data: emissions, error: emissionsError } = await (
        supabase.from("billing_v2_residue_emissions") as any
      )
        .select(
          "id,waste_residue_id,display_number,finalized_at,billing_v2_cycles!inner(id,bulletin_number,branch_id,period_start,period_end,client_id,issuer_type,outsourced_company_id,client_branches(name))",
        )
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
      return [...((cycles ?? []) as Bulletin[]), ...filtered].sort((a, b) =>
        String(b.finalized_at).localeCompare(String(a.finalized_at)),
      );
    },
  });

  // Boletins emitidos antes do sistema: o cliente consulta o PDF original.
  const { data: historical = [] } = useQuery({
    queryKey: ["portal-historical-bulletins", user?.id, clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("client_historical_bulletins" as any) as any)
        .select(
          "id,bulletin_number,description,issuer_name,period_start,period_end,issued_on,total_amount,file_name,storage_path,client_branches(name)",
        )
        .eq("client_id", clientId)
        .order("period_start", { ascending: false })
        .order("bulletin_number", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HistoricalBulletin[];
    },
  });
  const openHistorical = async (bulletin: HistoricalBulletin, download = false) => {
    const { data, error } = await supabase.storage
      .from("historical-bulletins")
      .createSignedUrl(
        bulletin.storage_path,
        600,
        download ? { download: bulletin.file_name } : undefined,
      );
    if (error || !data?.signedUrl)
      return toast.error(error?.message || "Não foi possível abrir o boletim.");
    if (download) return void window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    openPdfPreview({
      title: `Boletim nº ${bulletin.bulletin_number}`,
      subtitle: `${bulletin.client_branches?.name || "Matriz"} · ${date(bulletin.period_start)} a ${date(bulletin.period_end)}`,
      fileName: bulletin.file_name,
      url: data.signedUrl,
    });
  };

  const {
    data: residuesByCycle = {},
    isError: residueError,
    isLoading: residuesLoading,
  } = useQuery({
    queryKey: ["portal-bulletin-residues", user?.id, clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("jacoby_portal_bulletin_residues", {
        p_client_id: clientId!,
      });
      if (error) throw error;
      return (data ?? {}) as Record<string, PortalResidue[]>;
    },
  });

  // Filtros pelo mês de referência do boletim (início do período) e pela unidade.
  const [number, setNumber] = useState("");
  const [selectedResidue, setSelectedResidue] = useState("all");
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedBranch, setSelectedBranch] = useState("all");
  const all = [...bulletins, ...historical] as {
    period_start: string;
    client_branches?: { name: string | null } | null;
  }[];
  const years = useMemo(
    () =>
      Array.from(new Set(all.map((item) => item.period_start.slice(0, 4))))
        .sort()
        .reverse(),
    [bulletins, historical],
  );
  const branchNames = useMemo(
    () => Array.from(new Set(all.map((item) => item.client_branches?.name || "Matriz"))).sort(),
    [bulletins, historical],
  );
  const matches = (item: {
    period_start: string;
    client_branches?: { name: string | null } | null;
  }) =>
    (selectedYear === "all" || item.period_start.slice(0, 4) === selectedYear) &&
    (selectedMonth === "all" || item.period_start.slice(5, 7) === selectedMonth) &&
    (selectedBranch === "all" || (item.client_branches?.name || "Matriz") === selectedBranch);
  const residuesFor = (bulletin: Bulletin) =>
    (residuesByCycle[bulletin.id] ?? []).filter((residue) =>
      bulletin.waste_residue_id ? residue.id === bulletin.waste_residue_id : residue.inFullBm,
    );
  const residueOptions = uniqueResidueNames(bulletins.flatMap(residuesFor));
  const shownBulletins = bulletins.filter(
    (item) =>
      matches(item) &&
      matchesBulletinNumber(labelFor(item), number) &&
      (selectedResidue === "all" ||
        residuesFor(item).some(
          (residue) => `residue:${residueNameKey(residue.name)}` === selectedResidue,
        )),
  );
  const shownHistorical =
    selectedResidue === "all"
      ? historical.filter(
          (item) => matches(item) && matchesBulletinNumber(item.bulletin_number, number),
        )
      : [];
  const filtering =
    !!number.trim() ||
    selectedResidue !== "all" ||
    selectedYear !== "all" ||
    selectedMonth !== "all" ||
    selectedBranch !== "all";

  // Mesmo gerador usado pela equipe no Boletim de Medição: o cliente recebe o documento idêntico.
  const generatePdf = async (bulletin: Bulletin, openOnly = false) => {
    try {
      const table = (name: string) => supabase.from(name as any) as any;
      const [placements, movements, services, client, branches, equipment, residues, profile] =
        await Promise.all([
          table("billing_v2_placements")
            .select("*")
            .eq("cycle_id", bulletin.id)
            .order("started_on"),
          table("billing_v2_movements")
            .select("*")
            .eq("cycle_id", bulletin.id)
            .order("occurred_on"),
          table("billing_v2_cycle_services").select("*").eq("cycle_id", bulletin.id),
          table("clients").select("*").eq("id", bulletin.client_id).maybeSingle(),
          table("client_branches")
            .select("id,name,cnpj,address")
            .eq("client_id", bulletin.client_id),
          table("waste_equipment")
            .select("id,identification,name,equipment_type")
            .eq("client_id", bulletin.client_id),
          table("waste_residues").select("id,name").eq("client_id", bulletin.client_id),
          table("company_profiles")
            .select(
              "legal_name,trade_name,cnpj,address,postal_code,phone,email,environmental_license,logo_url",
            )
            .limit(1)
            .maybeSingle(),
        ]);
      const failure = [
        placements,
        movements,
        services,
        client,
        branches,
        equipment,
        residues,
        profile,
      ].find((result) => result.error);
      if (failure) throw failure.error;
      const cycleServices = services.data ?? [];
      const companyIds = [
        ...new Set(
          [
            bulletin.outsourced_company_id,
            ...cycleServices.map((item: any) => item.outsourced_company_id),
          ].filter(Boolean),
        ),
      ];
      const serviceIds = [
        ...new Set(cycleServices.map((item: any) => item.waste_service_id).filter(Boolean)),
      ];
      const [companies, wasteServices] = await Promise.all([
        companyIds.length
          ? table("outsourced_companies")
              .select(
                "id,legal_name,trade_name,logo_url,cnpj,address,postal_code,phone,environmental_license",
              )
              .in("id", companyIds)
          : { data: [], error: null },
        serviceIds.length
          ? table("waste_services").select("id,name").in("id", serviceIds)
          : { data: [], error: null },
      ]);
      if (companies.error || wasteServices.error) throw companies.error || wasteServices.error;
      const residueId = bulletin.waste_residue_id || "all";
      const scoped = residueId !== "all";
      const label = labelFor(bulletin);
      const pdf = await generateBulletinPdf({
        cycle: bulletin,
        placements: (placements.data ?? []).filter(
          (item: any) => !scoped || item.waste_residue_id === residueId,
        ),
        movements: (movements.data ?? []).filter(
          (item: any) => !scoped || item.waste_residue_id === residueId,
        ),
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
        openPdfPreview({
          title: `Boletim ${label}`,
          subtitle: `${bulletin.client_branches?.name || "Matriz"} · ${date(bulletin.period_start)} a ${date(bulletin.period_end)}`,
          fileName: pdf.fileName,
          url,
          revokeOnClose: true,
        });
        return;
      }
      const link = document.createElement("a");
      link.href = url;
      link.download = `Boletim-${bulletin.display_number || String(bulletin.bulletin_number).padStart(3, "0")}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(
        (error as { message?: string } | null)?.message || "Não foi possível carregar o boletim.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {pdfPreviewDialog}
      <header>
        <p className="text-sm font-medium text-primary">Portal do Cliente</p>
        <h1 className="text-2xl font-bold">Boletins emitidos</h1>
        <p className="text-sm text-muted-foreground">
          Consulte e baixe os boletins disponibilizados pela equipe Jacoby, e consulte as notas
          fiscais anexadas.
        </p>
      </header>
      <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <label htmlFor="portal-bm-number" className="text-sm font-medium">
            Número do BM
          </label>
          <Input
            id="portal-bm-number"
            type="search"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            placeholder="Ex.: 015 ou 015.2"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="portal-bm-residue" className="text-sm font-medium">
            Resíduo
          </label>
          <Select
            value={selectedResidue}
            onValueChange={setSelectedResidue}
            disabled={residueError || residuesLoading}
          >
            <SelectTrigger id="portal-bm-residue">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os resíduos</SelectItem>
              {residueOptions.map(({ id: key, name }) => (
                <SelectItem key={key} value={`residue:${key}`}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {residueError && (
            <p role="alert" className="text-xs text-muted-foreground">
              Não foi possível carregar os resíduos.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Ano</label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os anos</SelectItem>
              {years.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Mês</label>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os meses</SelectItem>
              {months.map((month, index) => (
                <SelectItem key={month} value={String(index + 1).padStart(2, "0")}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Filial ou pátio</label>
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os pátios e filiais</SelectItem>
              {branchNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>
      {selectedResidue !== "all" && historical.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Os boletins anteriores ao portal não têm resíduos cadastrados para este filtro.
        </p>
      )}
      <Card className="overflow-hidden">
        {isError ? (
          <p role="alert" className="p-8 text-sm text-muted-foreground">
            Não foi possível carregar os boletins emitidos.
          </p>
        ) : isLoading ? (
          <p className="p-8 text-sm text-muted-foreground">Carregando boletins...</p>
        ) : shownBulletins.length ? (
          <div className="divide-y">
            {shownBulletins.map((bulletin) => {
              const services = Array.from(
                new Set(
                  (bulletin.billing_v2_cycle_services ?? [])
                    .map((item) => item.waste_services?.name)
                    .filter(Boolean),
                ),
              );
              const residues = uniqueResidueNames(residuesFor(bulletin));
              return (
                <div
                  key={`${bulletin.id}-${bulletin.display_number || "base"}`}
                  className="flex flex-wrap items-center gap-4 p-5"
                >
                  <FileText className="h-6 w-6 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Boletim {labelFor(bulletin)}</p>
                    <p className="text-sm text-muted-foreground">
                      {bulletin.client_branches?.name || "Matriz"} · {date(bulletin.period_start)} a{" "}
                      {date(bulletin.period_end)}
                    </p>
                    {residues.length > 0 && (
                      <ul aria-label="Resíduos do boletim" className="mt-1 flex flex-wrap gap-1.5">
                        {residues.map(({ id, name }) => (
                          <li
                            key={id}
                            className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                          >
                            {name}
                          </li>
                        ))}
                      </ul>
                    )}
                    {services.length > 0 && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Serviços: {services.join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void generatePdf(bulletin, true)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Visualizar
                    </Button>
                    <Button onClick={() => void generatePdf(bulletin)}>
                      <Download className="mr-2 h-4 w-4" />
                      Baixar PDF
                    </Button>
                  </div>
                  {!bulletin.waste_residue_id && (
                    <BulletinInvoices
                      bulletin={bulletin}
                      userId={user?.id}
                      openPdfPreview={openPdfPreview}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {filtering
              ? "Nenhum boletim para os filtros selecionados."
              : "Nenhum boletim foi disponibilizado para consulta."}
          </p>
        )}
      </Card>
      {shownHistorical.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <History className="h-5 w-5 text-primary" />
              Boletins anteriores
            </h2>
            <p className="text-sm text-muted-foreground">
              Boletins emitidos antes do portal, disponíveis no documento original.
            </p>
          </div>
          <Card className="overflow-hidden">
            <div className="divide-y">
              {shownHistorical.map((bulletin) => (
                <div key={bulletin.id} className="flex flex-wrap items-center gap-4 p-5">
                  <FileText className="h-6 w-6 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      Boletim nº {bulletin.bulletin_number}
                      {bulletin.description ? ` · ${bulletin.description}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {bulletin.client_branches?.name || "Matriz"} · {date(bulletin.period_start)} a{" "}
                      {date(bulletin.period_end)}
                      {bulletin.issuer_name ? ` · ${bulletin.issuer_name}` : ""}
                    </p>
                    {bulletin.total_amount != null && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Total: {money(Number(bulletin.total_amount))}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => void openHistorical(bulletin)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Visualizar
                    </Button>
                    <Button onClick={() => void openHistorical(bulletin, true)}>
                      <Download className="mr-2 h-4 w-4" />
                      Baixar PDF
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
