import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { bulletinNumber } from "@/lib/bulletin-pdf";
import { parseFinanceMoney } from "@/lib/enterprise-finance";
import { recurrenceDue } from "@/lib/finance-recurrence";

type Plan = Database["public"]["Tables"]["billing_v2_recurring_bulletins"]["Row"];
type Cycle = {
  id: string;
  client_id: string;
  branch_id: string | null;
  bulletin_number: number;
  status: string;
  issuer_type: string;
  outsourced_company_id: string | null;
  services: { amount: number; outsourced_company_id: string | null }[];
};
type Occurrence = { scheduled_on: string; cycle_id: string | null; cycle: Cycle | null };
type OpenCycle = (cycle: Cycle) => void;
const date = (value: string) => value.split("-").reverse().join("/");
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function Sequence({ plan, onOpenCycle }: { plan: Plan; onOpenCycle: OpenCycle }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["billing-v2-recurring-sequence", user?.id, plan.id];
  const [batchOpen, setBatchOpen] = useState(false);
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>({});
  const occurrences = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_v2_recurring_bulletin_occurrences")
        .select(
          "scheduled_on,cycle_id,cycle:billing_v2_cycles(id,client_id,branch_id,bulletin_number,status,issuer_type,outsourced_company_id,services:billing_v2_cycle_services(amount,outsourced_company_id))",
        )
        .eq("schedule_id", plan.id);
      if (error) throw new Error(error.message);
      return data as unknown as Occurrence[];
    },
  });
  const refreshSequence = () =>
    Promise.all(
      [
        key,
        ["billing-v2-recurring-bulletins"],
        ["billing-v2-cycles"],
        ["billing-v2-recent"],
        ["billing-v2-search"],
        ["billing-v2-all-clients-search"],
        ["billing-v2-cycle-services"],
      ].map((queryKey) => qc.invalidateQueries({ queryKey })),
    );
  const prepare = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("prepare_recurring_billing_bulletins", {
        target_id: plan.id,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (count) => {
      await refreshSequence();
      toast.success(`${count} BM(s) gerado(s) em edição.`);
    },
    onError: (error) => toast.error(error.message),
  });
  const copy = useMutation({
    mutationFn: async (cycleId: string) => {
      const { error } = await supabase.rpc("copy_previous_recurring_bulletin_values", {
        target_cycle_id: cycleId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await refreshSequence();
      toast.success("Valores dos serviços copiados.");
    },
    onError: (error) => toast.error(error.message),
  });
  const finish = useMutation({
    mutationFn: async (
      values: { cycle_id: string; service_total: number; expected_amount: number }[],
    ) => {
      const { data, error } = await supabase.rpc("finalize_reviewed_recurring_billing_bulletins", {
        target_id: plan.id,
        reviewed_values: values,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (count) => {
      setBatchOpen(false);
      await Promise.all(
        [
          key,
          ["billing-v2-recurring-bulletins"],
          ["billing-v2-cycles"],
          ["billing-v2-recent"],
          ["billing-v2-search"],
          ["billing-v2-all-clients-search"],
          ["outsourced-financial-cycles"],
          ["outsourced-movement-commissions"],
          ["outsourced-financial-services"],
          ["jacoby-direct-billing-data"],
          ["financial-service-invoice-links"],
          ["billing-receivable-tracking"],
          ["financial-month-panel"],
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
      );
      if (count)
        toast.success(`${count} BM(s) finalizado(s). Previsões registradas no Financeiro.`);
      else toast.info("Nenhum BM em edição ou programado no intervalo escolhido.");
    },
    onError: (error) => {
      toast.error(error.message);
      void refreshSequence();
    },
  });
  if (occurrences.isPending)
    return <p className="text-sm text-muted-foreground">Carregando sequência…</p>;
  if (occurrences.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar a sequência.
      </p>
    );

  const byDate = new Map(occurrences.data.map((item) => [item.scheduled_on, item]));
  const sequence = Array.from({ length: plan.repetitions }, (_, index) => {
    const scheduled = recurrenceDue(plan.first_on, "monthly", index);
    const occurrence = byDate.get(scheduled);
    return { scheduled, occurrence };
  });
  const drafts = sequence.flatMap(({ occurrence, scheduled }) => {
    const cycle = occurrence?.cycle;
    if (!cycle || cycle.status !== "draft") return [];
    const serviceTotal =
      cycle.services
        .filter((service) => service.outsourced_company_id === cycle.outsourced_company_id)
        .reduce((total, service) => total + Math.round(Number(service.amount) * 100), 0) / 100;
    return [{ cycle, scheduled, serviceTotal }];
  });
  const amountFor = (cycleId: string) => {
    try {
      return parseFinanceMoney(amountInputs[cycleId] || "") / 100;
    } catch {
      return 0;
    }
  };
  const values = drafts.map(({ cycle, serviceTotal }) => ({
    cycle_id: cycle.id,
    service_total: serviceTotal,
    expected_amount: cycle.issuer_type === "outsourced" ? amountFor(cycle.id) : serviceTotal,
  }));
  const valid =
    values.length > 0 &&
    values.every(
      ({ service_total, expected_amount }) =>
        service_total > 0 && expected_amount > 0 && expected_amount <= 9_999_999_999.99,
    );
  const hasZero = drafts.some(({ serviceTotal }) => serviceTotal <= 0);
  const draftTotals = new Map(drafts.map(({ cycle, serviceTotal }) => [cycle.id, serviceTotal]));
  const busy = prepare.isPending || copy.isPending || finish.isPending;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (valid && !busy) finish.mutate(values);
  };

  return (
    <div className="space-y-3 border-t pt-3">
      {(plan.next_on || drafts.length > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {hasZero
              ? "Preencha o valor dos serviços nos BMs em edição para finalizar."
              : plan.next_on
                ? "Gere os BMs em edição para conferir os valores de cada mês."
                : "Confira os valores antes de finalizar os BMs em edição."}
          </p>
          {plan.next_on ? (
            <Button size="sm" disabled={busy} onClick={() => prepare.mutate()}>
              {prepare.isPending ? "Gerando…" : "Gerar BMs para revisão"}
            </Button>
          ) : (
            <Button size="sm" disabled={busy || hasZero} onClick={() => setBatchOpen(true)}>
              Finalizar em série
            </Button>
          )}
        </div>
      )}
      <ol className="max-h-80 divide-y overflow-y-auto rounded-lg border">
        {sequence.map(({ scheduled, occurrence }, index) => (
          <li
            key={scheduled}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
          >
            <div>
              <span className="font-medium">
                {index + 1} de {plan.repetitions} · {date(scheduled)}
              </span>
              <span className="ml-2 text-muted-foreground">
                {occurrence?.cycle
                  ? `BM ${bulletinNumber(occurrence.cycle.bulletin_number)} · ${occurrence.cycle.status === "closed" ? "Finalizado" : "Em edição"}`
                  : occurrence
                    ? occurrence.cycle_id
                      ? "BM indisponível"
                      : "BM removido"
                    : plan.stopped_at
                      ? "Cancelado"
                      : "Programado"}
              </span>
              {occurrence?.cycle?.status === "draft" && (
                <p className="text-xs text-muted-foreground">
                  Serviços: {money.format(draftTotals.get(occurrence.cycle.id) ?? 0)}
                </p>
              )}
            </div>
            {occurrence?.cycle && (
              <div className="flex flex-wrap items-center gap-2">
                {occurrence.cycle.status === "draft" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      const source = index === 0 ? "BM modelo" : "BM anterior";
                      if (
                        window.confirm(`Copiar os valores dos serviços do ${source} para este mês?`)
                      )
                        copy.mutate(occurrence.cycle!.id);
                    }}
                  >
                    {index === 0 ? "Copiar valores do modelo" : "Copiar valores do anterior"}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => onOpenCycle(occurrence.cycle!)}>
                  Abrir BM
                </Button>
              </div>
            )}
          </li>
        ))}
      </ol>
      <Dialog
        open={batchOpen}
        onOpenChange={(open) => {
          if (!finish.isPending) setBatchOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Finalizar recorrentes em série</DialogTitle>
            <DialogDescription>
              Confira os valores a receber de cada BM. A previsão usa a data de cada ocorrência.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
              {drafts.map(({ cycle, scheduled, serviceTotal }, index) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                  key={cycle.id}
                >
                  <div>
                    <p className="font-medium">
                      BM {bulletinNumber(cycle.bulletin_number)} · {date(scheduled)}
                    </p>
                    <p className="text-muted-foreground">Serviços: {money.format(serviceTotal)}</p>
                  </div>
                  {cycle.issuer_type === "outsourced" ? (
                    <label className="grid gap-1">
                      Repasse a receber
                      <Input
                        className="w-36"
                        inputMode="decimal"
                        placeholder="0,00"
                        required
                        value={amountInputs[cycle.id] || ""}
                        onChange={(event) =>
                          setAmountInputs((current) => ({
                            ...current,
                            [cycle.id]: event.target.value,
                          }))
                        }
                      />
                      {index > 0 &&
                        drafts[index - 1].cycle.issuer_type === "outsourced" &&
                        drafts[index - 1].cycle.outsourced_company_id ===
                          cycle.outsourced_company_id &&
                        amountFor(drafts[index - 1].cycle.id) > 0 && (
                          <Button
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              setAmountInputs((current) => ({
                                ...current,
                                [cycle.id]: current[drafts[index - 1].cycle.id],
                              }))
                            }
                          >
                            Copiar repasse anterior
                          </Button>
                        )}
                    </label>
                  ) : (
                    <span className="font-medium">{money.format(serviceTotal)} a receber</span>
                  )}
                </div>
              ))}
            </div>
            <p className="rounded-md bg-muted p-3 text-sm font-medium" aria-live="polite">
              {drafts.length} BM(s) ·{" "}
              {money.format(values.reduce((total, row) => total + row.expected_amount, 0))} a
              receber
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={finish.isPending}
                onClick={() => setBatchOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!valid || busy}>
                {finish.isPending ? "Finalizando…" : "Confirmar finalização"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RecurringBulletinsPanel({
  clients,
  onOpenCycle,
}: {
  clients: readonly { id: string; name: string }[];
  onOpenCycle: OpenCycle;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["billing-v2-recurring-bulletins", user?.id];
  const [client, setClient] = useState("all");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const plans = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_v2_recurring_bulletins")
        .select(
          "id,source_number,client_id,first_on,next_on,stopped_at,repetitions,generated_count,last_cycle_number,last_error,created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data as Plan[];
    },
  });
  const stop = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("stop_recurring_billing_bulletin", { target_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      toast.success("Recorrência interrompida.");
    },
    onError: (error) => toast.error(error.message),
  });
  const planStatus = (plan: Plan) =>
    plan.stopped_at ? "Interrompida" : plan.next_on ? "Programada" : "Geração concluída";
  const filtered = (plans.data || []).filter(
    (plan) =>
      (client === "all" || plan.client_id === client) &&
      (status === "all" || planStatus(plan) === status),
  );
  const clientIds = new Set(plans.data?.map((plan) => plan.client_id));
  const selectClass = "h-10 rounded-md border bg-background px-3 text-sm";
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-semibold">BMs recorrentes</h2>
        <p className="text-sm text-muted-foreground">
          Confira as séries já programadas. Para criar uma série, abra o BM que será usado como
          modelo.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-sm">
          Cliente
          <select
            className={selectClass}
            value={client}
            onChange={(event) => setClient(event.target.value)}
          >
            <option value="all">Todos os clientes</option>
            {clients
              .filter((item) => clientIds.has(item.id))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Situação da série
          <select
            className={selectClass}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">Todas</option>
            {["Programada", "Geração concluída", "Interrompida"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      {plans.isLoading && (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando séries…
        </p>
      )}
      {plans.isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar as séries.
        </p>
      )}
      {plans.isSuccess && !filtered.length && (
        <p className="text-sm text-muted-foreground">Nenhuma série encontrada.</p>
      )}
      {filtered.map((plan) => (
        <div key={plan.id} className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">
                {clients.find((item) => item.id === plan.client_id)?.name || "Cliente"} · Modelo{" "}
                {bulletinNumber(plan.source_number)}
              </p>
              <p className="text-xs text-muted-foreground">
                {planStatus(plan)} · {plan.generated_count} de {plan.repetitions} gerados
                {plan.next_on && ` · Próxima geração em ${date(plan.next_on)}`}
              </p>
            </div>
            <div className="flex gap-2">
              {plan.next_on && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={stop.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Interromper os próximos BMs desta série? Os BMs já gerados serão mantidos.",
                      )
                    )
                      stop.mutate(plan.id);
                  }}
                >
                  Interromper
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                aria-expanded={expanded === plan.id}
                onClick={() => setExpanded(expanded === plan.id ? null : plan.id)}
              >
                {expanded === plan.id ? "Recolher sequência" : "Ver sequência"}
              </Button>
            </div>
          </div>
          {plan.last_error && (
            <p role="status" className="text-sm text-destructive">
              {plan.last_error}
            </p>
          )}
          {expanded === plan.id && <Sequence plan={plan} onOpenCycle={onOpenCycle} />}
        </div>
      ))}
    </Card>
  );
}
