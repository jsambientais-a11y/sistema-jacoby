export type ProcessStep = { title: string; notes: string | null; assigneeId: string | null; offsetDays: number | null };
export type ProcessTemplate = {
  id: string; name: string; title: string; description: string; priority: string | null;
  assigneeId: string | null; columnId: string | null; sourceTaskId: string;
  steps: ProcessStep[]; createdAt: string;
};
type SourceTask = { id:string; title:string; description:string|null; priority:string|null; assignee_id:string|null; column_id:string|null; due_date:string|null };
type SourceStep = {title:string;notes?:string|null;assignee_id?:string|null;due_date?:string|null;position:number};
const day = (date:string) => Date.parse(date.slice(0,10)+"T12:00:00Z");
export function captureProcessTemplate(task:SourceTask, steps:SourceStep[], name:string, id:string, now:string):ProcessTemplate {
  if (!name.trim() || !task.title.trim()) throw new Error("Informe o nome do modelo e o título da tarefa.");
  return {
    id,name:name.trim(),title:task.title,description:task.description || "",priority:task.priority,
    assigneeId:task.assignee_id,columnId:task.column_id,sourceTaskId:task.id,createdAt:now,
    steps:[...steps].sort((a,b)=>a.position-b.position).map(step => ({
      title:step.title,notes:step.notes || null,assigneeId:step.assignee_id || null,
      offsetDays:step.due_date && task.due_date && Number.isFinite(day(step.due_date)-day(task.due_date)) ? Math.round((day(step.due_date)-day(task.due_date))/86400000) : null,
    })),
  };
}
export function instantiateProcessSteps(template:ProcessTemplate, taskId:string, dueDate:string, keepPeople:boolean, makeId:()=>string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(day(dueDate)) || new Date(day(dueDate)).toISOString().slice(0,10)!==dueDate) throw new Error("Defina o novo prazo do processo.");
  if(template.steps.some(step=>!step.title.trim())) throw new Error("Preencha o título de todas as etapas do processo.");
  return template.steps.map((step,position)=>({
    id:makeId(),task_id:taskId,title:step.title,notes:step.notes,done:false,position,
    assignee_id:keepPeople ? step.assigneeId : null,
    due_date:step.offsetDays === null ? null : new Date(day(dueDate)+step.offsetDays*86400000).toISOString(),
  }));
}
export function validProcessTemplate(value:unknown): value is ProcessTemplate {
  if (!value || typeof value!=="object") return false;
  const item=value as ProcessTemplate;
  return typeof item.id==="string" && typeof item.name==="string" && typeof item.title==="string" &&
    typeof item.description==="string" && typeof item.sourceTaskId==="string" && typeof item.createdAt==="string" &&
    [item.assigneeId,item.columnId,item.priority].every(v=>v===null||typeof v==="string") &&
    Array.isArray(item.steps) && item.steps.every(step=>typeof step.title==="string" && (step.notes===null||typeof step.notes==="string") && (step.assigneeId===null||typeof step.assigneeId==="string") && (step.offsetDays===null||Number.isInteger(step.offsetDays)));
}
export function readProcessTemplates(storage:Pick<Storage,"getItem">,key:string):ProcessTemplate[] {
  const text=storage.getItem(key);
  if (!text) return [];
  const value=JSON.parse(text);
  if (!Array.isArray(value)||!value.every(validProcessTemplate)) throw new Error("Não foi possível ler os modelos salvos neste navegador. Os dados foram preservados.");
  return value;
}
export function storeProcessTemplate(storage:Pick<Storage,"getItem"|"setItem">,key:string,template:ProcessTemplate) {
  if (!validProcessTemplate(template)) throw new Error("Modelo inválido.");
  const current=readProcessTemplates(storage,key);
  storage.setItem(key,JSON.stringify([...current.filter(item=>item.id!==template.id),template]));
}
