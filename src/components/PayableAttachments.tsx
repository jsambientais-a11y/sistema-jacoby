import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { payableAttachmentBucket, uploadPayableAttachments } from "@/lib/payable-attachments";

export function PayableAttachments({
  accountId,
  description,
  readOnly,
  initialFiles,
  onClose,
}: {
  accountId: string;
  description: string;
  readOnly: boolean;
  initialFiles: File[];
  onClose: () => void;
}) {
  const [files, setFiles] = useState(initialFiles);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const attachments = useQuery({
    queryKey: ["payable-attachments", accountId],
    queryFn: async () => {
      const result: { path: string; name: string }[] = [];
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await payableAttachmentBucket().list(accountId, {
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw error;
        for (const item of data) {
          if (!item.id) continue;
          result.push({
            path: `${accountId}/${item.name}`,
            name: item.name.slice(38),
          });
        }
        if (data.length < 100) return result;
      }
    },
  });

  async function upload() {
    setBusy(true);
    try {
      const failed = await uploadPayableAttachments(accountId, files);
      setFiles(failed.map(({ file }) => file));
      await attachments.refetch();
      if (failed.length) toast.error(`${failed[0].file.name} — ${failed[0].message}`);
      else toast.success("Anexos salvos.");
    } finally {
      setBusy(false);
    }
  }

  async function download(path: string, name: string) {
    try {
      const { data, error } = await payableAttachmentBucket().createSignedUrl(path, 60, {
        download: name,
      });
      if (error) throw error;
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.click();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível baixar o anexo.");
    }
  }

  async function remove(path: string) {
    setBusy(true);
    try {
      const { error } = await payableAttachmentBucket().remove([path]);
      if (error) throw error;
      setRemoving(null);
      await attachments.refetch();
      toast.success("Anexo excluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o anexo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>Anexos da despesa</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {attachments.isLoading && <p className="text-sm">Carregando anexos…</p>}
        {attachments.error && (
          <p role="alert" className="text-sm text-destructive">
            {attachments.error.message}
          </p>
        )}
        {attachments.data?.length === 0 && <p className="text-sm">Nenhum arquivo anexado.</p>}
        {!!attachments.data?.length && (
          <ul className="divide-y rounded-md border">
            {attachments.data.map(({ path, name }) => (
              <li key={path} className="flex flex-wrap items-center gap-2 p-2">
                <span className="min-w-0 flex-1 break-all text-sm">{name}</span>
                <Button size="sm" variant="outline" onClick={() => void download(path, name)}>
                  Baixar
                </Button>
                {!readOnly &&
                  (removing === path ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setRemoving(null)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void remove(path)}
                      >
                        Excluir arquivo
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setRemoving(path)}
                    >
                      Remover
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        )}
        {!readOnly && (
          <div className="space-y-2">
            <Label htmlFor="payable-attachments">Adicionar arquivos (até 15 MB por arquivo)</Label>
            <Input
              id="payable-attachments"
              type="file"
              multiple
              disabled={busy}
              onChange={(event) => {
                setFiles(Array.from(event.currentTarget.files || []));
                event.currentTarget.value = "";
              }}
            />
            {!!files.length && (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {files.map((file, index) => (
                  <li key={index} className="break-all">
                    {file.name}
                  </li>
                ))}
              </ul>
            )}
            <Button disabled={busy || !files.length} onClick={() => void upload()}>
              {busy ? "Aguarde…" : "Salvar anexos"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
