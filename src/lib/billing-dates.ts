export type BillingExpectedBasis = "issue" | "due" | "issue_15" | "due_15" | "manual";
export type BillingAutomaticBasis = Exclude<BillingExpectedBasis, "manual">;
export const BILLING_DATE_RULES: Record<BillingExpectedBasis, string> = {
  issue_15: "15 dias após a emissão da NF",
  due_15: "15 dias após o vencimento da NF",
  issue: "Dia 10 do mês seguinte à emissão da NF",
  due: "Dia 10 do mês seguinte ao vencimento da NF",
  manual: "Data definida manualmente",
};
export function validBillingDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function billingExpectedOn(
  basis: BillingAutomaticBasis,
  issuedOn: string,
  dueOn: string,
): string {
  const value = basis === "due" || basis === "due_15" ? dueOn : issuedOn;
  if (!validBillingDate(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  if (basis === "issue_15" || basis === "due_15") date.setUTCDate(date.getUTCDate() + 15);
  else {
    date.setUTCDate(10);
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return date.toISOString().slice(0, 10);
}
/** Merely opening or saving other fields must not recalculate an existing forecast. */
export function preserveSavedBillingForecast(input: {
  saved?: {
    expected_basis: BillingExpectedBasis;
    expected_on: string | null;
    invoice_issued_on: string | null;
    invoice_due_on: string | null;
  };
  basis: BillingAutomaticBasis;
  issuedOn: string;
  dueOn: string;
}): string {
  const { saved, basis, issuedOn, dueOn } = input;
  const sameAnchor =
    basis === "due" || basis === "due_15"
      ? dueOn === (saved?.invoice_due_on || "")
      : issuedOn === (saved?.invoice_issued_on || "");
  if (saved && saved.expected_basis === basis && sameAnchor) return saved.expected_on || "";
  return billingExpectedOn(basis, issuedOn, dueOn);
}
