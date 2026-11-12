import { supabase } from "@/integrations/supabase/client";

export const payableAttachmentLimit = 15 * 1024 * 1024;
export const payableAttachmentBucket = () => supabase.storage.from("payable-attachments");

export async function uploadPayableAttachments(accountId: string, files: File[]) {
  const failed: { file: File; message: string }[] = [];
  for (const file of files) {
    try {
      if (!file.size || file.size > payableAttachmentLimit) {
        throw new Error("O arquivo deve ter entre 1 byte e 15 MB.");
      }
      const name = file.name
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(-180);
      const path = `${accountId}/${crypto.randomUUID()}--${name || "anexo"}`;
      const { error } = await payableAttachmentBucket().upload(path, file, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (error) throw error;
    } catch (error) {
      failed.push({ file, message: error instanceof Error ? error.message : "Falha no envio." });
    }
  }
  return failed;
}
