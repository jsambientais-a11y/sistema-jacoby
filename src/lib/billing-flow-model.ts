import type { BillingFlowEntry, BillingFlowTracking } from "@/components/BillingFlowPreview";
import type {
  Cycle,
  FinancialService,
  MovementCommission,
  BillingPlacement,
  BillingMovement,
  BillingServiceAmount,
  Named,
} from "@/hooks/use-billing-flow";
import type { CycleInvoice } from "./cycle-invoices";
import { attachServiceInvoiceEntries, type InvoiceServiceLink } from "./service-invoice-entries";

type Inputs = {
  cycles: Cycle[];
  clients: { id: string; name: string }[];
  companies: Named[];
  catalog: Named[];
  branches: Named[];
  residues: (Named & { jacoby_pays_client: boolean })[];
  services: FinancialService[];
  commissions: MovementCommission[];
  placements: BillingPlacement[];
  movements: BillingMovement[];
  directServices: BillingServiceAmount[];
  tracking: BillingFlowTracking[];
  notes: (CycleInvoice & { cycleId: string })[];
  links: InvoiceServiceLink[];
};
/** Shared by billing screens and assistant. Never treat closing a BM as a receipt. */
export function buildBillingFlowEntries(input: Inputs): BillingFlowEntry[] {
  const { cycles, clients, companies, catalog, branches, residues, tracking, notes, links } = input;
  const serviceRows = input.services
    .filter((item) => item.outsourced_company_id && item.execution_date)
    .map((item) => {
      const cycle = cycles.find((c) => c.id === item.cycle_id);
      return {
        item,
        cycle,
        clientName: clients.find((c) => c.id === cycle?.client_id)?.name || "",
        companyName:
          companies.find((c) => c.id === item.outsourced_company_id)?.trade_name ||
          companies.find((c) => c.id === item.outsourced_company_id)?.legal_name ||
          "",
        serviceName: catalog.find((c) => c.id === item.waste_service_id)?.name || "",
        branchName: branches.find((c) => c.id === cycle?.branch_id)?.name || "",
      };
    });
  const movementCommissionRows = input.commissions.map((item) => ({
    item,
    cycle: cycles.find((c) => c.id === item.cycle_id),
    clientName: clients.find((c) => c.id === item.client_id)?.name || "",
    companyName:
      companies.find((c) => c.id === item.outsourced_company_id)?.trade_name ||
      companies.find((c) => c.id === item.outsourced_company_id)?.legal_name ||
      "",
    residueName: residues.find((c) => c.id === item.waste_residue_id)?.name || "",
  }));
  const directBillingRows = calculateDirectBillingRows(input);
  const grouped = new Map<string, BillingFlowEntry>();
  const savedByKey = new Map(
    tracking.map((item) => [`${item.cycle_id}:${item.category}:${item.source_key}`, item]),
  );
  const add = (entry: Omit<BillingFlowEntry, "itemsCount" | "tracking">) => {
    const key = `${entry.cycleId}:${entry.category}:${entry.companyId || "jacoby"}`;
    const current = grouped.get(key);
    if (current) {
      current.baseAmount += entry.baseAmount;
      current.currentCommission += entry.currentCommission;
      current.itemsCount += 1;
      current.isScrap ||= entry.isScrap;
      current.legacyInvoiceNumber = null;
      current.legacyIssuedOn = null;
      current.legacyDueOn = null;
      current.legacyExpectedOn = null;
      current.legacyPaidOn = null;
    } else {
      grouped.set(key, { ...entry, itemsCount: 1, tracking: savedByKey.get(key) });
    }
  };
  for (const { item, cycle, clientName, companyName, residueName } of movementCommissionRows) {
    if (!cycle || cycle.status !== "closed") continue;
    add({
      id: `${cycle.id}:${item.source_type}:${item.outsourced_company_id}`,
      cycleId: cycle.id,
      companyId: item.outsourced_company_id,
      category: item.source_type,
      bulletin: `#${String(cycle.bulletin_number || 0).padStart(3, "0")}`,
      client: clientName || "Cliente não identificado",
      branch: branches.find((branch) => branch.id === cycle.branch_id)?.name || "Matriz",
      company: companyName || "Terceirizada não identificada",
      description:
        item.source_type === "treatment"
          ? `Tratamento · ${residueName || "resíduo"}`
          : item.source_type === "exchange"
            ? "Troca de equipamentos"
            : "Locação de equipamentos",
      isScrap:
        item.source_type === "treatment" &&
        Boolean(
          residues.find((residue) => residue.id === item.waste_residue_id)?.jacoby_pays_client,
        ),
      baseAmount: Number(item.base_amount || 0),
      currentCommission: Number(item.net_commission_amount || 0),
    });
  }
  for (const { item, cycle, clientName, companyName, serviceName, branchName } of serviceRows) {
    if (!cycle || cycle.status !== "closed" || !item.outsourced_company_id) continue;
    const baseAmount = Number(item.net_invoice_amount ?? item.amount ?? 0);
    add({
      id: `${cycle.id}:service:${item.outsourced_company_id}`,
      cycleId: cycle.id,
      companyId: item.outsourced_company_id,
      category: "service",
      bulletin: `#${String(cycle.bulletin_number || 0).padStart(3, "0")}`,
      client: clientName || "Cliente não identificado",
      branch: branchName || "Matriz",
      company: companyName || "Terceirizada não identificada",
      description: serviceName || item.description || "Serviço terceirizado",
      baseAmount,
      currentCommission: (baseAmount * Number(item.commission_rate || 0)) / 100,
      legacyInvoiceNumber: item.invoice_number,
      legacyIssuedOn: item.invoice_issued_on,
      legacyDueOn: item.invoice_due_date,
      legacyExpectedOn: item.commission_due_date,
      legacyPaidOn: item.received_on,
    });
  }
  for (const direct of directBillingRows) {
    const { cycle, clientName, branchName } = direct;
    for (const [category, amount, description] of [
      ["rental", direct.rental, "Locação de equipamentos"],
      ["exchange", direct.exchange, "Troca de equipamentos"],
      ["treatment", direct.treatment - direct.purchases, "Tratamento de resíduos"],
      ["service", direct.services, "Serviços"],
    ] as const) {
      if (amount <= 0) continue;
      add({
        id: `${cycle.id}:${category}:jacoby`,
        cycleId: cycle.id,
        companyId: null,
        category,
        bulletin: `#${String(cycle.bulletin_number || 0).padStart(3, "0")}`,
        client: clientName || "Cliente não identificado",
        branch: branchName || "Matriz",
        company: "Jacoby (faturamento direto)",
        description,
        baseAmount: amount,
        currentCommission: amount,
      });
    }
  }
  return attachServiceInvoiceEntries(
    [...grouped.values()],
    cycles.map((cycle) => {
      const hash = new URLSearchParams({
        cliente: cycle.client_id,
        boletim: cycle.id,
        patio: cycle.branch_id || "__matriz__",
        inicio: cycle.period_start,
        fim: cycle.period_end,
        subaba: "boletim",
        residuo: "all",
      });
      return {
        id: cycle.id,
        companyId: cycle.issuer_type === "outsourced" ? cycle.outsourced_company_id : null,
        bulletin: `#${String(cycle.bulletin_number || 0).padStart(3, "0")}`,
        client:
          clients.find((item) => item.id === cycle.client_id)?.name || "Cliente não identificado",
        branch: branches.find((item) => item.id === cycle.branch_id)?.name || "Matriz",
        serviceUrl: `/portal/residuos?aba=faturamento2#${hash}`,
      };
    }),
    notes,
    links,
    tracking,
    (id) => {
      const company = companies.find((item) => item.id === id);
      return id
        ? company?.trade_name || company?.legal_name || "Terceirizada"
        : "Jacoby (faturamento direto)";
    },
  );
}

