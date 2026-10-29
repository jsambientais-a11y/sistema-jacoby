import { useState, type ChangeEvent } from "react";
import { Paperclip, Download } from "lucide-react";
import { toast } from "sonner";
import { useIsoWorkspace } from "./IsoWorkspace";
import { downloadIsoBlob } from "@/lib/iso-local-files";
export function IsoAttachments({
  ownerId,
  title = "Anexos da auditoria",
}: {
  ownerId: string;
  title?: string;
}) {
  const { selected, remote, readFile, writeFile, canWrite, appendFiles } = useIsoWorkspace();
  const [busy, setBusy] = useState(false);
  const all = selected.files || [];
  const files = all.filter((f) => f.ownerId === ownerId);
  const attach = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const chosen = Array.from(input.files || []);
    setBusy(true);
    try {
      const saved = [];
      for (const file of chosen) {
        if (file.size > 20 * 1024 * 1024) throw new Error("Cada anexo pode ter até 20 MB.");
        const id = crypto.randomUUID();
        await writeFile(id, file);
        saved.push({
          id,
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          ownerId,
          addedAt: new Date().toISOString(),
        });
      }
      appendFiles(selected.id, saved);
      toast.success(
        remote
          ? "Arquivo enviado. Aguarde o status Salvo no servidor para confirmar o vínculo."
          : "Anexo salvo somente neste navegador.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar anexo.");
    } finally {
      input.value = "";
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-dashed border-[#cbdccc] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-xs">{title}</b>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs">
          <Paperclip className="h-3 w-3" />
          {busy ? "Salvando…" : "Anexar arquivo"}
          <input
            type="file"
            multiple
            className="sr-only"
            aria-label={`${title}: selecionar arquivos`}
            disabled={busy || !canWrite}
            onChange={(e) => void attach(e)}
          />
        </label>
      </div>
      {files.map((file) => (
        <button
          type="button"
          key={file.id}
          className="flex w-full items-center gap-2 rounded bg-[#f2f7f0] p-2 text-left text-xs"
          onClick={() =>
            void readFile(file.id)
              .then((blob) => downloadIsoBlob(blob, file.name))
              .catch((error) => toast.error(error.message))
          }
        >
          <Download className="h-3 w-3 shrink-0" />
          <span className="break-all">{file.name}</span>
          <span className="ml-auto shrink-0 text-[#728676]">{Math.ceil(file.size / 1024)} KB</span>
        </button>
      ))}
      <p className="text-[11px] text-[#728676]">
        Qualquer tipo de arquivo, até 20 MB cada. Incluído no backup ZIP da Minha biblioteca.
      </p>
    </div>
  );
}
