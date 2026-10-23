import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CYCLE_INVOICE_BUCKET, type CycleInvoice } from "@/lib/cycle-invoices";

export function ServiceInvoiceFiles({ files, serviceUrl }: { files: CycleInvoice[]; serviceUrl: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const qc = useQueryClient();
  async function open(file: CycleInvoice) {
    const {data,error} = await supabase.storage.from(CYCLE_INVOICE_BUCKET).createSignedUrl(file.path,600,{download:file.name});
    if (error || !data?.signedUrl) return toast.error(error?.message || "Não foi possível abrir o arquivo.");
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }
  return <section className="space-y-3 border-t bg-primary/5 p-4 sm:p-5">
    <h4 className="font-semibold">Notas e arquivos do serviço neste BM</h4>
    <p className="text-sm text-muted-foreground">O arquivo já está disponível para conferência. Você pode configurar a nota abaixo e completar o serviço no BM por aqui.</p>
    {files.map(file => <div key={file.path} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3">
      <span className="min-w-0 break-all text-sm">{file.name}</span>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void open(file)}>Baixar arquivo</Button>
        <Button size="sm" variant="outline" onClick={() => {
          const url = new URL(serviceUrl,window.location.origin);
          url.searchParams.set("serviceInvoice",file.path);
          setPreview(`${url.pathname}${url.search}${url.hash}`);
        }}>Configurar serviço no BM</Button>
      </div>
    </div>)}
    <Dialog open={Boolean(preview)} onOpenChange={open => {
      if (open) return;
      setPreview(null);
      for (const key of ["financial-cycle-invoices","financial-service-invoice-links","outsourced-financial-services","jacoby-direct-billing-data","outsourced-financial-cycles","billing-receivable-tracking"])
        void qc.invalidateQueries({queryKey:[key]});
    }}>
      <DialogContent className="flex h-[94vh] w-[96vw] max-w-none flex-col gap-2 p-4 sm:max-w-none">
        <DialogTitle>Configurar o serviço vinculado ao BM</DialogTitle>
        <DialogDescription>Esta é a tela do próprio boletim. As alterações salvas ficam no mesmo BM.</DialogDescription>
        {preview && <iframe title="Serviço e nota no boletim" className="min-h-0 w-full flex-1 rounded-lg border" src={preview} />}
      </DialogContent>
    </Dialog>
  </section>;
}
