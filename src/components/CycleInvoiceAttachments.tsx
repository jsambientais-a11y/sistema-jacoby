import { useEffect, useRef, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Eye, FileImage, FileSpreadsheet, FileText, Loader2, Replace, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BillingButton as Button, useBillingReadOnly } from "@/components/BillingReadOnly";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { canPreviewInline, usePdfPreview } from "@/components/PdfPreviewDialog";
import {
  CYCLE_INVOICE_BUCKET,
  cycleInvoiceFolder,
  cycleInvoicePath,
  listCycleInvoices,
  validateCycleInvoice,
  type CycleInvoice,
} from "@/lib/cycle-invoices";
// Ícone e cor por tipo de arquivo, para reconhecer a nota de relance.
function fileVisual(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return { Icon: FileText, cls: "bg-red-500/10 text-red-600 dark:text-red-400", label: "PDF" };
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return { Icon: FileImage, cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400", label: ext.toUpperCase() };
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return { Icon: FileSpreadsheet, cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", label: ext.toUpperCase() };
  return { Icon: FileText, cls: "bg-primary/10 text-primary", label: ext ? ext.toUpperCase() : "ARQ" };
}

export function CycleInvoiceAttachments({
  cycleId,
  bulletinLabel,
  linkedPaths,
  onLaunch,
  onChangeAttachment,
  serviceSaving,
  initialPath,
}: {
  cycleId: string;
  bulletinLabel: string;
  initialPath?: string | null;
  linkedPaths: string[];
  onLaunch: (invoice: CycleInvoice) => void;
  onChangeAttachment: (oldPath: string, replacement: CycleInvoice | null) => void;
  serviceSaving: boolean;
}) {
  const readOnly = useBillingReadOnly();
  const inputId = useId();
  const replacementInput = useRef<HTMLInputElement>(null);
  const replacing = useRef<CycleInvoice | null>(null);
  const [removing, setRemoving] = useState<CycleInvoice | null>(null);
  const { openPdfPreview, pdfPreviewDialog } = usePdfPreview();
  const qc = useQueryClient();
  const queryKey = ["billing-v2-cycle-invoices", cycleId];
  const attachments = useQuery({
    queryKey,
    enabled: Boolean(cycleId),
    queryFn: () => listCycleInvoices(supabase.storage.from(CYCLE_INVOICE_BUCKET), cycleId),
  });
  const launchedPath = useRef("");
  useEffect(() => {
    if (readOnly) return;
    const invoice = attachments.data?.find(file => file.path === initialPath);
    if (invoice && initialPath !== launchedPath.current && !linkedPaths.includes(invoice.path)) {
      launchedPath.current = invoice.path;
      onLaunch(invoice);
    }
  }, [attachments.data, initialPath, linkedPaths, onLaunch, readOnly]);
  const save = useMutation({
    mutationKey: ["billing-v2-cycle-attachment-write", cycleId],
    mutationFn: async ({ previous, file }: { previous?: CycleInvoice; file?: File }) => {
      if (readOnly) throw new Error("Este BM finalizado permite somente consulta.");
      const targetCycleId = cycleId;
      const bucket = supabase.storage.from(CYCLE_INVOICE_BUCKET);
      const services = () => supabase.from("billing_v2_cycle_services" as any) as any;
      if (previous) {
        const folder = `${cycleInvoiceFolder(targetCycleId)}/`;
        if (!previous.path.startsWith(folder) || previous.path.slice(folder.length).includes("/"))
          throw new Error("Selecione um arquivo deste BM.");
      }
      if (file) await validateCycleInvoice(file);

      const cycle = await (supabase.from("billing_v2_cycles" as any) as any)
        .select("id")
        .eq("id", targetCycleId)
        .maybeSingle();
      if (cycle.error) throw cycle.error;
      if (!cycle.data)
        throw new Error("Este BM não está mais disponível. Atualize a tela e tente novamente.");

      const links = previous
        ? await services().select("id").eq("cycle_id", targetCycleId).eq("invoice_pdf_path", previous.path)
        : null;
      if (links?.error) throw links.error;

      let replacement: CycleInvoice | null = null;
      if (file) {
        const path = cycleInvoicePath(targetCycleId, file.name, crypto.randomUUID());
        const result = await bucket.upload(path, file, {
          contentType: file.type || "application/octet-stream", upsert: false,
        });
        if (result.error) throw result.error;
        replacement = {
          path, name: path.split("/").pop()!.slice(38),
          size: file.size, createdAt: new Date().toISOString(),
        };
      }
      if (!previous) return { replacement, cleanupFailed: false };

      if (links?.data?.length) {
        const updated = await services()
          .update({ invoice_pdf_path: replacement?.path ?? null, invoice_pdf_name: replacement?.name ?? null })
          .eq("cycle_id", targetCycleId)
          .eq("invoice_pdf_path", previous.path)
          .select("id");
        if (updated.error || !updated.data?.length) {
          // Confirm the new file is unreferenced before cleaning up an uncertain write.
          if (replacement) {
            const current = await services().select("id").eq("cycle_id", targetCycleId)
              .eq("invoice_pdf_path", replacement.path).limit(1);
            if (!current.error && !current.data?.length) await bucket.remove([replacement.path]);
          }
          throw new Error(updated.error?.message || "O vínculo do arquivo mudou. Confira os anexos e tente novamente.");
        }
      }

      const remaining = await services().select("id").eq("cycle_id", targetCycleId)
        .eq("invoice_pdf_path", previous.path).limit(1);
      if (remaining.error || remaining.data?.length) {
        return { replacement, cleanupFailed: true };
      }
      const removed = await bucket.remove([previous.path]);
      return { replacement, cleanupFailed: Boolean(removed.error || !removed.data?.length) };
    },
    onSuccess: ({ replacement, cleanupFailed }, { previous }) => {
      setRemoving(null);
      if (cleanupFailed) {
        if (previous && replacement) onChangeAttachment(previous.path, replacement);
        toast.warning(replacement
          ? "O novo arquivo foi salvo. O anterior ainda precisa ser removido."
          : "Não foi possível remover o arquivo do armazenamento. Confira os anexos e tente novamente.");
      } else if (previous) {
        onChangeAttachment(previous.path, replacement);
        toast.success(replacement ? "Arquivo do BM substituído." : "Arquivo removido do BM.");
      } else {
        toast.success("Nota salva no BM, aguardando lançamento do serviço e do valor faturado.");
      }
    },
    onSettled: async () => {
      await Promise.all([
        ["billing-v2-cycle-invoices", cycleId], ["billing-v2-cycle-services", cycleId],
        ["financial-cycle-invoices"], ["financial-service-invoice-links"],
        ["outsourced-financial-services"], ["jacoby-direct-billing-data"],
      ].map(queryKey => qc.invalidateQueries({ queryKey })));
    },
    onError: (error: Error) => toast.error(`Não foi possível alterar o arquivo: ${error.message}`),
  });
  const busy = save.isPending || serviceSaving;
  const open = async (file: CycleInvoice) => {
    const result = await supabase.storage
      .from(CYCLE_INVOICE_BUCKET)
      .createSignedUrl(file.path, 600);
    if (result.error || !result.data?.signedUrl)
      return toast.error(result.error?.message || "Não foi possível abrir a nota.");
    if (!canPreviewInline(file.name)) {
      window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
      return;
    }
    openPdfPreview({ title: file.name, subtitle: `Nota do BM ${bulletinLabel}`, fileName: file.name, url: result.data.signedUrl });
  };
  return (
    <section
      className="mt-5 space-y-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-primary/[0.03] to-transparent p-4"
      aria-label="Notas e arquivos do BM"
    >
      {pdfPreviewDialog}
      <input
        ref={replacementInput}
        type="file"
        className="hidden"
        onChange={(event) => {
          const previous = replacing.current;
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          replacing.current = null;
          if (previous && file) save.mutate({ previous, file });
        }}
      />
      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => {
        if (!open && !save.isPending) setRemoving(null);
      }}>
        <AlertDialogContent>
          <AlertDialogTitle>Remover arquivo do BM?</AlertDialogTitle>
          <AlertDialogDescription className="break-all">
            O arquivo “{removing?.name}” será removido deste BM e do Faturamento.
            {removing && linkedPaths.includes(removing.path) && " O lançamento do serviço será mantido."}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={save.isPending}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={() => {
              if (removing) save.mutate({ previous: removing });
            }}>{save.isPending ? "Removendo…" : "Remover arquivo"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <FileText className="h-4 w-4" />
            </span>
            Notas e arquivos do BM {bulletinLabel}
          </h3>
          <ol className="mt-2 flex max-w-2xl flex-col gap-1.5 text-sm text-muted-foreground sm:flex-row sm:gap-4">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">1</span>
              Receba e anexe a nota.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">2</span>
              Com o valor faturado, lance o serviço usando o mesmo arquivo.
            </li>
          </ol>
          <p className="mt-1.5 text-xs text-muted-foreground">A nota aparece em Faturamento › Serviços assim que for anexada.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Enquanto aguarda o valor, a nota fica salva neste BM. Aceita PDF, imagens, XML, planilhas, documentos e qualquer outro tipo de arquivo, até 15 MB.
          </p>
        </div>
        <div>
          <input
            id={inputId}
            className="sr-only"
            type="file"
            disabled={readOnly || !cycleId || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) save.mutate({ file });
            }}
          />
          <Button asChild disabled={readOnly || !cycleId || busy}>
            <label
              htmlFor={inputId}
              className={busy ? "pointer-events-none" : "cursor-pointer"}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {busy ? "Salvando arquivo…" : "Anexar arquivo ao BM"}
            </label>
          </Button>
        </div>
      </div>
      {attachments.isPending ? (
        <p className="text-sm text-muted-foreground">Consultando notas deste BM…</p>
      ) : attachments.error ? (
        <div role="alert" className="text-sm text-destructive">
          <p>Não foi possível consultar os anexos: {attachments.error.message}</p>
          <Button allowReadOnly
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
          {attachments.data.map((file) => {
            const visual = fileVisual(file.name);
            const linked = linkedPaths.includes(file.path);
            return (
            <li
              key={file.path}
              className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2.5 shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-primary/30 hover:shadow-[var(--shadow-lift)] animate-in fade-in slide-in-from-bottom-1"
            >
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => void open(file)}
                  className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-105 ${visual.cls}`}
                  title="Abrir arquivo"
                >
                  <visual.Icon className="h-5 w-5" />
                  <span className="absolute -bottom-1 rounded bg-background px-1 text-[8px] font-bold tracking-wide shadow-sm">{visual.label}</span>
                </button>
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Salva no BM {bulletinLabel}
                    {file.createdAt ? ` · ${new Date(file.createdAt).toLocaleString("pt-BR")}` : ""}
                  </p>
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${linked ? "bg-primary/12 text-primary" : "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200"}`}>
                    {linked ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                    {linked ? "Vinculada ao serviço neste BM" : "Aguardando lançamento do serviço e valor"}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
              <Button allowReadOnly variant="outline" size="sm" onClick={() => void open(file)}>
                <Eye className="h-4 w-4" />
                Abrir nota
              </Button>
              {!readOnly && <>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => {
                  replacing.current = file;
                  replacementInput.current?.click();
                }}>
                  <Replace className="h-4 w-4" />
                  Substituir arquivo
                </Button>
                <Button variant="outline" size="sm" className="text-destructive" disabled={busy} onClick={() => setRemoving(file)}>
                  <Trash2 className="h-4 w-4" />
                  Remover
                </Button>
              </>}
              {!linked && <Button size="sm" disabled={busy} onClick={() => onLaunch(file)}>Lançar serviço com esta nota</Button>}
              </div>
            </li>
            );
          })}
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