export function calculateDirectBillingRows(
  input: Pick<
    Inputs,
    "cycles" | "clients" | "branches" | "residues" | "placements" | "movements" | "directServices"
  >,
) {
  const { cycles, clients, branches, residues } = input;
  return cycles
    .filter((cycle) => cycle.status === "closed" && cycle.issuer_type === "jacoby")
    .map((cycle) => {
      const rental = input.placements
        .filter((item) => item.cycle_id === cycle.id)
        .reduce(
          (sum, item) => sum + Number(item.quantity || 0) * Number(item.monthly_rental_rate || 0),
          0,
        );
      const confirmed = input.movements.filter(
        (item) => item.cycle_id === cycle.id && item.confirmed,
      );
      const exchange = confirmed.reduce(
        (sum, item) => sum + Number(item.removed_quantity || 0) * Number(item.exchange_rate || 0),
        0,
      );
      // Sucata comprada do cliente é paga pela Jacoby: abate do total em vez de somar.
      const purchased = new Set(
        residues.filter((item: any) => item.jacoby_pays_client).map((item) => item.id),
      );
      const isPurchase = (item: BillingMovement) =>
        Boolean(item.waste_residue_id && purchased.has(item.waste_residue_id));
      const treatment = confirmed
        .filter((item) => !isPurchase(item))
        .reduce(
          (sum, item) => sum + Number(item.weight_kg || 0) * Number(item.treatment_rate || 0),
          0,
        );
      const purchases = confirmed
        .filter(isPurchase)
        .reduce(
          (sum, item) => sum + Number(item.weight_kg || 0) * Number(item.treatment_rate || 0),
          0,
        );
      const services = input.directServices
        .filter((item) => item.cycle_id === cycle.id)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const client = clients.find((item) => item.id === cycle.client_id);
      const branch = branches.find((item) => item.id === cycle.branch_id);
      return {
        cycle,
        clientName: client?.name || "",
        branchName: branch?.name || "Matriz",
        rental,
        exchange,
        treatment,
        services,
        purchases,
        total: rental + exchange + treatment + services - purchases,
      };
    })
    .sort((a, b) =>
      String(b.cycle.finalized_at || "").localeCompare(String(a.cycle.finalized_at || "")),
    );
}
