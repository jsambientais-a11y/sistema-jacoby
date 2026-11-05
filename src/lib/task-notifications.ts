/** Regras puras dos avisos de tarefa, sem dependência de tela ou banco. */

export const ASSIGNMENT_NOTIFICATION_TYPES = [
  "assignment",
  "subtask_assignment",
  "collaborator_assignment",
];

/** Só quem entrou ou saiu muda: quem já era colaborador não pode ser avisado de novo. */
export function collaboratorChanges(currentIds: string[], nextIds: string[]) {
  return {
    toAdd: nextIds.filter((id) => !currentIds.includes(id)),
    toRemove: currentIds.filter((id) => !nextIds.includes(id)),
  };
}

/**
 * Os avisos de documento chegam em volume e empurram os demais para fora da lista
 * do sino. As atribuições não lidas são buscadas à parte e entram aqui, sem repetir.
 */
export function mergeNotifications<T extends { id: string; created_at: string }>(
  recent: T[],
  unreadAssignments: T[],
) {
  const byId = new Map([...recent, ...unreadAssignments].map((item) => [item.id, item]));
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
