import type { MapEquipment } from "./residue-map";
/** A registered equipment belongs to a client/scope even before it has movements or a residue. */
export function mapEquipmentInScope(
  equipment: MapEquipment[],
  clientId: string,
  branch: string | null,
  includeInactive = false,
) {
  return equipment
    .filter(
      (item) =>
        item.client_id === clientId &&
        (branch === null || (item.branch_id || "general") === branch) &&
        (includeInactive || item.active),
    )
    .sort((a, b) =>
      (a.identification || a.name).localeCompare(b.identification || b.name, "pt-BR"),
    );
}
