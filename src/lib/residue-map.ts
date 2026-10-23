export type MapStandardResidue = {
  id: string;
  name: string;
  waste_class: string;
  unit: string;
  active: boolean;
};
export type MapResidue = {
  id: string;
  client_id: string;
  branch_id: string | null;
  name: string;
  active: boolean;
  default_treatment_rate: number;
  unit: string;
  updated_at: string;
  waste_class?: string;
  default_rental_rate?: number;
  default_exchange_rate?: number;
  jacoby_pays_client?: boolean;
};
export type MapBranch = { id: string; client_id: string; name: string; is_active: boolean };
export type MapCompany = { id: string; trade_name: string | null; legal_name: string };
export type MapCycle = {
  id: string;
  client_id: string;
  bulletin_number: number;
  branch_id: string | null;
  status: string;
  outsourced_company_id: string | null;
  issuer_type: string;
  period_start?: string;
  period_end?: string;
};
export type MapMovement = {
  id: string;
  cycle_id: string;
  waste_residue_id: string | null;
  confirmed: boolean;
  treatment_rate: number;
  equipment_id?: string | null;
  replacement_equipment_id?: string | null;
};
export type MapPlacement = {
  id: string;
  cycle_id: string;
  waste_residue_id: string | null;
  equipment_id?: string | null;
};
export type MapEquipment = {
  id: string;
  client_id: string;
  branch_id: string | null;
  identification: string | null;
  name: string;
  default_waste_residue_id: string | null;
  active: boolean;
};
export type MapSetting = {
  id: string;
  client_id: string;
  outsourced_company_id: string;
  active: boolean;
  tax_withholding_rate: number;
  rental_commission_rate: number;
  exchange_commission_rate: number;
};
export type MapRate = {
  id: string;
  commission_setting_id: string;
  waste_residue_id: string;
  outsourced_treatment_rate: number;
  jacoby_treatment_rate: number | null;
};
export type MapTemplate = Omit<MapSetting, "client_id">;
export type MapTemplateRate = {
  id: string;
  commission_template_id: string;
  residue_name: string;
  outsourced_treatment_rate: number;
  jacoby_treatment_rate: number | null;
};
export type MapEmission = {
  id: string;
  cycle_id: string;
  waste_residue_id: string;
  display_number: string;
  client_portal_visible: boolean;
};
export type MapCommission = {
  id: string;
  cycle_id: string;
  waste_residue_id: string | null;
  outsourced_company_id: string;
  net_commission_amount: number;
  payment_status: string;
  source_type?: "rental" | "exchange" | "treatment";
  commission_setting_id?: string | null;
  commission_template_id?: string | null;
  commission_rate?: number;
  base_amount?: number;
  tax_withholding_rate?: number;
};
export type MapTracking = {
  id: string;
  cycle_id: string;
  category: string;
  source_key: string;
  invoice_number: string | null;
  rule_type?: "percent" | "fixed";
  rule_value?: number;
  net_invoice_amount?: number | null;
  commission_amount?: number;
};
export type MapLegacyLink = { id: string; report_id: string; waste_residue_id: string | null };
export type MapDetail = {
  legacyMovements?: MapLegacyLink[];
  legacyRates?: MapLegacyLink[];
  tickets?: MapLegacyLink[];
  legacyReports?: { id: string; client_id: string; period_start: string; status: string }[];
  cycles: MapCycle[];
  movements: MapMovement[];
  placements: MapPlacement[];
  equipment: MapEquipment[];
  settings: MapSetting[];
  rates: MapRate[];
  templates: MapTemplate[];
  templateRates: MapTemplateRate[];
  emissions: MapEmission[];
  commissions: MapCommission[];
  tracking: MapTracking[];
};

export const mapNameKey = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
export function sameScopeResidues(residue: MapResidue, all: MapResidue[]) {
  return all.filter(
    (item) =>
      item.client_id === residue.client_id &&
      item.branch_id === residue.branch_id &&
      mapNameKey(item.name) === mapNameKey(residue.name),
  );
}

export function residueConnections(residue: MapResidue, data: MapDetail) {
  const movements = data.movements.filter((item) => item.waste_residue_id === residue.id);
  const placements = data.placements.filter((item) => item.waste_residue_id === residue.id);
  const emissions = data.emissions.filter((item) => item.waste_residue_id === residue.id);
  const commissions = data.commissions.filter((item) => item.waste_residue_id === residue.id);
  const cycleIds = new Set(
    [...movements, ...placements, ...emissions, ...commissions].map((item) => item.cycle_id),
  );
  const cycles = data.cycles.filter((item) => cycleIds.has(item.id));
  const rules = data.rates
    .filter((item) => item.waste_residue_id === residue.id)
    .map((rate) => ({
      ...rate,
      setting: data.settings.find((item) => item.id === rate.commission_setting_id),
    }));
  // Templates match by name in the database; an explicit client/residue rule takes precedence.
  const templates = data.templateRates
    .filter(
      (item) =>
        item.residue_name.toLocaleLowerCase("pt-BR") === residue.name.toLocaleLowerCase("pt-BR"),
    )
    .map((rate) => ({
      ...rate,
      template: data.templates.find((item) => item.id === rate.commission_template_id),
    }));
  const legacyMovements = (data.legacyMovements || []).filter(
    (item) => item.waste_residue_id === residue.id,
  );
  const legacyRates = (data.legacyRates || []).filter(
    (item) => item.waste_residue_id === residue.id,
  );
  const tickets = (data.tickets || []).filter((item) => item.waste_residue_id === residue.id);
  const equipmentIds = new Set(
    [
      ...movements.flatMap((item) => [item.equipment_id, item.replacement_equipment_id]),
      ...placements.map((item) => item.equipment_id),
    ].filter(Boolean),
  );
  const reportIds = new Set(
    [...legacyMovements, ...legacyRates, ...tickets].map((item) => item.report_id),
  );
  return {
    movements,
    placements,
    emissions,
    commissions,
    cycles,
    rules,
    templates,
    legacyMovements,
    legacyRates,
    tickets,
    legacyReports: (data.legacyReports || []).filter((item) => reportIds.has(item.id)),
    equipment: data.equipment.filter(
      (item) => item.default_waste_residue_id === residue.id || equipmentIds.has(item.id),
    ),
    // Tracking belongs to a BM/category/company, not directly to an individual residue.
    tracking: data.tracking.filter((item) => cycleIds.has(item.cycle_id)),
  };
}
