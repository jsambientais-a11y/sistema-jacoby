import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useCreditCards } from "@/hooks/use-credit-cards";
import { aggregateCardInvoices } from "@/lib/credit-cards";
import { useFinanceAccounts } from "@/hooks/use-finance-accounts";
import { JULIANA_ACCOUNT_ID, overduePayables } from "@/lib/finance-access";
import { localFinanceToday } from "@/lib/enterprise-finance";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
// Memória desta abertura do documento. Recarregar/abrir uma aba começa outra
// verificação; navegar entre telas ou renovar o token não repete o aviso.
const checkedOpenings = new Set<string>();
export function OverduePayablesAlert() {
  const { user, hasPermission } = useAuth();
  if (user?.id !== JULIANA_ACCOUNT_ID || !hasPermission("finance")) return null;
  return <JulianaPayablesAlert openingKey={`${user.id}:${user.last_sign_in_at || "session"}`} />;
}
function JulianaPayablesAlert({ openingKey }: { openingKey: string }) {
  const accounts = useFinanceAccounts();
  const credit = useCreditCards();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const today = localFinanceToday();
  const payableItems = [
    ...(accounts.data || []).filter((a) => !a.credit_card_id),
    ...aggregateCardInvoices(accounts.data || [], credit.cards.data || []).map((r) => ({
      id: r.id,
      kind: r.kind,
      description: r.description,
      counterparty: r.counterparty,
      amount_cents: r.amountCents - (r.paidCents || 0),
      due_on: r.dueOn!,
      settled_on: r.settledOn,
      deleted_at: null,
    })),
  ];
  const overdue = overduePayables(payableItems, today);
  const loadError = accounts.error || credit.cards.error;
  const total = overdue.reduce((s, a) => s + Number(a.amount_cents), 0);
  useEffect(() => {
    if (accounts.isLoading || credit.cards.isLoading || checkedOpenings.has(openingKey)) return;
    checkedOpenings.add(openingKey);
    setOpen(!!accounts.error || !!credit.cards.error || overdue.length > 0);
  }, [
    openingKey,
    accounts.isLoading,
    accounts.error,
    credit.cards.isLoading,
    credit.cards.error,
    overdue.length,
  ]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogTitle>
          {loadError
            ? "Não foi possível conferir as contas a pagar"
            : `${overdue.length} conta(s) a pagar em atraso`}
        </DialogTitle>
        <DialogDescription>
          {loadError
            ? "Tente novamente para verificar se há contas vencidas."
            : "Juliana, estas contas estão vencidas e ainda não receberam baixa."}
        </DialogDescription>
        {!loadError && (
          <>
            <strong className="text-2xl text-destructive">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                total / 100,
              )}
            </strong>
            <ul className="divide-y rounded-lg border px-3">
              {overdue.slice(0, 8).map((a) => (
                <li className="flex items-start justify-between gap-4 py-3 text-sm" key={a.id}>
                  <span>
                    <b className="block">{a.description}</b>
                    <span className="text-muted-foreground">
                      Venceu em {a.due_on.split("-").reverse().join("/")}
                      {a.counterparty ? ` · ${a.counterparty}` : ""}
                    </span>
                  </span>
                  <span className="whitespace-nowrap">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                      Number(a.amount_cents) / 100,
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {overdue.length > 8 && (
              <p className="text-xs text-muted-foreground">
                E mais {overdue.length - 8} conta(s). Abra Contas a pagar para conferir todas.
              </p>
            )}
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
          {loadError ? (
            <Button
              disabled={accounts.isFetching}
              onClick={async () => {
                const result = await accounts.refetch();
                setOpen(!!result.error || overduePayables(result.data || [], today).length > 0);
              }}
            >
              Tentar novamente
            </Button>
          ) : (
            <Button
              onClick={() => {
                setOpen(false);
                void navigate({
                  to: "/contas-a-receber",
                  search: { view: "payable", status: "overdue" },
                });
              }}
            >
              Ver contas atrasadas
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
