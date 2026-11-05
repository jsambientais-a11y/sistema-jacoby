export type WasteReportMovement = {
  id: string;
  occurred_on: string;
  branch_id: string | null;
  waste_residue_id: string | null;
  weight_kg: number | string;
  service_order?: string | null;
  operation_type?: string;
};
export type WasteReportFilters = { year: string; month: string; branch: string; residue: string };
export type WasteReportRow = {
  id: string;
  date: string;
  branch: string;
  residue: string;
  serviceOrder: string;
  kg: number;
};
export const normalizeReportResidue = (name: string) => {
  const clean = name.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
  return clean.startsWith("MADEIRA") ? "MADEIRA" : clean || "SEM RESÍDUO INFORMADO";
};
export const reportWeight = (kg: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(kg);
export const reportDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split("-").reverse().join("/") : "Não informada";
export function buildWasteResidueReport(
  moves: WasteReportMovement[],
  branches: { id: string; name: string }[],
  residues: { id: string; name: string }[],
  filters: WasteReportFilters,
) {
  const branchNames = new Map(branches.map((item) => [item.id, item.name]));
  const residueNames = new Map(
    residues.map((item) => [item.id, normalizeReportResidue(item.name)]),
  );
  const operational = moves.filter((item) => item.operation_type !== "container_placement");
  const labelForBranch = (id: string | null) =>
    id ? branchNames.get(id) || "Filial não identificada" : "Matriz (sem filial/pátio)";
  const labelForResidue = (id: string | null) =>
    id ? residueNames.get(id) || "RESÍDUO NÃO IDENTIFICADO" : "SEM RESÍDUO INFORMADO";
  const branchOptions = Array.from(
    new Map(
      operational.map((item) => [item.branch_id || "__matriz__", labelForBranch(item.branch_id)]),
    ).entries(),
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const residueOptions = Array.from(
    new Set(operational.map((item) => labelForResidue(item.waste_residue_id))),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const rows: WasteReportRow[] = operational
    .filter(
      (item) =>
        item.occurred_on.slice(0, 4) === filters.year &&
        (filters.month === "todos" || item.occurred_on.slice(5, 7) === filters.month) &&
        (filters.branch === "all" || (item.branch_id || "__matriz__") === filters.branch) &&
        (filters.residue === "all" || labelForResidue(item.waste_residue_id) === filters.residue),
    )
    .map((item) => ({
      id: item.id,
      date: item.occurred_on,
      branch: labelForBranch(item.branch_id),
      residue: labelForResidue(item.waste_residue_id),
      serviceOrder: item.service_order?.trim() || "-",
      kg: Number.isFinite(Number(item.weight_kg)) ? Number(item.weight_kg) : 0,
    }))
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.branch.localeCompare(b.branch, "pt-BR") ||
        a.id.localeCompare(b.id),
    );
  const totalKg = rows.reduce((sum, item) => sum + item.kg, 0);
  const summaryMap = new Map<
    string,
    { name: string; kg: number; count: number; percentage: number }
  >();
  for (const item of rows) {
    const entry = summaryMap.get(item.residue) || {
      name: item.residue,
      kg: 0,
      count: 0,
      percentage: 0,
    };
    entry.kg += item.kg;
    entry.count++;
    summaryMap.set(item.residue, entry);
  }
  const summary = [...summaryMap.values()]
    .map((item) => ({ ...item, percentage: totalKg > 0 ? (item.kg / totalKg) * 100 : 0 }))
    .sort((a, b) => b.kg - a.kg || a.name.localeCompare(b.name, "pt-BR"));
  const months =
    filters.month === "todos"
      ? Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"))
      : [filters.month];
  const monthly = months.map((month) => ({
    name: new Intl.DateTimeFormat("pt-BR", { month: "short" })
      .format(new Date(2026, Number(month) - 1, 1))
      .replace(".", ""),
    kg: rows
      .filter((item) => item.date.slice(5, 7) === month)
      .reduce((sum, item) => sum + item.kg, 0),
  }));
  const period =
    filters.month === "todos"
      ? `Ano de ${filters.year}`
      : `${new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(Number(filters.year), Number(filters.month) - 1, 1))} de ${filters.year}`;
  return {
    rows,
    totalKg,
    summary,
    monthly,
    branchOptions,
    residueOptions,
    period,
    branchLabel:
      filters.branch === "all"
        ? "Todos os pátios e filiais"
        : branchOptions.find((item) => item.id === filters.branch)?.name || "Filial selecionada",
    residueLabel: filters.residue === "all" ? "Todos os resíduos" : filters.residue,
    unitCount: new Set(rows.map((item) => item.branch)).size,
    years: Array.from(new Set(operational.map((item) => item.occurred_on.slice(0, 4))))
      .sort()
      .reverse(),
    filters,
  };
}
export type WasteResidueReport = ReturnType<typeof buildWasteResidueReport>;

/** The client movement screen already applies its account-scoped filters.
 * Adapt those exact rows without fetching a different client's catalog/data. */
export function buildPortalMovementReport(
  rows: {
    id: string;
    occurred_on: string;
    branch_name: string | null;
    residue_name: string | null;
    weight_kg: number | string;
    service_order?: string | null;
  }[],
  filters: { year: string; month: string; branch: string; residue: string },
) {
  const branches = Array.from(
    new Set(rows.map((item) => item.branch_name || "Unidade não informada")),
  ).map((name) => ({ id: name, name }));
  const residues = Array.from(new Set(rows.map((item) => item.residue_name || "Sem resíduo"))).map(
    (name) => ({ id: name, name }),
  );
  const model = buildWasteResidueReport(
    rows.map((item) => ({
      ...item,
      branch_id: item.branch_name || "Unidade não informada",
      waste_residue_id: item.residue_name || "Sem resíduo",
    })),
    branches,
    residues,
    {
      year: filters.year,
      month: filters.month === "all" ? "todos" : filters.month,
      branch: "all",
      residue: "all",
    },
  );
  return {
    ...model,
    branchLabel: filters.branch === "all" ? "Todos os pátios e filiais" : filters.branch,
    residueLabel:
      filters.residue === "all" ? "Todos os resíduos" : normalizeReportResidue(filters.residue),
    filters: { ...filters, month: filters.month === "all" ? "todos" : filters.month },
  };
}
