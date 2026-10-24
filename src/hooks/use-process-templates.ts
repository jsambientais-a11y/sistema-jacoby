import {useEffect} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useAuth} from "@/hooks/use-auth";
import {supabase} from "@/integrations/supabase/client";
import {readProcessTemplates,storeProcessTemplate,validProcessTemplate,type ProcessTemplate} from "@/lib/task-process-templates";
// Modelos ficam na tabela task_process_templates (compartilhados pela equipe).
// Se a tabela ainda não existir no banco, o navegador continua guardando como antes.
const table=()=>supabase.from("task_process_templates" as any) as any;
export function useProcessTemplates() {
  const {user}=useAuth(); const qc=useQueryClient();
  const scope=import.meta.env.VITE_SUPABASE_URL || "local";
  const key=`jacoby-process-templates-v1:${scope}:${user?.id || "anonymous"}`;
  const queryKey=["task-process-templates",key];
  const query=useQuery({queryKey,enabled:Boolean(user),queryFn:async()=>{
    const local=readProcessTemplates(localStorage,key);
    const remote=await table().select("id,template").order("created_at");
    if (remote.error) return local;
    const shared=((remote.data||[]) as {template:unknown}[]).map(row=>row.template).filter(validProcessTemplate);
    // Leva para o banco os modelos criados neste navegador antes da tabela existir.
    const pending=local.filter(model=>!shared.some(item=>item.id===model.id));
    if (pending.length) await table().upsert(pending.map(model=>({id:model.id,name:model.name,template:model})),{onConflict:"id"});
    return [...shared,...pending];
  }});
  useEffect(()=>{
    const changed=()=>void qc.invalidateQueries({queryKey:["task-process-templates",key]});
    window.addEventListener("jacoby-process-templates",changed);window.addEventListener("storage",changed);
    return ()=>{window.removeEventListener("jacoby-process-templates",changed);window.removeEventListener("storage",changed);};
  },[key,qc]);
  /** Salva o modelo para a equipe; devolve "local" quando só foi possível guardar neste navegador. */
  const save=async(template:ProcessTemplate):Promise<"shared"|"local">=>{
    if (!user) throw new Error("Entre no sistema antes de salvar um modelo.");
    if (!validProcessTemplate(template)) throw new Error("Modelo inválido.");
    const sent=await table().upsert({id:template.id,name:template.name,template},{onConflict:"id"});
    if (sent.error) storeProcessTemplate(localStorage,key,template);
    window.dispatchEvent(new Event("jacoby-process-templates"));
    return sent.error ? "local" : "shared";
  };
  return {...query,save};
}
