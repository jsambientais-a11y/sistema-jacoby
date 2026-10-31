import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
export type ReceiptDetails = {
  entry_id: string;
  cycle_id: string;
  cost_center_id: string | null;
  bank_account_id: string | null;
  updated_at: string;
};
const table = () => supabase.from("finance_receipt_details" as any) as any;
export function useReceiptDetails() {
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const key = ["finance-receipt-details", user?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!user && hasPermission("finance"),
    queryFn: async () => {
      const all: ReceiptDetails[] = [];
      for (let offset = 0; ; offset += 500) {
        const r = await table()
          .select("*")
          .order("entry_id")
          .range(offset, offset + 499);
        if (r.error) throw r.error;
        all.push(...r.data);
        if (r.data.length < 500) break;
      }
      return all;
    },
  });
  const save = useMutation({
    mutationFn: async ({
      old,
      values,
    }: {
      old?: ReceiptDetails;
      values: Omit<ReceiptDetails, "updated_at">;
    }) => {
      const r = old
        ? await table()
            .update(values)
            .eq("entry_id", old.entry_id)
            .eq("updated_at", old.updated_at)
            .select("entry_id")
        : await table().insert(values).select("entry_id");
      if (r.error)
        throw new Error(
          r.error.code === "23505"
            ? "Este recebimento foi classificado em outra sessão. Atualize antes de editar."
            : r.error.message,
        );
      if (!r.data?.length) throw new Error("Este recebimento mudou. Atualize antes de editar.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  return { ...query, save };
}
