import type { BillingFlowEntry, BillingFlowTracking } from "@/components/BillingFlowPreview";
import type { CycleInvoice } from "@/lib/cycle-invoices";

export type InvoiceCycleContext = {
  id: string; companyId: string | null; bulletin: string; client: string;
  branch: string; serviceUrl: string;
};
export type InvoiceServiceLink = {
  cycle_id: string; outsourced_company_id: string | null; invoice_pdf_path: string | null;
  invoice_pdf_name: string | null; amount: number; net_invoice_amount: number | null;
  commission_rate: number;
};

/** One financial group per BM and issuer, before and after service completion. */
export function attachServiceInvoiceEntries(
  entries: BillingFlowEntry[], cycles: InvoiceCycleContext[],
  notes: (CycleInvoice & {cycleId:string})[], links: InvoiceServiceLink[],
  tracking: BillingFlowTracking[], companyName: (id:string|null) => string,
): BillingFlowEntry[] {
  const grouped = new Map(entries.map(entry => [entry.id,{...entry,serviceNotes:[] as CycleInvoice[]}]));
  const allFiles = [...notes];
  for (const link of links) {
    if (link.invoice_pdf_path && !allFiles.some(file => file.cycleId === link.cycle_id && file.path === link.invoice_pdf_path))
      allFiles.push({cycleId:link.cycle_id,path:link.invoice_pdf_path,name:link.invoice_pdf_name || "Arquivo da nota",createdAt:null,size:0});
  }
  for (const note of allFiles) {
    const cycle = cycles.find(cycle => cycle.id === note.cycleId);
    if (!cycle) continue;
    const linked = links.find(link => link.cycle_id === cycle.id && link.invoice_pdf_path === note.path);
    const companyId = linked ? linked.outsourced_company_id : cycle.companyId;
    const key = `${cycle.id}:service:${companyId || "jacoby"}`;
    let entry = grouped.get(key);
    if (!entry) {
      const services = links.filter(link => link.cycle_id === cycle.id && link.outsourced_company_id === companyId);
      const pending = services.length === 0;
      entry = {
        id:key,cycleId:cycle.id,companyId,category:"service",bulletin:cycle.bulletin,
        client:cycle.client,branch:cycle.branch,company:companyName(companyId),
        description:pending ? "Nota recebida · serviço pendente" : "Serviços com nota no BM",
        pendingService:pending,itemsCount:services.length,
        baseAmount:services.reduce((sum,item) => sum+Number(item.net_invoice_amount ?? item.amount ?? 0),0),
        currentCommission:services.reduce((sum,item) => sum+(companyId ? Number(item.net_invoice_amount ?? item.amount ?? 0)*Number(item.commission_rate || 0)/100 : Number(item.amount || 0)),0),
        tracking:tracking.find(item => item.cycle_id === cycle.id && item.category === "service" && item.source_key === (companyId || "jacoby")),
        serviceNotes:[],
      };
      grouped.set(key,entry);
    }
    entry.serviceUrl = cycle.serviceUrl;
    if (!entry.serviceNotes.some(file => file.path === note.path)) entry.serviceNotes.push(note);
  }
  return [...grouped.values()].sort((a,b) => b.bulletin.localeCompare(a.bulletin));
}
