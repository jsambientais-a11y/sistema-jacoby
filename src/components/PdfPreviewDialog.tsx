/**
 * Visualizador de PDF dentro do sistema (boletins gerados e anexos do Boletim de Medição).
 * Substitui a aba "blob:" sem nome por um painel com título, download e abertura externa.
 */
import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type PdfPreviewTarget = {
  title: string;
  subtitle?: string;
  fileName: string;
  /** URL já pronta (blob ou assinada). */
  url: string;
  /** Revoga a URL ao fechar quando ela foi criada a partir de um Blob. */
  revokeOnClose?: boolean;
};

const INLINE_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "webp", "gif", "svg", "txt"];

/** Indica se o navegador consegue exibir o arquivo dentro do visualizador. */
export function canPreviewInline(fileName: string) {
  return INLINE_EXTENSIONS.includes(fileName.split(".").pop()?.toLowerCase() ?? "");
}

export function usePdfPreview() {
  const [target, setTarget] = useState<PdfPreviewTarget | null>(null);
  const open = useCallback((next: PdfPreviewTarget) => setTarget(next), []);
  const dialog = <PdfPreviewDialog target={target} onClose={() => setTarget(null)} />;
  return { openPdfPreview: open, pdfPreviewDialog: dialog };
}

function PdfPreviewDialog({ target, onClose }: { target: PdfPreviewTarget | null; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setLoaded(false);
    if (!target?.revokeOnClose) return;
    const url = target.url;
    return () => URL.revokeObjectURL(url);
  }, [target]);

  const download = async () => {
    if (!target) return;
    setDownloading(true);
    try {
      const response = await fetch(target.url);
      if (!response.ok) throw new Error("Não foi possível baixar o arquivo.");
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = target.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível baixar o arquivo.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b bg-gradient-to-r from-accent/70 via-card to-card px-5 py-3 pr-12 text-left">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base">{target?.title ?? "Visualizar PDF"}</DialogTitle>
            <DialogDescription className="truncate text-xs">{target?.subtitle || target?.fileName}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" asChild disabled={!target}>
              <a href={target?.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">Abrir em nova aba</span>
              </a>
            </Button>
            <Button size="sm" onClick={() => void download()} disabled={!target || downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Baixar
            </Button>
          </div>
        </DialogHeader>
        <div className="relative min-h-0 flex-1 bg-muted/40 p-3">
          {!loaded && (
            <div className="absolute inset-3 flex flex-col items-center justify-center gap-3 rounded-lg border bg-card">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Carregando documento…</p>
            </div>
          )}
          {target && (
            <iframe
              key={target.url}
              src={target.url}
              title={target.title}
              onLoad={() => setLoaded(true)}
              className={`h-full w-full rounded-lg border bg-background shadow-sm transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
