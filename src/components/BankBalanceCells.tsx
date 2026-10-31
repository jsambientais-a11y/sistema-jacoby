import { useFinanceLedger } from "@/hooks/use-finance-ledger";
import { bankMonthlyBalance, type BankBalance } from "@/lib/finance-reports";
import { localFinanceToday } from "@/lib/enterprise-finance";
const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v / 100);
export function BankBalanceCells({ bank }: { bank: BankBalance }) {
  const ledger = useFinanceLedger();
  const today = localFinanceToday();
  const b = bankMonthlyBalance(bank, ledger.rows, today.slice(0, 7), today);
  return (
    <div className="py-2 text-sm">
      {bank.opening_balance_cents == null ? (
        <span className="text-amber-700">Saldo a definir</span>
      ) : (
        <>
          <span className="block font-semibold">
            Saldo calculado:{" "}
            {ledger.isLoading ? "Carregando…" : ledger.error ? "Indisponível" : money(b.current!)}
          </span>
          <span className="block text-xs text-muted-foreground">
            Inicial: {money(Number(bank.opening_balance_cents))} em{" "}
            {bank.opening_on?.split("-").reverse().join("/")}
          </span>
          <span className="block text-xs text-muted-foreground">
            Considera somente baixas vinculadas a esta conta desde a referência.
          </span>
        </>
      )}
    </div>
  );
}
