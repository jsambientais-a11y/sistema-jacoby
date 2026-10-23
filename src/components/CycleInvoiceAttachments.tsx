import { useEffect, useRef, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  CYCLE_INVOICE_BUCKET,
  cycleInvoicePath,
  listCycleInvoices,
  validateCycleInvoice,
  type CycleInvoice,
} from "@/lib/cycle-invoices";
export function CycleInvoiceAttachments({
  cycleId,
  bulletinLabel,
  linkedPaths,
  onLaunch,
  initialPath,
}: {
  cycleId: string;
  bulletinLabel: string;
  initialPath?: string | null;
  linkedPaths: string[];
  onLaunch: (invoice: CycleInvoice) => void;
}) {
  const inputId = useId();
  const qc = useQueryClient();
  const queryKey = ["billing-v2-cycle-invoices", cycleId];
  const attachments = useQuery({
    queryKey,
    enabled: Boolean(cycleId),
    queryFn: () => listCycleInvoices(supabase.storage.from(CYCLE_INVOICE_BUCKET), cycleId),
  });
  const launchedPath = useRef("");
  useEffect(() => {
    const invoice = attachments.data?.find(file => file.path === initialPath);
    if (invoice && initialPath !== launchedPath.current && !linkedPaths.includes(invoice.path)) {
      launchedPath.current = invoice.path;
      onLaunch(invoice);
    }
  }, [attachments.data, initialPath, linkedPaths, onLaunch]);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      // Capture the target BM for the entire upload, even if navigation changes meanwhile.
      const targetCycleId = cycleId;
      await validateCycleInvoice(file);
      const cycle = await (supabase.from("billing_v2_cycles" as any) as any)
        .select("id")
        .eq("id", targetCycleId)
        .maybeSingle();
      if (cycle.error) throw cycle.error;
      if (!cycle.data)
        throw new Error("Este BM não está mais disponível. Atualize a tela antes de anexar.");
      const path = cycleInvoicePath(targetCycleId, file.name, crypto.randomUUID());
      const result = await supabase.storage
        .from(CYCLE_INVOICE_BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (result.error) throw result.error;
      return targetCycleId;
    },
    onSuccess: async (targetCycleId) => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["billing-v2-cycle-invoices", targetCycleId] }), qc.invalidateQueries({queryKey:["financial-cycle-invoices"]})]);
      toast.success("Nota salva no BM, aguardando lançamento do serviço e do valor faturado.");
    },
    onError: (error: Error) => toast.error(`Não foi possível salvar a nota: ${error.message}`),
  });
  const open = async (file: CycleInvoice) => {
    const result = await supabase.storage
      .from(CYCLE_INVOICE_BUCKET)
      .createSignedUrl(file.path, 600);
    if (result.error || !result.data?.signedUrl)
      return toast.error(result.error?.message || "Não foi possível abrir a nota.");
    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <section
      className="mt-5 space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4"
      aria-label="Notas e arquivos do BM"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4 text-primary" />
            Notas e arquivos do BM {bulletinLabel}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            1. Receba e anexe a nota. 2. Quando tiver o valor faturado, lance o serviço usando
            o mesmo arquivo. A nota aparece em Faturamento › Serviços assim que for anexada.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Enquanto aguarda o valor, a nota fica salva neste BM. Aceita PDF, imagens, XML, planilhas, documentos e qualquer outro tipo de arquivo, até 15 MB.
          </p>
        </div>
        <div>
          <input
            id={inputId}
            className="sr-only"
            type="file"
            disabled={!cycleId || upload.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) upload.mutate(file);
            }}
          />
          <Button asChild disabled={!cycleId || upload.isPending}>
            <label
              htmlFor={inputId}
              className={upload.isPending ? "pointer-events-none" : "cursor-pointer"}
            >
              {upload.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {upload.isPending ? "Salvando arquivo…" : "Anexar arquivo ao BM"}
            </label>
          </Button>
        </div>
      </div>
      {attachments.isPending ? (
        <p className="text-sm text-muted-foreground">Consultando notas deste BM…</p>
      ) : attachments.error ? (
        <div role="alert" className="text-sm text-destructive">
          <p>Não foi possível consultar os anexos: {attachments.error.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void attachments.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : attachments.data?.length ? (
        <ul className="space-y-2">
          {attachments.data.map((file) => (
            <li
              key={file.path}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <p className="break-all text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  Salva no BM {bulletinLabel}
                  {file.createdAt ? ` · ${new Date(file.createdAt).toLocaleString("pt-BR")}` : ""}
                </p>
                <p className="mt-1 text-xs font-medium text-primary">
                  {linkedPaths.includes(file.path) ? "Vinculada ao serviço neste BM" : "Aguardando lançamento do serviço e valor"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void open(file)}>
                Abrir nota
              </Button>
              {!linkedPaths.includes(file.path) && <Button size="sm" onClick={() => onLaunch(file)}>Lançar serviço com esta nota</Button>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed bg-background/60 p-3 text-sm text-muted-foreground">
          Nenhum arquivo anexado diretamente a este BM. Você já pode anexar, mesmo com a lista de
          serviços vazia.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Os arquivos vinculados a um serviço específico continuam na linha desse serviço, abaixo.
      </p>
    </section>
  );
}
