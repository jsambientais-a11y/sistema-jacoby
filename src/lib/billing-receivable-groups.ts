import type { Receivable, ReceivableEntry, ReceivableStatus } from "./receivables";

export type BulletinReceivables<R extends Receivable = Receivable> = {
  cycleId: string;
  bulletin: string;
  client: string;
  branch: string;
  rows: R[];
  total: number;
  received: number;
  remaining: number;
  confirmed: boolean;
  partiallyReceived: boolean;
  status: ReceivableStatus;
  expectedDates: string[];
  receivedDates: string[];
};
const rank: Record<ReceivableStatus, number> = {
  overdue: 0,
  due_soon: 1,
  upcoming: 2,
  no_date: 3,
  received: 4,
};
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const dates = (values: (string | null)[]) =>
  [...new Set(values.filter((v): v is string => Boolean(v)))].sort();

/** Presentation only: existing receivables, tracking, links and settlements keep their IDs.
 * Group by cycle UUID, never the display number or issuer. Sum the Jacoby receivable,
 * not the invoice's net amount (one invoice can be referenced by multiple categories).
 */
export function groupReceivablesByBulletin<E extends ReceivableEntry, R extends Receivable<E>>(
  rows: R[],
): BulletinReceivables<R>[] {
  const groups = new Map<string, Map<string, R>>();
  for (const row of rows) {
    let items = groups.get(row.entry.cycleId);
    if (!items) {
      items = new Map();
      groups.set(row.entry.cycleId, items);
    }
    items.set(row.id, row);
  }
  return [...groups.entries()]
    .map(([cycleId, values]) => {
      const items = [...values.values()];
      const totalCents = items.reduce((sum, row) => sum + cents(row.amount), 0);
      const receivedCents = items
        .filter((row) => row.status === "received")
        .reduce((sum, row) => sum + cents(row.amount), 0);
      // Zero-value categories don't keep an otherwise paid BM open. Pending-service
      // records remain visible in details and keep the provisional flag.
      const significant = items.filter((row) => cents(row.amount) !== 0);
      const relevant = significant.length ? significant : items;
      const pending = relevant.filter((row) => row.status !== "received");
      const status = pending.length
        ? pending.reduce(
            (a, row) => (rank[row.status] < rank[a] ? row.status : a),
            pending[0].status,
          )
        : "received";
      return {
        cycleId,
        bulletin: items[0].entry.bulletin,
        client: items[0].entry.client,
        branch: items[0].entry.branch,
        rows: items,
        total: totalCents / 100,
        received: receivedCents / 100,
        remaining: (totalCents - receivedCents) / 100,
        confirmed: items.every((row) => row.confirmed),
        partiallyReceived: receivedCents > 0 && totalCents - receivedCents > 0,
        status,
        expectedDates: dates(pending.map((row) => row.expectedOn)),
        receivedDates: dates(
          relevant.filter((row) => row.status === "received").map((row) => row.receivedOn),
        ),
      } satisfies BulletinReceivables<R>;
    })
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        (a.status === "received"
          ? String(b.receivedDates.at(-1) || "").localeCompare(String(a.receivedDates.at(-1) || ""))
          : String(a.expectedDates[0] || "9999").localeCompare(
              String(b.expectedDates[0] || "9999"),
            )) ||
        b.total - a.total,
    );
}
