import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import type { FinanceRecurrence } from "@/lib/finance-recurrence";
export function useFinanceRecurrences() {
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const key = ["finance-recurrences", user?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!user && hasPermission("finance"),
    queryFn: async () => {
      const all: FinanceRecurrence[] = [];
      for (let offset = 0; ; offset += 500) {
        const r = await (supabase.from("finance_recurring_expenses" as any) as any)
          .select("*")
          .order("description")
          .order("id")
          .range(offset, offset + 499);
        if (r.error) throw new Error(r.error.message);
        all.push(...r.data);
        if (r.data.length < 500) break;
      }
      return all;
    },
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: key }),
      qc.invalidateQueries({ queryKey: ["enterprise-finance-accounts"] }),
    ]);
  const save = useMutation({
    mutationFn: async ({
      old,
      values,
      effective,
    }: {
      old?: FinanceRecurrence;
      values: Record<string, unknown>;
      effective: string;
    }) => {
      const r = await (supabase.rpc as any)("save_finance_recurrence", {
        payload: values,
        target_id: old?.id || null,
        expected_updated_at: old?.updated_at || null,
        effective_on: effective,
      });
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: refresh,
  });
  const setActive = useMutation({
    mutationFn: async ({ rule, active }: { rule: FinanceRecurrence; active: boolean }) => {
      const r = await (supabase.rpc as any)("set_finance_recurrence_active", {
        target_id: rule.id,
        expected_updated_at: rule.updated_at,
        is_active: active,
      });
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: refresh,
  });
  return { ...query, save, setActive };
}
