/** Vínculo opcional entre um recebível do Financeiro e uma tarefa da Gestão de Projetos. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const table = () => supabase.from("receivable_task_links" as any) as any;
const KEY = ["receivable-task-links"];

export function useReceivableTaskLinks() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await table().select("receivable_key,task_id");
      // Sem a tabela no banco, o vínculo fica indisponível e o resto da tela segue funcionando.
      if (error) return { available: false, byKey: new Map<string, string>() };
      return {
        available: true,
        byKey: new Map(((data || []) as { receivable_key: string; task_id: string }[]).map((row) => [row.receivable_key, row.task_id])),
      };
    },
  });
  const setLink = useMutation({
    mutationFn: async ({ key, taskId }: { key: string; taskId: string | null }) => {
      const { error } = taskId
        ? await table().upsert({ receivable_key: key, task_id: taskId }, { onConflict: "receivable_key" })
        : await table().delete().eq("receivable_key", key);
      if (error) throw error;
    },
    onSuccess: (_, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      toast.success(taskId ? "Projeto vinculado." : "Vínculo removido.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return {
    available: query.data?.available ?? false,
    linkFor: (key: string) => query.data?.byKey.get(key) ?? null,
    setLink,
  };
}
