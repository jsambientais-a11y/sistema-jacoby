import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CreditCard } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePayableAlerts } from "@/hooks/use-payable-alerts";
import { seesPayableAlerts } from "@/lib/finance-access";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// O aviso volta sozinho enquanto houver conta pendente. O horário fica no navegador
// para que recarregar a página ou abrir outra aba não burle nem duplique o intervalo.
const REMIND_AFTER_MS = 30 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 1000;
const storageKey = (userId: string) => `jacoby:payables-alert-dismissed:${userId}`;
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export function OverduePayablesAlert() {
  const { user, hasPermission } = useAuth();
  if (!user || !seesPayableAlerts(user.id, hasPermission("finance"))) return null;
  return <PayablesAlert userId={user.id} />;
}

function PayablesAlert({ userId }: { userId: string }) {
  const alerts = usePayableAlerts();
  const { urgent, overdueCount, dueTodayCount, totalCents, today, error, isLoading } = alerts;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pending = urgent.length > 0;
  useEffect(() => {
    if (isLoading) return;
    if (!pending && !error) {
      setOpen(false);
      return;
    }
    const check = () => {
      const dismissedAt = Number(localStorage.getItem(storageKey(userId)) || 0);
      if (Date.now() - dismissedAt >= REMIND_AFTER_MS) setOpen(true);
    };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [userId, isLoading, pending, error]);
  const dismiss = () => {
    localStorage.setItem(storageKey(userId), String(Date.now()));
    setOpen(false);
  };
  const seeAccounts = () => {
    dismiss();
    void navigate({ to: "/contas-a-pagar", search: { status: "urgent" } });
  };
  const summary = [
    overdueCount > 0 &&
      `${overdueCount} ${plural(overdueCount, "conta vencida", "contas vencidas")}`,
    dueTodayCount > 0 &&
      `${dueTodayCount} ${plural(dueTodayCount, "conta vence hoje", "contas vencem hoje")}`,
  ]
    .filter(Boolean)
    .join(" e ");
  return (
    <>
      {pending && (
        <div
          role="alert"
          className={`sticky top-12 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm font-semibold shadow-md md:top-[53px] ${overdueCount > 0 ? "bg-destructive text-destructive-foreground" : "bg-amber-400 text-amber-950"}`}
        >
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {summary} · {money(totalCents)}
            <span className="ml-2 font-normal">
              {urgent
                .slice(0, 3)
                .map((a) => a.description)
                .join(", ")}
              {urgent.length > 3 ? ` e mais ${urgent.length - 3}` : ""}
            </span>
          </span>
          <Button size="sm" variant="secondary" onClick={seeAccounts}>
            Ver contas
          </Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogTitle className="flex items-center gap-2 text-xl">
            {!error && <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />}
            {error ? "Não foi possível conferir as contas a pagar" : summary}
          </DialogTitle>
          <DialogDescription>
            {error
              ? "Tente novamente para verificar se há contas vencidas."
              : "Estas contas ainda não receberam baixa. Este aviso volta em 30 minutos enquanto continuarem pendentes."}
          </DialogDescription>
          {!error && (
            <>
              <strong className="text-2xl text-destructive">{money(totalCents)}</strong>
              <ul className="divide-y rounded-lg border px-3">
                {urgent.slice(0, 8).map((a) => (
                  <li className="flex items-start justify-between gap-4 py-3 text-sm" key={a.id}>
                    <span className="min-w-0">
                      <b className="flex items-center gap-1.5">
                        {a.id.startsWith("card:") && (
                          <CreditCard className="h-4 w-4 shrink-0 text-indigo-600" />
                        )}
                        {a.description}
                      </b>
                      <span
                        className={
                          a.due_on === today
                            ? "font-semibold text-amber-700 dark:text-amber-400"
                            : "font-semibold text-destructive"
                        }
                      >
                        {a.due_on === today
                          ? "Vence hoje"
                          : `Venceu em ${a.due_on.split("-").reverse().join("/")}`}
                      </span>
                      {a.counterparty && (
                        <span className="text-muted-foreground"> · {a.counterparty}</span>
                      )}
                    </span>
                    <span className="whitespace-nowrap font-semibold">
                      {money(Number(a.amount_cents))}
                    </span>
                  </li>
                ))}
              </ul>
              {urgent.length > 8 && (
                <p className="text-xs text-muted-foreground">
                  E mais {urgent.length - 8} conta(s). Abra Contas a pagar para conferir todas.
                </p>
              )}
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={dismiss}>
              {error ? "Fechar" : "Lembrar em 30 min"}
            </Button>
            {error ? (
              <Button disabled={alerts.isFetching} onClick={() => void alerts.refetch()}>
                Tentar novamente
              </Button>
            ) : (
              <Button onClick={seeAccounts}>Ver contas</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
