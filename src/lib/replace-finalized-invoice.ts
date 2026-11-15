import { validateCycleInvoice } from "./cycle-invoices";
// Keep the existing path so every service/portal link keeps referring to the same note.
export async function replaceFinalizedInvoice(bucket: { update: (path: string, file: File, options: { contentType: string; cacheControl: string }) => PromiseLike<{error: {message: string} | null}> }, path: string, originalName: string, file: File) {
  await validateCycleInvoice(file);
  const extension = (name: string) => name.split(".").pop()?.toLowerCase();
  if (extension(originalName) !== extension(file.name))
    throw new Error("Escolha um arquivo do mesmo formato da nota original. O nome e os vínculos serão mantidos.");
  const {error} = await bucket.update(path, file, {contentType: file.type || "application/octet-stream", cacheControl: "0"});
  if (error) throw new Error(error.message);
}
