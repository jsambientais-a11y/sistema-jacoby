type AgreementEntry = {
  companyId: string | null;
  company: string;
  description: string;
  isScrap?: boolean;
};

export function billingAgreement(entry: AgreementEntry) {
  const company = entry.company.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const scrap = entry.isScrap || /sucata/i.test(entry.description);
  if (entry.companyId && /\bcortes\b|afonso\s*&\s*afonso/.test(company) && !scrap) {
    return {
      defaultRule: "percent" as const,
      requiresAgreement: true,
      message: "Cortes: a comissão é um percentual sobre o valor líquido da nota fiscal. Informe o percentual combinado e o líquido da nota.",
    };
  }
  if (scrap || (entry.companyId && /\bldj\b/.test(company))) {
    return {
      defaultRule: "fixed" as const,
      requiresAgreement: true,
      message: `${scrap ? "Sucata" : "LDJ"}: o repasse é definido entre as partes. Informe o valor acordado ou selecione o percentual, se esse for o acordo.`,
    };
  }
  return {
    defaultRule: "fixed" as const,
    requiresAgreement: false,
    message: entry.companyId
      ? "Confira o repasse combinado com a terceirizada antes de salvar."
      : "Confira o valor faturado diretamente pela Jacoby.",
  };
}

// Não usa a base do BM como substituto do líquido da NF, nem desconta imposto outra vez.
export function billingCommission(rule: "percent" | "fixed", value: number, netInvoice: number | null) {
  if (!Number.isFinite(value) || value < 0 || (rule === "percent" && value > 100)) return null;
  if (rule === "percent" && (netInvoice == null || !Number.isFinite(netInvoice) || netInvoice < 0)) return null;
  const amount = rule === "percent" ? netInvoice! * value / 100 : value;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
