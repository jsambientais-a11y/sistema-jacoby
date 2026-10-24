/** Filtro de período (todos, por mês ou intervalo de datas) usado no Financeiro e no Faturamento. */
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { shiftMonth, type Period } from "@/lib/receivables";

const currentMonth = () => new Date().toISOString().slice(0, 7);
// "outubro de 2026" → "Outubro de 2026"
export const monthName = (month: string) => {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export function PeriodFilter({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.kind}
        onValueChange={(kind) =>
          onChange(kind === "month" ? { kind: "month", month: currentMonth() } : kind === "range" ? { kind: "range", from: `${currentMonth()}-01`, to: "" } : { kind: "all" })
        }
      >
        <SelectTrigger className={`h-9 w-48 ${value.kind !== "all" ? "border-primary/50 bg-accent/60 font-medium text-accent-foreground" : ""}`} aria-label="Período">
          <CalendarRange className="h-4 w-4 opacity-70" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os períodos</SelectItem>
          <SelectItem value="month">Por mês</SelectItem>
          <SelectItem value="range">Período personalizado</SelectItem>
        </SelectContent>
      </Select>
      {value.kind === "month" && (
        <div className="flex items-center gap-1 rounded-md border bg-card p-0.5">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Mês anterior" onClick={() => onChange({ kind: "month", month: shiftMonth(value.month, -1) })}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">{monthName(value.month)}</span>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Próximo mês" onClick={() => onChange({ kind: "month", month: shiftMonth(value.month, 1) })}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      {value.kind === "range" && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Input type="date" className="h-9 w-40" value={value.from} max={value.to || undefined} aria-label="Data inicial" onChange={(event) => onChange({ ...value, from: event.target.value })} />
          <span>até</span>
          <Input type="date" className="h-9 w-40" value={value.to} min={value.from || undefined} aria-label="Data final" onChange={(event) => onChange({ ...value, to: event.target.value })} />
        </div>
      )}
    </div>
  );
}
