import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { mapEditConditions, mapEditPayload, type MapEditTarget } from "@/lib/residue-map-edit";

export function ResidueMapEditor({
  target,
  fullScreen = false,
  onClose,
}: {
  target: MapEditTarget;
  fullScreen?: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      target.fields.map((field) => [
        field.key,
        field.kind === "boolean"
          ? Boolean(target.record[field.key])
          : String(target.record[field.key] ?? ""),
      ]),
    ),
  );
  const [review, setReview] = useState(false);
  const [validation, setValidation] = useState("");
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const save = useMutation({
    mutationFn: async () => {
      if (!Object.keys(payload).length) throw new Error("Nenhuma alteração para salvar.");
      let request = (supabase.from(target.table as any) as any).update(payload);
      // Compare-and-swap: keep the original ID, owner and snapshot when updating.
      for (const [key, old] of mapEditConditions(target)) {
        request = old === null ? request.is(key, null) : request.eq(key, old);
      }
      const response = await request
        .select(`id,${target.fields.map((field) => field.key).join(",")}`)
        .maybeSingle();
      if (response.error) throw response.error;
      if (!response.data)
        throw new Error(
          "O cadastro mudou ou sua conta não pode editá-lo. Atualize o mapa antes de tentar novamente.",
        );
      return response.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({
        predicate: (query) =>
          /residue|waste-|billing-|outsourced-|client-branches/.test(String(query.queryKey[0])),
      });
      toast.success("Alterações salvas. O mapa e os cadastros relacionados foram atualizados.");
      onClose();
    },
  });
  function prepareReview() {
    try {
      const next = mapEditPayload(target, draft);
      if (!Object.keys(next).length) throw new Error("Nenhum dado foi alterado.");
      setPayload(next);
      setValidation("");
      setReview(true);
    } catch (error) {
      setValidation((error as Error).message);
    }
  }
  const display = (value: unknown) =>
    value === null || value === undefined || value === ""
      ? "Automático / geral"
      : typeof value === "boolean"
        ? value
          ? "Sim"
          : "Não"
        : String(value);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent
        className={
          fullScreen
            ? "h-[100dvh] w-screen max-w-none overflow-y-auto rounded-none sm:max-w-none"
            : "max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        }
      >
        <DialogHeader>
          <DialogTitle>{review ? "Revisar alterações" : target.title}</DialogTitle>
          <DialogDescription>{target.context}</DialogDescription>
        </DialogHeader>
        {!review ? (
          <div className="space-y-4">
            {target.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`map-edit-${field.key}`}>{field.label}</Label>
                {field.kind === "boolean" ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`map-edit-${field.key}`}
                      checked={Boolean(draft[field.key])}
                      onCheckedChange={(value) =>
                        setDraft({ ...draft, [field.key]: value === true })
                      }
                    />
                    <span className="text-sm">{draft[field.key] ? "Ativo" : "Desativado"}</span>
                  </div>
                ) : field.kind === "select" ? (
                  <select
                    id={`map-edit-${field.key}`}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={String(draft[field.key])}
                    onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                  >
                    {field.nullable && (
                      <option value="">{field.emptyLabel || "Não definido"}</option>
                    )}
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={`map-edit-${field.key}`}
                    type={field.kind === "number" ? "number" : "text"}
                    min={field.kind === "number" ? 0 : undefined}
                    max={field.max}
                    step={field.kind === "number" ? "0.0001" : undefined}
                    placeholder={field.nullable ? "Automático" : undefined}
                    value={String(draft[field.key])}
                    onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">Campo</th>
                    <th className="p-2">Antes</th>
                    <th className="p-2">Depois</th>
                  </tr>
                </thead>
                <tbody>
                  {target.fields
                    .filter((field) => field.key in payload)
                    .map((field) => (
                      <tr key={field.key} className="border-b">
                        <td className="p-2 font-medium">{field.label}</td>
                        <td className="p-2 text-muted-foreground">
                          {display(target.record[field.key])}
                        </td>
                        <td className="p-2">
                          {field.kind === "select"
                            ? field.options?.find((item) => item.value === payload[field.key])
                                ?.label ||
                              field.emptyLabel ||
                              "Não definido"
                            : display(payload[field.key])}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
              <p className="font-semibold">Onde isso pode impactar</p>
              <ul className="mt-2 space-y-2">
                {target.impact.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              A edição preserva o ID. Esta tela local usa o banco configurado para a Jacoby: salvar
              grava a alteração no cadastro real.
            </p>
          </div>
        )}
        {(validation || save.error) && (
          <p role="alert" className="text-sm text-destructive">
            {validation || (save.error as Error).message}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={review ? () => setReview(false) : onClose}
            disabled={save.isPending}
          >
            {review ? "Voltar à edição" : "Cancelar"}
          </Button>
          {review ? (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          ) : (
            <Button onClick={prepareReview}>Revisar impacto</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
