import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Repeat2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { bulletinNumber } from "@/lib/bulletin-pdf";
import { recurrenceDue } from "@/lib/finance-recurrence";

export type RecurringBulletinSource = { id: string; bulletin_number: number; clientName: string };
const date = (value: string) => value.split("-").reverse().join("/");

export function RecurringBulletinsDialog({
  source,
  onClose,
}: {
  source: RecurringBulletinSource;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format();
  const latestFirstDate = recurrenceDue(today, "yearly", 1);
  const [firstOn, setFirstOn] = useState("");
  const [repetitions, setRepetitions] = useState("12");
  const [copyServices, setCopyServices] = useState(false);
  const key = ["billing-v2-recurring-bulletins", user?.id];
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_recurring_billing_bulletin", {
        source_id: source.id,
        first_date: firstOn,
        occurrence_count: Number(repetitions),
        copy_services: copyServices,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      for (const queryKey of [
        key,
        ["billing-v2-cycles"],
        ["billing-v2-recent"],
        ["billing-v2-search"],
        ["billing-v2-all-clients-search"],
      ])
        void qc.invalidateQueries({ queryKey });
      toast.success("Recorrência programada.");
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });
  const count = Number(repetitions);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(firstOn) &&
    firstOn >= today &&
    firstOn <= latestFirstDate &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= 60;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid && !save.isPending) save.mutate();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat2 className="h-5 w-5 text-primary" />
            Programar BM recorrente
          </DialogTitle>
          <DialogDescription>
            Modelo: {bulletinNumber(source.bulletin_number)} · {source.clientName}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <p className="rounded-lg bg-muted p-3 text-sm">
            Será criado um BM <strong>em edição</strong> para o mês inteiro, com o mesmo cliente,
            unidade e emissor do modelo. A equipe revisa e finaliza quando estiver pronto.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              Data de geração do primeiro BM
              <Input
                type="date"
                value={firstOn}
                min={today}
                max={latestFirstDate}
                required
                onChange={(event) => setFirstOn(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              Quantidade de BMs mensais
              <Input
                type="number"
                min="1"
                max="60"
                step="1"
                required
                value={repetitions}
                onChange={(event) => setRepetitions(event.target.value)}
              />
            </label>
          </div>
          {valid && (
            <p className="text-sm text-muted-foreground">
              {count} {count === 1 ? "BM" : "BMs"} · {date(firstOn)} a{" "}
              {date(recurrenceDue(firstOn, "monthly", count - 1))}. Se o mês for mais curto, o BM
              será gerado no último dia.
            </p>
          )}
          <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
            <input
              className="mt-0.5"
              type="checkbox"
              checked={copyServices}
              onChange={(event) => setCopyServices(event.target.checked)}
            />
            <span>
              <strong>Copiar serviços, quantidades e valores do modelo</strong>
              <span className="mt-1 block text-muted-foreground">
                Locações, movimentações, notas, anexos, datas de execução e baixas não são copiadas.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || save.isPending}>
              {save.isPending ? "Programando…" : "Programar série"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
