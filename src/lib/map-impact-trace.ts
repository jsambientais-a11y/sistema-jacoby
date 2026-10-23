import { residueConnections, type MapDetail, type MapResidue } from "./residue-map";
export const impactCategoryNames: Record<string, string> = {
  rental: "Locação",
  exchange: "Troca",
  treatment: "Tratamento",
  service: "Serviços",
};
export function financialImpactUrl(cycleId: string, category?: string, sourceKey?: string) {
  const params = new URLSearchParams({ mapCycle: cycleId });
  if (category && sourceKey) {
    params.set("mapEntry", `${cycleId}:${category}:${sourceKey}`);
    params.set("mapCategory", category);
    params.set("mapFocus", "commission");
  }
  return `/financeiro?${params}`;
}
export function commissionTraceSources(cycleId: string, data: MapDetail) {
  const records = data.commissions.filter((row) => row.cycle_id === cycleId);
  const settingIds = new Set(records.map((row) => row.commission_setting_id).filter(Boolean));
  const templateIds = new Set(records.map((row) => row.commission_template_id).filter(Boolean));
  return {
    settings: data.settings.filter((row) => settingIds.has(row.id)),
    templates: data.templates.filter((row) => templateIds.has(row.id)),
  };
}
export function impactTraceCycles(
  clientId: string,
  branchId: string | null,
  residue: MapResidue | undefined,
  data: MapDetail,
  equipmentId?: string,
) {
  const equipmentCycles = equipmentId
    ? new Set(
        [
          ...data.placements.filter((p) => p.equipment_id === equipmentId),
          ...data.movements.filter(
            (m) => m.equipment_id === equipmentId || m.replacement_equipment_id === equipmentId,
          ),
        ].map((row) => row.cycle_id),
      )
    : null;
  const linked = residue
    ? new Set(residueConnections(residue, data).cycles.map((c) => c.id))
    : null;
  return data.cycles
    .filter(
      (c) =>
        c.client_id === clientId &&
        (!branchId || (c.branch_id || "general") === branchId) &&
        (!linked || linked.has(c.id)) &&
        (!equipmentCycles || equipmentCycles.has(c.id)),
    )
    .sort((a, b) => b.bulletin_number - a.bulletin_number);
}
