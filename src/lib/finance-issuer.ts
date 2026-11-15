import type { FinanceRow } from "./enterprise-finance";

export type FinanceIssuer = { id: string; name: string };
export const UNLINKED_ISSUER: FinanceIssuer = {
  id: "unlinked",
  name: "Sem emissor vinculado",
};

/** Only structured billing links establish an issuer. Never infer from client/description. */
export function billingFinanceIssuer(
  entry: { companyId: string | null; company: string },
  cycle?: { issuer_type: string },
): FinanceIssuer {
  if (entry.companyId) {
    return {
      id: `outsourced:${entry.companyId}`,
      name: entry.company.trim() || `Terceirizada sem nome (${entry.companyId})`,
    };
  }
  // Null company means Jacoby only when the source BM explicitly confirms direct billing.
  return entry.companyId === null && cycle?.issuer_type === "jacoby"
    ? { id: "jacoby", name: "Jacoby" }
    : UNLINKED_ISSUER;
}

export function financeIssuer(row: Pick<FinanceRow, "source" | "billingIssuer">): FinanceIssuer {
  return row.source === "billing" ? row.billingIssuer || UNLINKED_ISSUER : UNLINKED_ISSUER;
}

export function matchesFinanceIssuer(
  row: Pick<FinanceRow, "source" | "billingIssuer">,
  selected: string,
) {
  return selected === "all" || financeIssuer(row).id === selected;
}

export function financeIssuerOptions(rows: FinanceRow[]): FinanceIssuer[] {
  const issuers = new Map<string, FinanceIssuer>();
  for (const row of rows) {
    if (row.kind !== "receivable") continue;
    const issuer = financeIssuer(row);
    issuers.set(issuer.id, issuer);
  }
  return [...issuers.values()].sort((a, b) => {
    const rank = (id: string) => (id === "jacoby" ? 0 : id === "unlinked" ? 2 : 1);
    return (
      rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id)
    );
  });
}

export function searchFinanceIssuers(options: FinanceIssuer[], query: string) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .trim();
  const term = normalize(query);
  return options.filter((option) => normalize(option.name).includes(term));
}
