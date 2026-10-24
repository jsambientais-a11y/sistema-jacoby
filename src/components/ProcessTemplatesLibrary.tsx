import {useState} from "react";
import {Layers,Plus,Search} from "lucide-react";
import {useTasks,type Task} from "@/hooks/use-data";
import {useProcessTemplates} from "@/hooks/use-process-templates";
import type {ProcessTemplate} from "@/lib/task-process-templates";
import {SaveProcessTemplate} from "@/components/SaveProcessTemplate";
import {TaskDialog} from "@/components/TaskDialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
export function ProcessTemplatesLibrary() {
  const [open,setOpen]=useState(false),[search,setSearch]=useState("");
  const [chosen,setChosen]=useState<ProcessTemplate|null>(null);
  const templates=useProcessTemplates(); const tasks=useTasks();
  const matches=(text:string)=>text.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"));
  return <><Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={()=>setOpen(true)}><Layers className="mr-2 h-4 w-4"/>Modelos de processos</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
      <DialogTitle>Modelos de processos</DialogTitle><DialogDescription>Salve uma vez o roteiro de um serviço e use o mesmo padrão em novos clientes.</DialogDescription>
      <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">Prévia local: os modelos ficam salvos neste navegador e nesta conta. A tarefa original não muda. Ao usar um modelo, confira cliente, responsáveis, coluna e novo prazo antes de criar a tarefa.</p>
      <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" aria-label="Buscar modelos e tarefas" placeholder="Buscar modelo ou tarefa pelo nome" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <h3 className="font-semibold">Modelos salvos ({templates.data?.length || 0})</h3>
      {templates.error && <p role="alert" className="text-sm text-destructive">{templates.error.message}</p>}
      {!templates.data?.length && !templates.error && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Escolha uma tarefa abaixo e clique em Salvar como modelo. As etapas concluídas serão reiniciadas ao abrir um novo processo.</p>}
      <div className="grid gap-3 sm:grid-cols-2">{(templates.data||[]).filter(model=>matches(model.name)).map(model=><article key={model.id} className="space-y-3 rounded-xl border bg-primary/5 p-4">
        <div><h4 className="font-semibold">{model.name}</h4><p className="text-xs text-muted-foreground">{model.steps.length} etapas · roteiro reutilizável para qualquer cliente</p></div>
        <ol className="max-h-48 list-decimal space-y-1 overflow-y-auto pl-5 text-sm">{model.steps.map((step,index)=><li key={index}>{step.title}</li>)}</ol>
        <Button onClick={()=>{setChosen(model);setOpen(false);}}><Plus className="mr-2 h-4 w-4"/>Novo processo com este modelo</Button>
      </article>)}</div>
      <h3 className="mt-3 font-semibold">Salvar padrão de uma tarefa existente</h3>
      {tasks.isLoading ? <p>Consultando tarefas…</p> : <div className="space-y-2">{(tasks.data as Task[] | undefined)?.filter(task=>matches(task.title)).map(task=><div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><span className="text-sm font-medium">{task.title}</span><SaveProcessTemplate taskId={task.id} title={task.title}/></div>)}</div>}
    </DialogContent></Dialog>
    <TaskDialog open={Boolean(chosen)} onOpenChange={value=>{if(!value)setChosen(null);}} initialTemplate={chosen}/>
  </>;
}
