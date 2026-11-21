import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type FinanceSupplier = { id: string; name: string };

export function useFinanceSuppliers() {
  const { user, hasPermission } = useAuth();
  const client = useQueryClient();
  const queryKey = ["finance-suppliers", user?.id];
  const table = () => supabase.from("finance_suppliers");
  const query = useQuery({
    queryKey,
    enabled: !!user && hasPermission("finance"),
    queryFn: async () => {
      const suppliers: FinanceSupplier[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await table()
          .select("id, name")
          .order("name")
          .order("id")
          .range(offset, offset + 499);
        if (error) throw new Error(error.message);
        suppliers.push(...data);
        if (data.length < 500) return suppliers;
      }
    },
  });
  const save = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await table().insert({ name: name.trim() });
      if (error && error.code !== "23505") throw new Error(error.message);
      return error ? "existing" : "saved";
    },
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });
  return { ...query, save };
}
