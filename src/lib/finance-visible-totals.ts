import type { FinanceRow } from "./enterprise-finance";
/** Arithmetic sum of visible entries, never a deduplicated invoice total. */
export function financeVisibleTotals(rows: FinanceRow[]) {
  let baseCents = 0,
    missingBases = 0,
    estimatedBases = 0,
    commissionCents = 0,
    estimatedCommissionCents = 0,
    otherIncomeCents = 0;
  for (const row of rows) {
    const base = row.calculationDetail?.baseCents;
    if (base == null) missingBases++;
    else {
      baseCents += base;
      if (row.provisional) estimatedBases++;
    }
    if (row.source === "billing" && row.billingIssuer?.id.startsWith("outsourced:")) {
      commissionCents += row.amountCents;
      if (row.provisional) estimatedCommissionCents += row.amountCents;
    } else otherIncomeCents += row.amountCents;
  }
  return {
    baseCents,
    missingBases,
    estimatedBases,
    commissionCents,
    estimatedCommissionCents,
    otherIncomeCents,
    totalCents: commissionCents + otherIncomeCents,
  };
}
