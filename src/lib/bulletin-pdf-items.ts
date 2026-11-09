import type {
  BulletinPdfPlacement,
  BulletinPdfMovement,
  BulletinPdfService,
  BulletinPdfEquipment,
} from "./bulletin-pdf";
export type BulletinPdfItem = {
  name: string;
  type: string;
  date: string | null;
  quantity: string;
  unitValue: number;
  value: number;
};
const number = (v: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v || 0);
const equipmentName = (item?: BulletinPdfEquipment) =>
  item
    ? [item.identification, item.name, item.equipment_type].filter(Boolean).join(" · ")
    : "Equipamento";
export function buildBulletinPdfItems(input: {
  placements: BulletinPdfPlacement[];
  movements: BulletinPdfMovement[];
  services: BulletinPdfService[];
  equipment: BulletinPdfEquipment[];
  residues: { id: string; name: string }[];
  wasteServices: { id: string; name: string }[];
}): BulletinPdfItem[] {
  const { placements, movements, services, equipment, residues, wasteServices } = input;
  const confirmed = movements.filter((item) => item.confirmed);
  // Preserve dates instead of merging operations from different days into one undated row.
  const treatments = new Map<
    string,
    { residueId: string | null; date: string | null; weight: number; value: number; rate: number }
  >();
  for (const item of confirmed) {
    const rate = Number(item.treatment_rate || 0),
      date = item.occurred_on || null;
    const key = `${item.waste_residue_id || "sem-residuo"}:${rate}:${date || "sem-data"}`;
    const current = treatments.get(key) || {
      residueId: item.waste_residue_id,
      date,
      weight: 0,
      value: 0,
      rate,
    };
    current.weight += Number(item.weight_kg || 0);
    current.value += Number(item.weight_kg || 0) * rate;
    treatments.set(key, current);
  }
  return [
    ...placements.map((item) => ({
      name: `Locação · ${equipmentName(equipment.find((e) => e.id === item.equipment_id))}`,
      type: "Equipamento",
      date: item.started_on || null,
      quantity: `${number(Number(item.quantity))} un.`,
      unitValue: Number(item.monthly_rental_rate || 0),
      value: Number(item.quantity) * Number(item.monthly_rental_rate || 0),
    })),
    ...confirmed
      .filter((item) => Number(item.removed_quantity || 0) > 0)
      .map((item) => ({
        name: `Troca · ${equipmentName(equipment.find((e) => e.id === item.equipment_id))}`,
        type: item.replacement_equipment_id
          ? `Entrada: ${equipmentName(equipment.find((e) => e.id === item.replacement_equipment_id))}`
          : "Troca",
        date: item.occurred_on || null,
        quantity: `${number(Number(item.removed_quantity))} un.`,
        unitValue: Number(item.exchange_rate || 0),
        value: Number(item.removed_quantity) * Number(item.exchange_rate || 0),
      })),
    ...[...treatments.values()]
      .filter((item) => item.weight > 0)
      .map((item) => ({
        name: residues.find((e) => e.id === item.residueId)?.name || "Tratamento de resíduos",
        type: "Resíduo",
        date: item.date,
        quantity: `${number(item.weight)} kg`,
        unitValue: item.rate,
        value: item.value,
      })),
    ...services.map((item) => ({
      name: wasteServices.find((e) => e.id === item.waste_service_id)?.name || "Serviço",
      type: "Serviço terceirizado",
      date: item.execution_date || null,
      quantity: `${number(Number(item.quantity || 1))} un.`,
      unitValue: Number(item.unit_amount ?? item.amount ?? 0),
      value: Number(item.amount || 0),
    })),
  ];
}
export function bulletinItemDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : "-";
}
