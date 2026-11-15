// Synthetic read-only sources for the actual EnterpriseFinance screen. No remote hooks.
const query = (data: unknown = []) => ({ data, isLoading: false, isFetching: false, error: null });
const mutation = {
  isPending: false,
  mutateAsync: async () => {
    throw new Error("Writes prohibited in filter fixture");
  },
};
const tracking = (value: number, received: string | null = null, expected = "2026-11-20") => ({
  rule_type: "fixed",
  rule_value: value,
  commission_amount: value,
  net_invoice_amount: null,
  expected_on: expected,
  received_on: received,
  invoice_due_on: expected,
  expected_basis: "manual",
  invoice_number: null,
});
const entry = (
  id: string,
  companyId: string | null,
  company: string,
  value: number,
  received: string | null = null,
  expected = "2026-11-20",
  cycleId = id,
) => ({
  id,
  cycleId,
  companyId,
  company,
  category: "service",
  bulletin: `#${id}`,
  client: "Cliente fictício",
  branch: "Matriz",
  description: `Serviço ${id}`,
  baseAmount: value,
  currentCommission: value,
  tracking: tracking(value, received, expected),
});
const manual = (id: string, extra = {}) => ({
  id,
  kind: "receivable",
  description: "Manual Águas e Resíduos",
  counterparty: "Jacoby",
  category: "Faturamento",
  amount_cents: 5000,
  due_on: "2026-11-20",
  settled_on: null,
  deleted_at: null,
  updated_at: "fixture",
  notes: "",
  ...extra,
});
export const fixtureEntries = [
  entry("001", "a", "Águas e Resíduos", 100),
  entry("002", "a", "Águas e Resíduos", 200, "2026-11-10"),
  entry("003", null, "Jacoby (faturamento direto)", 300),
  entry("004", null, "Jacoby", 40),
  { ...entry("005", "b", "Águas e Resíduos", 60, null, "2026-11-20", "001"), bulletin: "#001" },
  entry("006", "a", "Águas e Resíduos", 900, null, "2026-12-20"),
  entry("007", "missing", "Terceirizada não identificada", 80),
];
// Shared NF: distinct per-category evidence, deliberately no base total.
Object.assign(fixtureEntries[0], {
  category: "rental",
  tracking: {
    ...fixtureEntries[0].tracking,
    rule_type: "percent",
    rule_value: 10,
    net_invoice_amount: 1000,
    invoice_number: "123",
  },
});
Object.assign(fixtureEntries[1], {
  cycleId: "001",
  category: "exchange",
  tracking: {
    ...fixtureEntries[1].tracking,
    rule_type: "percent",
    rule_value: 20,
    net_invoice_amount: 1000,
    invoice_number: "123",
  },
});
Object.assign(fixtureEntries[4], {
  tracking: { ...fixtureEntries[4].tracking, net_invoice_amount: 0 },
});
export const fixtureAccounts = [
  manual("manual"),
  manual("deleted", { deleted_at: "2026-11-01" }),
  manual("payable", { kind: "payable", description: "Despesa fictícia" }),
];
export const useFinanceAccounts = () => ({ ...query(fixtureAccounts), save: mutation });
export const useFinanceRecurrences = () => ({
  ...query(),
  deletePayableSeries: mutation,
  saveInline: mutation,
});
export const useCreditCards = () => ({ cards: query(), settle: mutation });
export const useCostCenters = () =>
  query([{ id: "center", name: "Serviços", kind: "income", active: true }]);
export const useBanks = () => query([{ id: "bank", name: "Banco teste", active: true }]);
export const compatibleCenter = () => true;
export const useReceiptDetails = () => ({
  ...query([
    { entry_id: "001", cost_center_id: "center", bank_account_id: "bank" },
    { entry_id: "002", cost_center_id: "center", bank_account_id: "bank" },
  ]),
  save: mutation,
});
export const useBillingFlowData = () => ({
  billingFlowEntries: fixtureEntries,
  cycles: fixtureEntries.map((e) => ({
    id: e.cycleId,
    issuer_type: e.id === "003" ? "jacoby" : "outsourced",
  })),
  servicesQuery: query(),
  movementCommissionsQuery: query(),
  cyclesQuery: query(),
  directBillingDataQuery: query(),
  billingTrackingQuery: query(),
  companiesQuery: query(),
  branchesQuery: query(),
  settleReceivable: mutation,
});
export const supabase = new Proxy(
  {},
  {
    get() {
      throw new Error("Supabase forbidden in isolated filter fixture");
    },
  },
);
