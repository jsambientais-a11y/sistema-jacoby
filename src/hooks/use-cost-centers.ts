import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
export type CostCenter = {
  id: string;
  name: string;
  kind: "income" | "expense" | "both";
  active: boolean;
  updated_at: string;
  opening_balance_cents?: number | null;
  opening_on?: string | null;
};
export const compatibleCenter = (center: CostCenter, kind: "payable" | "receivable") =>
  center.kind === "both" || center.kind === (kind === "payable" ? "expense" : "income");

export function useCostCenters() {
  return useFinanceRegistry("finance_cost_centers");
}
export function useBanks() {
  return useFinanceRegistry("finance_bank_accounts");
}
function useFinanceRegistry(tableName: string) {
  const table = () => supabase.from(tableName as any) as any;
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const key = [tableName, user?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!user && hasPermission("finance"),
    queryFn: async () => {
      const all: CostCenter[] = [];
      for (let offset = 0; ; offset += 500) {
        const r = await table()
          .select("*")
          .order("name")
          .order("id")
          .range(offset, offset + 499);
        if (r.error) throw r.error;
        all.push(...r.data);
        if (r.data.length < 500) break;
      }
      return all;
    },
  });
  const save = useMutation({
    mutationFn: async ({ old, values }: { old?: CostCenter; values: Partial<CostCenter> }) => {
      const r = old
        ? await table()
            .update(values)
            .eq("id", old.id)
            .eq("updated_at", old.updated_at)
            .select("id")
        : await table().insert(values).select("id");
      if (r.error)
        throw new Error(
          r.error.code === "23505" ? "Já existe um cadastro com esse nome." : r.error.message,
        );
      if (!r.data?.length)
        throw new Error("Este cadastro mudou em outra sessão. Atualize antes de salvar.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  return { ...query, save };
}
