import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  readProcessTemplates,
  storeProcessTemplate,
  validProcessTemplate,
  type ProcessTemplate,
} from "@/lib/task-process-templates";
type Row = { id: string; template: unknown; deleted_at: string | null };
const table = () => supabase.from("task_process_templates" as any) as any;
const missing = (error: { code?: string } | null) =>
  error?.code === "PGRST205" || error?.code === "42P01";
export function useProcessTemplates() {
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const scope = import.meta.env.VITE_SUPABASE_URL || "local";
  const key = `jacoby-process-templates-v1:${scope}:${user?.id || "anonymous"}`;
  const queryKey = ["task-process-templates", key];
  const canManage = !!user && hasPermission("tasks");
  const query = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: async () => {
      const local = readProcessTemplates(localStorage, key);
      const remote = await table().select("id,template,deleted_at").order("created_at");
      if (remote.error) {
        if (missing(remote.error))
          return { active: local, deleted: [] as ProcessTemplate[], local: true };
        throw remote.error;
      }
      const rows = remote.data as Row[];
      // Tombstones contam como IDs existentes: um cache antigo nunca recria um modelo excluído.
      const pending = local.filter((model) => !rows.some((row) => row.id === model.id));
      if (pending.length && canManage) {
        const sent = await table().upsert(
          pending.map((model) => ({ id: model.id, name: model.name, template: model })),
          { onConflict: "id", ignoreDuplicates: true },
        );
        if (sent.error) throw sent.error;
        // Reconsultar para não sobrescrever nem exibir um modelo excluído em outra sessão.
        const refreshed = await table().select("id,template,deleted_at").order("created_at");
        if (refreshed.error) throw refreshed.error;
        rows.splice(0, rows.length, ...refreshed.data);
      }
      const valid = rows.filter((row) => validProcessTemplate(row.template));
      // Após migrar, não manter cópias locais que possam repor edições antigas.
      if (!pending.length || canManage) localStorage.setItem(key, "[]");
      return {
        active: valid
          .filter((row) => !row.deleted_at)
          .map((row) => row.template as ProcessTemplate),
        deleted: valid
          .filter((row) => row.deleted_at)
          .map((row) => row.template as ProcessTemplate),
        local: false,
      };
    },
  });
  const changed = () => {
    void qc.invalidateQueries({ queryKey });
    window.dispatchEvent(new Event("jacoby-process-templates"));
  };
  useEffect(() => {
    const refresh = () => void qc.invalidateQueries({ queryKey: ["task-process-templates", key] });
    window.addEventListener("jacoby-process-templates", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("jacoby-process-templates", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [key, qc]);
  const ensure = () => {
    if (!canManage) throw new Error("Você não tem permissão para gerenciar modelos de processos.");
  };
  const save = async (template: ProcessTemplate): Promise<"shared" | "local"> => {
    ensure();
    if (!validProcessTemplate(template)) throw new Error("Modelo inválido.");
    const sent = await table().insert({ id: template.id, name: template.name, template });
    if (sent.error) {
      if (!missing(sent.error)) throw sent.error;
      storeProcessTemplate(localStorage, key, template);
    }
    changed();
    return sent.error ? "local" : "shared";
  };
  const edit = async (template: ProcessTemplate) => {
    ensure();
    if (
      !validProcessTemplate(template) ||
      !template.name.trim() ||
      !template.title.trim() ||
      template.steps.some((step) => !step.title.trim())
    )
      throw new Error("Preencha o nome, o título e todas as etapas.");
    if (query.data?.local) {
      storeProcessTemplate(localStorage, key, template);
      changed();
      return;
    }
    const result = await table()
      .update({ name: template.name, template })
      .eq("id", template.id)
      .is("deleted_at", null)
      .select("id");
    if (result.error) throw result.error;
    if (!result.data?.length)
      throw new Error("O modelo foi excluído ou seu acesso mudou. Atualize a lista.");
    changed();
  };
  const remove = async (id: string) => {
    ensure();
    if (query.data?.local)
      throw new Error("A exclusão recuperável precisa da tabela compartilhada atualizada.");
    const result = await table()
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id");
    if (result.error) throw result.error;
    if (!result.data?.length) throw new Error("O modelo já foi excluído ou seu acesso mudou.");
    changed();
  };
  const restore = async (id: string) => {
    ensure();
    const result = await table().update({ deleted_at: null }).eq("id", id).select("id");
    if (result.error) throw result.error;
    if (!result.data?.length) throw new Error("Modelo não encontrado.");
    changed();
  };
  return {
    ...query,
    data: query.data?.active,
    deleted: query.data?.deleted || [],
    localOnly: query.data?.local,
    canManage,
    save,
    edit,
    remove,
    restore,
  };
}
