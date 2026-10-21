/** Display grouping only: original residue IDs and records remain unchanged. */
export function residueNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function uniqueResidueNames(items: readonly { name: string }[]): { id: string; name: string }[] {
  const names = new Map<string, { id: string; name: string }>();
  for (const item of items) {
    const id = residueNameKey(item.name);
    if (id && !names.has(id)) names.set(id, { id, name: item.name.trim().replace(/\s+/g, " ") });
  }
  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
