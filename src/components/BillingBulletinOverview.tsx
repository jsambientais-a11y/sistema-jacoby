import { sortBillingBulletins, type BillingBulletin } from "@/lib/billing-bulletins";
import { Button } from "@/components/ui/button";
import type { BillingFlowEntry } from "@/components/BillingFlowPreview";

const labels = { rental: "Locação", exchange: "Troca", treatment: "Tratamento", service: "Serviços" };
const emissionDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export function BillingBulletinOverview({ bulletins, entries, search, onOpen }: {
  bulletins: BillingBulletin[];
  entries: BillingFlowEntry[];
  search: string;
  onOpen: (entry: BillingFlowEntry) => void;
}) {
  const byCycle = new Map<string, BillingFlowEntry[]>();
  for (const entry of entries) byCycle.set(entry.cycleId, [...(byCycle.get(entry.cycleId) || []), entry]);
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const shown = sortBillingBulletins(bulletins).filter((bulletin) => !query ||
    [`#${String(bulletin.number).padStart(3, "0")}`, bulletin.client, bulletin.branch, bulletin.company,
      ...(byCycle.get(bulletin.id) || []).map((entry) => entry.description)]
      .join(" ").toLocaleLowerCase("pt-BR").includes(query));

  return <section className="border-t" aria-label="Todos os BMs emitidos">
    <div className="space-y-1 border-b p-4 sm:p-5">
      <h3 className="font-semibold">Todos os BMs emitidos ({shown.length})</h3>
      <p className="text-sm text-muted-foreground">Um registro por BM, do mais recente ao mais antigo pela data de emissão. Selecione uma categoria para conferir o faturamento.</p>
    </div>
    {!shown.length ? <p className="p-8 text-center text-sm text-muted-foreground">{query ? "Nenhum BM corresponde à busca." : "Nenhum BM emitido disponível."}</p> :
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
        <thead><tr className="border-b bg-muted/30 text-left text-muted-foreground">
          <th scope="col" className="p-3">Emissão ↓</th><th scope="col" className="p-3">BM</th>
          <th scope="col" className="p-3">Cliente / unidade</th><th scope="col" className="p-3">Emissor</th>
          <th scope="col" className="p-3">Conferir faturamento</th>
        </tr></thead>
        <tbody>{shown.map((bulletin) => <tr key={bulletin.id} className="border-b last:border-0">
          <td className="whitespace-nowrap p-3">{bulletin.emittedAt && Number.isFinite(Date.parse(bulletin.emittedAt)) ? emissionDate.format(new Date(bulletin.emittedAt)) : "Data não informada"}</td>
          <td className="p-3 font-semibold">#{String(bulletin.number).padStart(3, "0")}</td>
          <td className="p-3"><p className="font-medium">{bulletin.client}</p><p className="text-xs text-muted-foreground">{bulletin.branch}</p></td>
          <td className="p-3">{bulletin.company}</td>
          <td className="p-3"><div className="flex flex-wrap gap-2">{(byCycle.get(bulletin.id) || []).map((entry) =>
            <Button key={entry.id} type="button" variant="outline" size="sm" onClick={() => onOpen(entry)} aria-label={`Conferir ${labels[entry.category]} do BM #${String(bulletin.number).padStart(3, "0")}`}>
              {labels[entry.category]}
            </Button>)}{!byCycle.has(bulletin.id) && <span className="text-xs text-muted-foreground">Sem lançamentos de faturamento</span>}</div></td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}
