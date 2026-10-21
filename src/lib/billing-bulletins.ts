export type BillingBulletin = {
  id: string;
  number: number;
  emittedAt: string | null;
  client: string;
  branch: string;
  company: string;
};

// A emissão é a finalização do BM, e não a emissão da NF ou o número do BM.
export function sortBillingBulletins(bulletins: BillingBulletin[]) {
  const emission = (value: string | null) => {
    const time = value ? Date.parse(value) : NaN;
    return Number.isFinite(time) ? time : -Infinity;
  };
  return [...bulletins].sort((a, b) => {
    const first = emission(a.emittedAt);
    const second = emission(b.emittedAt);
    if (first !== second) return first > second ? -1 : 1;
    return b.number - a.number || a.id.localeCompare(b.id);
  });
}
