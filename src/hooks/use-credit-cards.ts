import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import type { CreditCard, CardPurchase } from "@/lib/credit-cards";
const table = (name: string) => supabase.from(name as any) as any;
export function useCreditCards() {
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user && hasPermission("finance");
  const cards = useQuery({
    queryKey: ["finance-credit-cards", user?.id],
    enabled,
    queryFn: () => readAll<CreditCard>("finance_credit_cards"),
  });
  const purchases = useQuery({
    queryKey: ["finance-card-purchases", user?.id],
    enabled,
    queryFn: () => readAll<CardPurchase>("finance_card_purchases"),
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["finance-credit-cards"] }),
      qc.invalidateQueries({ queryKey: ["finance-card-purchases"] }),
      qc.invalidateQueries({ queryKey: ["enterprise-finance-accounts"] }),
    ]);
  };
  const saveCard = useMutation({
    mutationFn: async ({ old, values }: { old?: CreditCard; values: Partial<CreditCard> }) => {
      const r = old
        ? await table("finance_credit_cards")
            .update(values)
            .eq("id", old.id)
            .eq("updated_at", old.updated_at)
            .select("id")
        : await table("finance_credit_cards").insert(values).select("id");
      if (r.error) throw new Error(r.error.message);
      if (!r.data?.length) throw new Error("O cartão mudou em outra sessão. Atualize.");
    },
    onSuccess: refresh,
  });
  const savePurchase = useMutation({
    mutationFn: async ({
      old,
      values,
    }: {
      old?: CardPurchase;
      values: Record<string, unknown>;
    }) => {
      const r = await (supabase.rpc as any)("save_card_purchase", {
        payload: values,
        target_purchase_id: old?.id || null,
        expected_updated_at: old?.updated_at || null,
      });
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: refresh,
  });
  const deletePurchase = useMutation({
    mutationFn: async ({ purchase, deleted }: { purchase: CardPurchase; deleted: boolean }) => {
      const r = await (supabase.rpc as any)("set_card_purchase_deleted", {
        target_purchase_id: purchase.id,
        expected_updated_at: purchase.updated_at,
        deleted,
      });
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: refresh,
  });
  const settle = useMutation({
    mutationFn: async ({
      cardId,
      month,
      date,
      bank,
      total,
    }: {
      cardId: string;
      month: string;
      date: string | null;
      bank: string | null;
      total: number;
    }) => {
      const r = await (supabase.rpc as any)("settle_card_invoice", {
        target_card_id: cardId,
        target_month: `${month}-01`,
        paid_on: date,
        payment_bank_id: bank,
        expected_total_cents: total,
      });
      if (r.error) throw new Error(r.error.message);
    },
    onSuccess: refresh,
  });
  const importInvoice = useMutation({
    mutationFn: async ({
      cardId,
      month,
      items,
    }: {
      cardId: string;
      month: string;
      items: Record<string, unknown>[];
    }) => {
      const r = await (supabase.rpc as any)("import_card_invoice", {
        target_card_id: cardId,
        target_month: `${month}-01`,
        items,
      });
      if (r.error) throw new Error(r.error.message);
      return r.data as { added: number; skipped: number };
    },
    onSuccess: refresh,
  });
  return { cards, purchases, saveCard, savePurchase, deletePurchase, settle, importInvoice };
}
async function readAll<T>(name: string) {
  const all: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await table(name)
      .select("*")
      .order("id")
      .range(offset, offset + 499);
    if (r.error) throw new Error(r.error.message);
    all.push(...r.data);
    if (r.data.length < 500) break;
  }
  return all;
}
