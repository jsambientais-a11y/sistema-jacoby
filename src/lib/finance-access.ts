// Contas confirmadas no projeto Jacoby. Não confere privilégios pelo nome do perfil.
export const JULIANA_ACCOUNT_ID = "b2f6e43d-ce24-4de2-a770-0548793cc180";
export const REINAN_ACCOUNT_ID = "9f04a62f-dba4-4cbb-918d-96e848ab0c16";
export function hasRestrictedFinanceAccess(
  userId: string | undefined,
  isAdmin: boolean,
  isClient: boolean,
) {
  return !isClient && isAdmin && (userId === JULIANA_ACCOUNT_ID || userId === REINAN_ACCOUNT_ID);
}
export function restrictedFinancePermission(
  permission: string,
  userId: string | undefined,
  isAdmin: boolean,
  isClient: boolean,
) {
  if (permission === "finance" || permission === "movement_settings")
    return hasRestrictedFinanceAccess(userId, isAdmin, isClient);
  return null;
}
export function overduePayables<
  T extends { kind: string; deleted_at: string | null; settled_on: string | null; due_on: string },
>(accounts: T[], today: string) {
  return accounts
    .filter((a) => a.kind === "payable" && !a.deleted_at && !a.settled_on && a.due_on < today)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
}
