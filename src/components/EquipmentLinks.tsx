import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Placement = {
  id: string;
  cycle_id: string | null;
  branch_id: string | null;
  started_on: string;
  ended_on: string | null;
  quantity: number;
};
export function EquipmentLinks({
  equipmentId,
  clientId,
  label,
}: {
  equipmentId: string;
  clientId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["equipment-deletion-links", equipmentId, clientId],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      const placements: Placement[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await (supabase.from("billing_v2_placements" as any) as any)
          .select("id,cycle_id,branch_id,started_on,ended_on,quantity")
          .eq("client_id", clientId)
          .eq("equipment_id", equipmentId)
          .order("id")
          .range(offset, offset + 499);
        if (result.error) throw result.error;
        placements.push(...result.data);
        if (result.data.length < 500) break;
      }
      const cycleIds = [...new Set(placements.flatMap((p) => (p.cycle_id ? [p.cycle_id] : [])))];
      const cycles: { id: string; bulletin_number: number; status: string }[] = [];
      for (let offset = 0; offset < cycleIds.length; offset += 100) {
        const result = await (supabase.from("billing_v2_cycles" as any) as any)
          .select("id,bulletin_number,status")
          .eq("client_id", clientId)
          .in("id", cycleIds.slice(offset, offset + 100));
        if (result.error) throw result.error;
        cycles.push(...result.data);
      }
      const branches = await (supabase.from("client_branches" as any) as any)
        .select("id,name")
        .eq("client_id", clientId);
      if (branches.error) throw branches.error;
      return { placements, cycles, branches: branches.data as { id: string; name: string }[] };
    },
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Ver vínculos
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogTitle>Vínculos do equipamento · {label}</DialogTitle>
          <DialogDescription>
            Consulta das colocações que podem bloquear a exclusão. Nenhum dado é alterado.
          </DialogDescription>
          <p className="break-all text-xs text-muted-foreground">Equipamento: {equipmentId}</p>
          {query.isPending ? (
            <p>Consultando vínculos…</p>
          ) : query.error ? (
            <p role="alert">Não foi possível consultar: {query.error.message}</p>
          ) : (
            <>
              <p className="font-medium">
                {query.data.placements.length} colocações vinculadas ao equipamento.
              </p>
              {!query.data.placements.length && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma colocação acessível à sua conta foi encontrada. Se a exclusão continuar
                  bloqueada, é necessário conferir as permissões e os vínculos diretamente no banco.
                </p>
              )}
              {query.data.placements.map((p) => {
                const cycle = query.data.cycles.find((c) => c.id === p.cycle_id);
                return (
                  <div key={p.id} className="space-y-2 rounded-lg border p-4">
                    <h3 className="font-semibold">
                      {p.cycle_id
                        ? cycle
                          ? `BM #${String(cycle.bulletin_number).padStart(3, "0")} · ${cycle.status === "closed" ? "Finalizado" : "Em edição"}`
                          : "BM não disponível nesta consulta"
                        : "Colocação sem vínculo com BM"}
                    </h3>
                    <p className="text-sm">
                      {query.data.branches.find((b) => b.id === p.branch_id)?.name ||
                        "Geral do cliente"}{" "}
                      · Início: {p.started_on} · Encerramento: {p.ended_on || "em aberto"} ·
                      Quantidade: {p.quantity}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      Colocação: {p.id}
                      {p.cycle_id ? ` · BM: ${p.cycle_id}` : " · cycle_id: vazio"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {p.cycle_id
                        ? "Esta colocação ainda referencia o equipamento e impede sua exclusão."
                        : "Como esta colocação não pertence a um BM, excluir um boletim não remove este registro. Ela continua referenciando o equipamento e bloqueia sua exclusão."}
                    </p>
                  </div>
                );
              })}
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
