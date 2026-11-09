import { useState } from "react";
import type { BillingFlowEntry, BillingFlowSaveInput } from "./BillingFlowPreview";
import {
  commonBillingFields,
  createBillingRow,
  prepareBillingGroupSave,
  billingSavedFields,
  type BillingRowDraft,
  type SharedBillingKey,
} from "@/lib/billing-group-editor";
import { billingCommission } from "@/lib/billing-agreement";
import { billingEntryHasCharge } from "@/lib/billing-flow-navigation";
import { BILLING_DATE_RULES } from "@/lib/billing-dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const categories = {
  rental: "Locação",
  exchange: "Troca",
  treatment: "Tratamento",
  service: "Serviços",
};
const fieldLabels: Record<SharedBillingKey, string> = {
  invoice_number: "Número da nota",
  invoice_issued_on: "Emissão da nota",
  invoice_due_on: "Vencimento da nota",
  expected_basis: "Regra da previsão",
  expected_on: "Previsão de recebimento",
  received_on: "Data em que recebeu",
  notes: "Observações",
};
export function BillingBulletinDraft({
  entries,
  isSaving,
  onSave,
}: {
  entries: BillingFlowEntry[];
  isSaving: boolean;
  onSave: (inputs: BillingFlowSaveInput[]) => Promise<void>;
}) {
  const groups = new Map<string, BillingFlowEntry[]>();
  for (const entry of entries) {
    const key = entry.companyId || "jacoby";
    groups.set(key, [...(groups.get(key) || []), entry]);
  }
  return (
    <div className="divide-y">
      {[...groups].map(([key, group]) => (
        <BillingIssuerDraft
          key={`${key}:${group.map((entry) => `${entry.id}:${entry.tracking?.updated_at || "new"}`).join("|")}`}
          entries={group}
          isSaving={isSaving}
          onSave={onSave}
        />
      ))}
    </div>
  );
}
function BillingIssuerDraft({
  entries,
  isSaving,
  onSave,
}: {
  entries: BillingFlowEntry[];
  isSaving: boolean;
  onSave: (inputs: BillingFlowSaveInput[]) => Promise<void>;
}) {
  const [initial] = useState(() => {
    const charged = entries.filter(billingEntryHasCharge);
    return commonBillingFields(charged.length ? charged : entries);
  });
  const [fields, setFields] = useState(initial.fields);
  const [changed, setChanged] = useState<Set<SharedBillingKey>>(new Set());
  const [rows, setRows] = useState<Record<string, BillingRowDraft>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.id, createBillingRow(entry)])),
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const updateShared = (key: SharedBillingKey, value: string) => {
    setFields((old) => ({ ...old, [key]: value }));
    setChanged((old) => new Set([...old, key]));
    setNotice("");
  };
  const updateRow = (id: string, update: Partial<BillingRowDraft>) => {
    setRows((old) => ({ ...old, [id]: { ...old[id], ...update } }));
    setNotice("");
  };
  const commission = (row: BillingRowDraft) =>
    billingCommission(
      row.rule,
      row.value.trim() ? Number(row.value.replace(",", ".")) : NaN,
      row.net.trim() ? Number(row.net.replace(",", ".")) : null,
    );
  const total =
    Object.values(rows)
      .filter((row) => row.selected)
      .reduce((sum, row) => sum + Math.round((commission(row) || 0) * 100), 0) / 100;
  const incomplete = Object.values(rows).some((row) => row.selected && commission(row) == null);
  const save = async () => {
    setError("");
    setNotice("");
    try {
      const payload = prepareBillingGroupSave(
        entries,
        rows,
        fields,
        changed,
        new Date().toISOString().slice(0, 10),
      );
      if (!payload.length) {
        setNotice("Nenhuma alteração para salvar nas linhas selecionadas.");
        return;
      }
      await onSave(payload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível salvar. Nenhuma linha foi gravada.",
      );
    }
  };
  const selected = Object.values(rows).filter((row) => row.selected).length;
  return (
    <section
      className="space-y-4 p-4 sm:p-5"
      aria-label={`Conferência em linhas · ${entries[0]?.company}`}
    >
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="font-semibold">{entries[0]?.company}</h3>
          <p className="text-xs text-muted-foreground">
            Defina a comissão e o líquido de cada categoria. Os dados comuns abaixo valem somente
            para as linhas marcadas deste emissor.
          </p>
        </div>
        <p className="text-sm">
          {incomplete ? "Total parcial (há valores a informar)" : "Total da conferência"}:{" "}
          <strong>{money.format(total)}</strong>
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Salvar</th>
              <th className="p-3">Categoria / cobrança</th>
              <th className="p-3">Base do BM</th>
              <th className="p-3">Tipo de cálculo</th>
              <th className="p-3">Valor / percentual</th>
              <th className="p-3">Valor da NF nesta categoria</th>
              <th className="p-3 text-right">Comissão / receita</th>
            </tr>
          </thead>
          <tbody>
            {(Object.entries(categories) as [BillingFlowEntry["category"], string][]).flatMap(
              ([category, label]) => {
                const matching = entries.filter((entry) => entry.category === category);
                if (!matching.length)
                  return [
                    <tr key={category} className="border-t text-muted-foreground">
                      <td className="p-3">—</td>
                      <td className="p-3">{label}</td>
                      <td colSpan={5} className="p-3 text-xs">
                        Sem lançamento nesta categoria · não gera pendência
                      </td>
                    </tr>,
                  ];
                return matching.map((entry) => {
                  const row = rows[entry.id];
                  const amount = commission(row);
                  return (
                    <tr key={entry.id} className="border-t">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          disabled={isSaving}
                          aria-label={`Salvar ${label} · ${entry.company}`}
                          onChange={(event) =>
                            updateRow(entry.id, { selected: event.target.checked })
                          }
                          className="h-4 w-4 accent-primary"
                        />
                      </td>
                      <td className="max-w-56 p-3">
                        <p className="font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{entry.description}</p>
                        {!billingEntryHasCharge(entry) && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Sem cobrança · não gera pendência
                          </p>
                        )}
                        {entry.pendingService && (
                          <p className="mt-1 text-xs text-amber-700">
                            Nota anexada · valor do serviço a conferir
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap p-3">{money.format(entry.baseAmount)}</td>
                      <td className="min-w-44 p-3">
                        <Select
                          value={row.rule}
                          onValueChange={(value) =>
                            updateRow(entry.id, { rule: value as "fixed" | "percent" })
                          }
                          disabled={isSaving}
                        >
                          <SelectTrigger aria-label={`Tipo de cálculo de ${label}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">Valor acordado (R$)</SelectItem>
                            <SelectItem value="percent">Percentual (%)</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3">
                        <Input
                          type="number"
                          min="0"
                          max={row.rule === "percent" ? 100 : undefined}
                          step="0.01"
                          value={row.value}
                          disabled={isSaving}
                          onChange={(event) => updateRow(entry.id, { value: event.target.value })}
                          aria-label={`Valor ou percentual de ${label}`}
                          className="min-w-24"
                        />
                      </td>
                      <td className="p-3">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.net}
                          disabled={isSaving}
                          onChange={(event) => updateRow(entry.id, { net: event.target.value })}
                          aria-label={`Valor da NF de ${label}`}
                          placeholder={
                            row.rule === "percent" ? "Líquido · obrigatório" : "Opcional"
                          }
                          className="min-w-40"
                        />
                      </td>
                      <td className="whitespace-nowrap p-3 text-right font-medium">
                        {amount == null ? "A informar" : money.format(amount)}
                      </td>
                    </tr>
                  );
                });
              },
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Para percentual, informe manualmente o líquido correspondente a cada categoria, sem repetir
        o total da NF em todas as linhas. Nos acordos em reais, o valor da NF é opcional e não
        altera a comissão.
      </p>
      {initial.mixed.size > 0 && (
        <details className="rounded-lg border border-amber-200 bg-amber-50/30 p-3 text-xs dark:bg-amber-950/20">
          <summary className="cursor-pointer font-medium">
            Há dados antigos diferentes entre as categorias — serão preservados
          </summary>
          <p className="mt-2">
            Só os campos comuns que você editar serão substituídos nas linhas marcadas. Campos
            deixados como estão mantêm os dados de cada lançamento.
          </p>
          {entries.map((entry) => (
            <div key={entry.id} className="mt-2">
              <strong>{categories[entry.category]}:</strong>{" "}
              {[...initial.mixed]
                .map(
                  (key) =>
                    `${fieldLabels[key]}: ${key === "expected_basis" ? BILLING_DATE_RULES[billingSavedFields(entry)[key] as keyof typeof BILLING_DATE_RULES] : billingSavedFields(entry)[key] || "—"}`,
                )
                .join(" · ")}
            </div>
          ))}
        </details>
      )}
      <div className="space-y-3 rounded-lg border bg-muted/15 p-4">
        <h4 className="font-semibold">Nota fiscal e recebimento</h4>
        <p className="text-xs text-muted-foreground">
          Preencha uma vez para as {selected} linha(s) marcadas. Emissores diferentes mantêm notas
          separadas. O recebimento só será registrado se você informar a data.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["invoice_number", "invoice_issued_on", "invoice_due_on"] as const).map((key) => (
            <Label key={key} className="space-y-1.5 text-xs">
              {fieldLabels[key]}
              <Input
                type={key === "invoice_number" ? "text" : "date"}
                value={fields[key]}
                disabled={isSaving}
                aria-label={`${fieldLabels[key]} comum · ${entries[0]?.company}`}
                onChange={(event) => updateShared(key, event.target.value)}
              />
              {initial.mixed.has(key) && !changed.has(key) && (
                <span className="block text-xs font-normal text-amber-700">
                  Diferentes nas linhas · mantidos
                </span>
              )}
            </Label>
          ))}
          <Label className="space-y-1.5 text-xs">
            Regra da previsão
            <Select
              value={fields.expected_basis || "keep"}
              disabled={isSaving}
              onValueChange={(value) => {
                if (value !== "keep") updateShared("expected_basis", value);
              }}
            >
              <SelectTrigger aria-label={`Regra da previsão comum · ${entries[0]?.company}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {initial.mixed.has("expected_basis") && (
                  <SelectItem value="keep">Manter regras de cada linha</SelectItem>
                )}
                {Object.entries(BILLING_DATE_RULES).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
          <Label className="space-y-1.5 text-xs">
            Previsão manual de recebimento
            <Input
              type="date"
              value={fields.expected_on}
              disabled={isSaving || fields.expected_basis !== "manual"}
              aria-label={`Previsão manual comum · ${entries[0]?.company}`}
              onChange={(event) => updateShared("expected_on", event.target.value)}
            />
            <span className="block text-xs font-normal text-muted-foreground">
              Escolha “Data definida manualmente” para ajustar. As previsões já salvas são mantidas
              se você não mudar a regra ou sua data de referência.
            </span>
          </Label>
          <Label className="space-y-1.5 text-xs">
            Data em que recebeu
            <Input
              type="date"
              value={fields.received_on}
              disabled={isSaving}
              aria-label={`Recebimento comum · ${entries[0]?.company}`}
              onChange={(event) => updateShared("received_on", event.target.value)}
            />
            {initial.mixed.has("received_on") && !changed.has("received_on") && (
              <span className="block text-xs font-normal text-amber-700">
                Diferentes nas linhas · mantidos
              </span>
            )}
          </Label>
        </div>
        <Label className="block space-y-1.5 text-xs">
          Observações comuns
          <Textarea
            value={fields.notes}
            disabled={isSaving}
            placeholder={
              initial.mixed.has("notes")
                ? "Observações diferentes serão mantidas se você não editar este campo"
                : "Opcional"
            }
            onChange={(event) => updateShared("notes", event.target.value)}
          />
        </Label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="button" disabled={isSaving || !selected} onClick={() => void save()}>
          {isSaving ? "Salvando…" : "Salvar conferência do BM"}
        </Button>
      </div>
    </section>
  );
}
