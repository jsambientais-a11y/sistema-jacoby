import type { IsoLocalState } from "./iso-local-state";
import { isoBackupText, parseIsoState } from "./iso-local-state";
import type { IsoFile } from "@/components/iso/IsoWorkspace";
const MAX_FILE = 20 * 1024 * 1024,
  MAX_BACKUP = 100 * 1024 * 1024;
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("jacoby-iso-files-v1", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("files"))
        request.result.createObjectStore("files");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Não foi possível abrir o armazenamento local de anexos."));
  });
}
export async function writeIsoBlob(scope: string, id: string, blob: Blob) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(blob, `${scope}:${id}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error("Não foi possível gravar o anexo. Confira o espaço disponível."));
      tx.onabort = () => reject(new Error("Gravação do anexo cancelada."));
    });
  } finally {
    db.close();
  }
}
export async function readIsoBlob(scope: string, id: string): Promise<Blob> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("files").objectStore("files").get(`${scope}:${id}`);
      request.onsuccess = () =>
        request.result instanceof Blob
          ? resolve(request.result)
          : reject(
              new Error(
                "Arquivo não encontrado neste navegador. Restaure um backup que inclua os anexos.",
              ),
            );
      request.onerror = () => reject(new Error("Não foi possível ler o anexo."));
    });
  } finally {
    db.close();
  }
}
export async function addIsoFile(scope: string, ownerId: string, file: File): Promise<IsoFile> {
  if (file.size > MAX_FILE) throw new Error("Cada anexo pode ter até 20 MB.");
  const id = crypto.randomUUID();
  await writeIsoBlob(scope, id, file);
  return {
    id,
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    ownerId,
    addedAt: new Date().toISOString(),
  };
}
export function downloadIsoBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportIsoBackup(
  state: IsoLocalState,
  scope: string,
  readFile = (id: string) => readIsoBlob(scope, id),
) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("workspace.json", isoBackupText(state));
  let total = 0;
  for (const file of state.audits.flatMap((a) => a.files || [])) {
    const blob = await readFile(file.id);
    total += blob.size;
    if (total > MAX_BACKUP)
      throw new Error(
        "Backup excede 100 MB. Exporte os arquivos separadamente antes de continuar.",
      );
    zip.file(`files/${file.id}`, await blob.arrayBuffer());
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

interface IsoZipStream {
  on(event: "data", handler: (data: Uint8Array) => void): IsoZipStream;
  on(event: "error", handler: (error: Error) => void): IsoZipStream;
  on(event: "end", handler: () => void): IsoZipStream;
  pause(): IsoZipStream;
  resume(): IsoZipStream;
}
async function boundedZipEntry(
  entry: import("jszip").JSZipObject,
  limit: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const parts: Uint8Array[] = [];
    let total = 0;
    let failed = false;
    const stream = (
      entry as typeof entry & { internalStream(type: "uint8array"): IsoZipStream }
    ).internalStream("uint8array");
    stream.on("data", (chunk) => {
      total += chunk.byteLength;
      if (total > limit) {
        failed = true;
        stream.pause();
        reject(new Error("Conteúdo do backup excede o tamanho permitido."));
        return;
      }
      parts.push(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      if (failed) return;
      const result = new Uint8Array(total);
      let offset = 0;
      for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
      }
      resolve(result);
    });
    stream.resume();
  });
}

export async function inspectIsoBackup(
  file: File,
): Promise<{ state: IsoLocalState; files: Map<string, Blob> }> {
  if (file.size > MAX_BACKUP) throw new Error("O backup excede 100 MB.");
  const files = new Map<string, Blob>();
  if (!file.name.toLowerCase().endsWith(".zip")) {
    const state = parseIsoState(await file.text());
    if (state.audits.some((a) => a.files?.length))
      throw new Error(
        "Este JSON referencia anexos. Importe o backup ZIP completo para restaurar os arquivos.",
      );
    return { state, files };
  }
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = zip.file("workspace.json");
  if (!entry) throw new Error("O ZIP não contém workspace.json.");
  const state = parseIsoState(new TextDecoder().decode(await boundedZipEntry(entry, 30_000_000)));
  let total = 0;
  for (const metadata of state.audits.flatMap((a) => a.files || [])) {
    if (metadata.size > MAX_FILE) throw new Error("O backup contém um anexo acima de 20 MB.");
    total += metadata.size;
    if (total > MAX_BACKUP) throw new Error("O tamanho dos anexos excede 100 MB.");
    const entry = zip.file(`files/${metadata.id}`);
    if (!entry) throw new Error(`Anexo ausente no backup: ${metadata.name}`);
    const bytes = await boundedZipEntry(entry, MAX_FILE);
    if (bytes.byteLength !== metadata.size)
      throw new Error(`Tamanho inválido no anexo ${metadata.name}.`);
    const newId = crypto.randomUUID();
    files.set(newId, new Blob([new Uint8Array(bytes).buffer], { type: metadata.type }));
    metadata.id = newId;
  }
  return { state, files };
}
