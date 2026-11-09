import type { BillingFlowCategory, BillingFlowEntry } from "@/components/BillingFlowPreview";
const order: Record<BillingFlowCategory, number> = {
  rental: 0,
  exchange: 1,
  treatment: 2,
  service: 3,
};
/** Saved tracking is authoritative, including an intentionally cleared issue date. */
export function hasBillingInvoiceIssue(entry: BillingFlowEntry) {
  return Boolean(entry.tracking ? entry.tracking.invoice_issued_on : entry.legacyIssuedOn);
}
export function billingEntryHasCharge(entry: BillingFlowEntry) {
  // An attachment awaiting a service/value still needs review. A zero-value category does not.
  if (entry.pendingService) return true;
  // An explicitly saved zero agreement is authoritative, even if the operational BM has a base.
  if (entry.tracking)
    return [entry.tracking.commission_amount, entry.tracking.net_invoice_amount].some(
      (value) => Number(value || 0) !== 0,
    );
  return [entry.baseAmount, entry.currentCommission].some((value) => Number(value || 0) !== 0);
}
export function isBillingInvoicePending(entry: BillingFlowEntry) {
  return billingEntryHasCharge(entry) && !hasBillingInvoiceIssue(entry);
}
/** The active BM is identified by UUID, independent of the global list's category/date filters. */
export function bulletinBillingEntries(entries: BillingFlowEntry[], cycleId: string | null) {
  return entries
    .filter((entry) => entry.cycleId === cycleId)
    .sort(
      (a, b) =>
        order[a.category] - order[b.category] ||
        a.company.localeCompare(b.company, "pt-BR") ||
        a.id.localeCompare(b.id),
    );
}
export function selectBulletinBillingEntry(
  entries: BillingFlowEntry[],
  selectedId: string,
  preferredCategory: BillingFlowCategory | "all",
  strictTarget = false,
) {
  return (
    entries.find((entry) => entry.id === selectedId) ||
    (strictTarget
      ? undefined
      : entries.find((entry) => entry.category === preferredCategory) || entries[0])
  );
}
export function summarizeBulletinBilling(entries: BillingFlowEntry[]) {
  return {
    total:
      entries.reduce(
        (sum, entry) =>
          sum +
          Math.round(Number(entry.tracking?.commission_amount ?? entry.currentCommission) * 100),
        0,
      ) / 100,
    confirmed: entries.filter((entry) => Boolean(entry.tracking)).length,
    provisional: entries.some((entry) => !entry.tracking),
  };
}
