import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
export function ServiceLinks({ serviceId, label }: { serviceId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["service-deletion-links", serviceId],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      async function read(table: string, fields: string) {
        const records: any[] = [];
        for (let offset = 0; ; offset += 500) {
          const result = await (supabase.from(table as any) as any)
            .select(fields)
            .eq("waste_service_id", serviceId)
            .order("id")
            .range(offset, offset + 499);
          if (result.error) throw result.error;
          records.push(...result.data);
          if (result.data.length < 500) return records;
        }
      }
      const [entries, legacy, clients] = await Promise.all([
        read(
          "billing_v2_cycle_services",
          "id,cycle_id,billing_v2_cycles(id,bulletin_number,client_id,status,clients(name))",
        ),
        read(
          "waste_report_services",
          "id,report_id,waste_reports(id,client_id,period_start,clients(name))",
        ),
        read("waste_client_service_rates", "id,client_id,clients(name)"),
      ]);
      return { entries, legacy, clients };
    },
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Ver vínculos
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogTitle>Vínculos do serviço · {label}</DialogTitle>
          <DialogDescription>
            Consulta somente leitura. Lançamentos em boletins e demonstrativos bloqueiam a exclusão
            do cadastro para preservar o histórico.
          </DialogDescription>
          <p className="break-all text-xs text-muted-foreground">Serviço: {serviceId}</p>
          {query.isPending ? (
            <p>Consultando vínculos…</p>
          ) : query.error ? (
            <p role="alert">Não foi possível consultar: {query.error.message}</p>
          ) : (
            <>
              <p>
                {query.data.entries.length} lançamentos em BMs · {query.data.legacy.length} vínculos
                em demonstrativos antigos · {query.data.clients.length} configurações de clientes
              </p>
              {query.data.entries.map((e) => (
                <div key={e.id} className="space-y-2 rounded-lg border p-4">
                  <h3 className="font-semibold">
                    {e.billing_v2_cycles
                      ? `BM #${e.billing_v2_cycles.bulletin_number} · ${e.billing_v2_cycles.status}`
                      : "BM não disponível nesta consulta"}
                  </h3>
                  <p>{e.billing_v2_cycles?.clients?.name || "Cliente não disponível"}</p>
                  <p className="break-all text-xs text-muted-foreground">
                    Lançamento: {e.id} · BM: {e.cycle_id}
                  </p>
                </div>
              ))}
              {query.data.legacy.map((e) => (
                <div key={e.id} className="rounded-lg border p-4">
                  <p>
                    Demonstrativo: {e.waste_reports?.period_start} ·{" "}
                    {e.waste_reports?.clients?.name}
                  </p>
                  <p className="break-all text-xs">ID: {e.report_id}</p>
                </div>
              ))}
              <p className="text-sm text-muted-foreground">
                Clientes com valor padrão:{" "}
                {query.data.clients.map((c) => c.clients?.name || c.client_id).join(", ") ||
                  "Nenhum"}
                . O cadastro de serviço pode ser compartilhado entre clientes.
              </p>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            Atualizar consulta
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
