export const APPEND_FINALIZED_INVOICE_PERMISSION = "billing_append_finalized_invoice";
export function mayAppendFinalizedInvoice(
  permissions: string[],
  hasBilling: boolean,
  isClient: boolean,
) {
  return !isClient && hasBilling && permissions.includes(APPEND_FINALIZED_INVOICE_PERMISSION);
}
export function invoiceAttachmentActionAllowed(
  readOnly: boolean,
  mayAppend: boolean,
  replacesExisting: boolean,
) {
  return !readOnly || (mayAppend && !replacesExisting);
}

/** Operational billing access includes new BMs; the finalized lock protects existing closed BMs. */
export function mayCreateBulletin(hasBilling: boolean, isClient: boolean) {
  return hasBilling && !isClient;
}
