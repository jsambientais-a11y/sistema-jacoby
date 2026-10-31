import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { FinanceAccount } from "@/lib/enterprise-finance";
const table = () => supabase.from("enterprise_finance_accounts" as any) as any;
export function useFinanceAccounts() {
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const key = ["enterprise-finance-accounts", user?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!user && hasPermission("finance"),
    queryFn: async () => {
      const all: FinanceAccount[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await table()
          .select("*")
          .order("due_on")
          .order("id")
          .range(offset, offset + 499);
        if (result.error) throw result.error;
        all.push(...result.data);
        if (result.data.length < 500) break;
      }
      return all;
    },
  });
  const save = useMutation({
    mutationFn: async ({
      old,
      values,
    }: {
      old?: FinanceAccount;
      values: Partial<FinanceAccount>;
    }) => {
      const result = old
        ? await table()
            .update(values)
            .eq("id", old.id)
            .eq("updated_at", old.updated_at)
            .select("id")
        : await table().insert(values).select("id");
      if (result.error) throw result.error;
      if (!result.data?.length)
        throw new Error(
          "Este lançamento mudou em outra sessão. Atualize e revise antes de salvar.",
        );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  return { ...query, save };
}
