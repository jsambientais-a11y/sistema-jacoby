import { Repeat2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { RECURRENCE_FREQUENCIES, type InlineRecurrence } from "@/lib/finance-recurrence";
export function InlineRecurrenceFields({
  value,
  onChange,
  existing = false,
  card = false,
  start,
  disabled = false,
}: {
  value: InlineRecurrence;
  onChange: (v: InlineRecurrence) => void;
  existing?: boolean;
  card?: boolean;
  start: string;
  disabled?: boolean;
}) {
  const locked = existing && value.scope === "one";
  return (
    <section
      className="space-y-3 rounded-lg border bg-muted/20 p-3"
      aria-label="Repetição da despesa"
    >
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...value,
              enabled: e.target.checked,
              scope: existing ? "future" : value.scope,
            })
          }
        />
        <Repeat2 className="h-4 w-4 text-primary" />
        Repetir esta despesa
      </label>
      {existing && value.enabled && (
        <label className="block space-y-1 text-sm">
          <span>Aplicar alterações em</span>
          <select
            className="h-10 w-full rounded-md border bg-background px-3"
            disabled={disabled}
            value={value.scope}
            onChange={(e) => onChange({ ...value, scope: e.target.value as "one" | "future" })}
          >
            <option value="one">Somente este lançamento</option>
            <option value="future">Este e os próximos ainda não pagos</option>
          </select>
        </label>
      )}
      {value.enabled && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span>Frequência</span>
            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              disabled={disabled || existing}
              value={value.frequency}
              onChange={(e) =>
                onChange({ ...value, frequency: e.target.value as InlineRecurrence["frequency"] })
              }
            >
              {Object.entries(RECURRENCE_FREQUENCIES)
                .filter(([key]) => !card || !["weekly", "fortnightly"].includes(key))
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>Repetir até (opcional)</span>
            <Input
              type="date"
              disabled={disabled || locked}
              min={start}
              value={value.end_on}
              onChange={(e) => onChange({ ...value, end_on: e.target.value })}
            />
          </label>
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {existing && !value.enabled
          ? "Este lançamento será mantido e as próximas repetições ainda não pagas serão interrompidas. Pagamentos anteriores permanecem."
          : value.enabled
            ? card
              ? "Cada repetição será uma compra de uma parcela nas próximas faturas. O total continua aparecendo uma única vez em Contas a pagar. Não use repetição para uma compra parcelada."
              : "O lançamento atual será mantido. As repetições são previstas a partir de hoje, sem duplicar esta conta. Sem término, a previsão dos próximos 12 meses é renovada automaticamente."
            : "Ative para despesas como aluguel, internet, mensalidades ou assinaturas."}
      </p>
      {existing && value.enabled && (
        <p className="text-xs text-muted-foreground">
          Contas pagas e ajustes individuais são preservados ao alterar as próximas. Para mudar a
          frequência, interrompa esta repetição e crie outra despesa.
        </p>
      )}
    </section>
  );
}
