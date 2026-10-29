import { supabase } from "@/integrations/supabase/client";
import { parseIsoState, type IsoLocalState } from "./iso-local-state";
// Nenhum service-role no navegador. Novas funções até regenerar os tipos do projeto.
type IsoRpc = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const rpc = supabase as unknown as IsoRpc;
export const isoRemoteEnabled =
  import.meta.env.VITE_ISO_STORAGE === "supabase" ||
  (import.meta.env.VITE_ISO_STORAGE !== "local" &&
    import.meta.env.PROD &&
    !!import.meta.env.VITE_SUPABASE_URL);
export type IsoRemoteSnapshot = {
  id: string;
  revision: number;
  access: "admin" | "editor" | "viewer";
  state: IsoLocalState | null;
};
export function isoRemoteError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ISO_REVISION_CONFLICT"))
    return "Outra pessoa salvou alterações. Sua cópia foi preservada. Exporte-a antes de carregar a versão do servidor.";
  if (/ISO_.*DENIED|ISO_ADMIN_REQUIRED/.test(message))
    return "Você não tem permissão para esta operação no ISO.";
  if (message.includes("ISO_ATTACHMENT_MISSING"))
    return "Há anexos ainda não enviados. Envie os arquivos antes de salvar.";
  if (message.includes("ISO_CLIENT_NOT_ALLOWED"))
    return "Contas de clientes não podem receber acesso ao ISO interno.";
  if (message.includes("ISO_USER_NOT_FOUND"))
    return "Este e-mail não tem conta cadastrada na Jacoby.";
  return `Não foi possível sincronizar o ISO: ${message}`;
}
export async function openIsoRemote(): Promise<IsoRemoteSnapshot> {
  const { data, error } = await rpc.rpc("iso_open_workspace");
  if (error) throw new Error(error.message);
  const v = data as IsoRemoteSnapshot;
  if (
    !v?.id ||
    !Number.isSafeInteger(v.revision) ||
    !["admin", "viewer", "editor"].includes(v.access)
  )
    throw new Error("Resposta inválida do servidor ISO.");
  return { ...v, state: v.state ? parseIsoState(JSON.stringify(v.state)) : null };
}
export async function saveIsoRemote(id: string, revision: number, state: IsoLocalState) {
  const { data, error } = await rpc.rpc("iso_save_workspace", {
    p_workspace: id,
    p_revision: revision,
    p_state: parseIsoState(JSON.stringify(state)),
  });
  if (error) throw new Error(error.message);
  if (!Number.isSafeInteger(data) || Number(data) <= revision)
    throw new Error("Revisão inválida retornada pelo servidor.");
  return Number(data);
}
export async function writeIsoRemoteBlob(workspace: string, id: string, blob: Blob) {
  if (blob.size > 20 * 1024 * 1024) throw new Error("Cada anexo pode ter até 20 MB.");
  const { error } = await supabase.storage.from("iso-private").upload(`${workspace}/${id}`, blob, {
    upsert: false,
    contentType: blob.type || "application/octet-stream",
  });
  if (error) throw new Error(error.message);
}
export async function readIsoRemoteBlob(workspace: string, id: string) {
  const { data, error } = await supabase.storage.from("iso-private").download(`${workspace}/${id}`);
  if (error || !data) throw new Error(error?.message || "Anexo não encontrado.");
  return data;
}
export async function setIsoMember(email: string, access: string) {
  const { error } = await rpc.rpc("iso_set_member", { p_email: email, p_access: access });
  if (error) throw new Error(error.message);
}
export async function listIsoMembers() {
  const { data, error } = await rpc.rpc("iso_list_members");
  if (error) throw new Error(error.message);
  return data as { email: string; access: string }[];
}
