import { cardMoney } from "@/lib/credit-cards";
export function FinanceComparison({
  income,
  expenses,
  loading = false,
  error = false,
}: {
  income: number;
  expenses: number;
  loading?: boolean;
  error?: boolean;
}) {
  const max = Math.max(income, expenses, 1),
    difference = income - expenses;
  return (
    <section
      className="rounded-xl border bg-card p-4"
      aria-label="Comparativo a receber versus a pagar"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          A receber <span className="mx-1 text-xs font-normal text-muted-foreground">VS</span> A
          pagar
        </h2>
        <p className="text-xs text-muted-foreground">
          Em aberto no período · faturas de cartão incluídas
        </p>
      </div>
      <div className="grid items-center gap-5 lg:grid-cols-[1fr_auto_1fr]">
        <div>
          <div className="mb-2 flex justify-between gap-3 text-sm">
            <span className="font-medium text-emerald-700 dark:text-emerald-300">A receber</span>
            <b>{error ? "Indisponível" : loading ? "Carregando…" : cardMoney(income)}</b>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: loading || error ? "0%" : `${(income / max) * 100}%` }}
            />
          </div>
        </div>
        <div className="rounded-lg bg-muted/50 px-5 py-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Diferença em aberto
          </p>
          <b className={difference < 0 ? "text-destructive" : "text-primary"}>
            {error ? "Indisponível" : loading ? "…" : cardMoney(difference)}
          </b>
        </div>
        <div>
          <div className="mb-2 flex justify-between gap-3 text-sm">
            <span className="font-medium text-orange-700 dark:text-orange-300">A pagar</span>
            <b>{error ? "Indisponível" : loading ? "Carregando…" : cardMoney(expenses)}</b>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-orange-500 transition-all"
              style={{ width: loading || error ? "0%" : `${(expenses / max) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
