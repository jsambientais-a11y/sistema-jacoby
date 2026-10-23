export const CYCLE_INVOICE_BUCKET = "movement-documents";
export const MAX_CYCLE_INVOICE_SIZE = 15 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function cycleInvoiceFolder(cycleId: string) {
  if (!uuid.test(cycleId)) throw new Error("Abra um BM válido antes de anexar a nota.");
  return `cycle-invoices/${cycleId}`;
}
export function cycleInvoicePath(cycleId: string, filename: string, fileId: string) {
  if (!uuid.test(fileId)) throw new Error("Identificador de anexo inválido.");
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "anexo";
  return `${cycleInvoiceFolder(cycleId)}/${fileId}--${safeName}`;
}
export async function validateCycleInvoice(file: Pick<File, "name" | "size" | "type" | "slice">) {
  if (!file.size) throw new Error("O arquivo está vazio.");
  if (file.size > MAX_CYCLE_INVOICE_SIZE) throw new Error("O arquivo deve ter no máximo 15 MB.");
}
export type CycleInvoice = { path: string; name: string; createdAt: string | null; size: number };
/** Complete the existing BM attachment as a real service, without copying its PDF. */
export function invoiceServiceFields(input: {
  cycleId: string; invoice: CycleInvoice; amount: string; quantity: string;
  executionDate: string; issuedOn: string; number: string;
}) {
  const folder = `${cycleInvoiceFolder(input.cycleId)}/`;
  if (!input.invoice.path.startsWith(folder) || input.invoice.path.slice(folder.length).includes("/"))
    throw new Error("Esta nota pertence a outro BM.");
  const unitAmount = Number(input.amount);
  const quantity = Number(input.quantity);
  if (!input.amount.trim() || !Number.isFinite(unitAmount) || unitAmount < 0)
    throw new Error("Informe o valor faturado do serviço.");
  if (!Number.isFinite(quantity) || quantity < 1 || !Number.isInteger(quantity) || !Number.isFinite(unitAmount * quantity))
    throw new Error("Informe uma quantidade inteira maior que zero.");
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(input.executionDate) || !validDate(input.issuedOn))
    throw new Error("Informe as datas de execução e faturamento.");
  return {
    quantity, unit_amount: unitAmount, amount: Math.round(unitAmount * quantity * 100) / 100,
    execution_date: input.executionDate, invoice_issued_on: input.issuedOn,
    invoice_number: input.number.trim() || null,
    invoice_pdf_path: input.invoice.path, invoice_pdf_name: input.invoice.name,
  };
}
type ListedObject = {
  name: string;
  id: string | null;
  created_at: string | null;
  metadata?: { size?: number } | null;
};
type InvoiceLister = {
  list: (
    path: string,
    options: { limit: number; offset: number; sortBy: { column: string; order: string } },
  ) => PromiseLike<{ data: ListedObject[] | null; error: { message: string } | null }>;
};
export async function listCycleInvoices(
  bucket: InvoiceLister,
  cycleId: string,
): Promise<CycleInvoice[]> {
  const folder = cycleInvoiceFolder(cycleId);
  const files: CycleInvoice[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(folder, {
      limit: 100,
      offset,
      sortBy: { column: "created_at", order: "asc" },
    });
    if (error) throw new Error(error.message);
    for (const object of data || []) {
      if (!object.id) continue;
      files.push({
        path: `${folder}/${object.name}`,
        name: object.name.replace(/^[0-9a-f-]{36}--/i, ""),
        createdAt: object.created_at,
        size: Number(object.metadata?.size || 0),
      });
    }
    if ((data || []).length < 100) return files;
  }
}

/** List only folders that belong to BMs visible to the current billing user. */
export async function listFinancialCycleInvoices(bucket: InvoiceLister, allowedCycleIds: string[]) {
  const allowed = new Set(allowedCycleIds);
  const ids: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const {data, error} = await bucket.list("cycle-invoices", {limit:100,offset,sortBy:{column:"name",order:"asc"}});
    if (error) throw new Error(error.message);
    for (const folder of data || []) if (!folder.id && allowed.has(folder.name) && uuid.test(folder.name)) ids.push(folder.name);
    if ((data || []).length < 100) break;
  }
  const result: (CycleInvoice & {cycleId:string})[] = [];
  // Bounded parallelism avoids one request per historical BM with no attachment.
  for (let start=0;start<ids.length;start+=6) {
    const batches = await Promise.all(ids.slice(start,start+6).map(async cycleId =>
      (await listCycleInvoices(bucket,cycleId)).map(file => ({...file,cycleId}))));
    result.push(...batches.flat());
  }
  return result;
}
