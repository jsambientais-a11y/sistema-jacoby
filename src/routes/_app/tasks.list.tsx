import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  useTasks,
  useColumns,
  useClients,
  useProfiles,
  useSubtasks,
  useTaskCollaborators,
  type Task,
} from "@/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { TaskFilters, applyTaskFilters, type TaskFilterValue } from "@/components/TaskFilters";
import { TaskDialog } from "@/components/TaskDialog";
import { priorityColors, priorityLabels } from "@/lib/task-utils";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/tasks/list")({
  component: ListPage,
  validateSearch: (s: Record<string, unknown>) => ({
    task: typeof s.task === "string" ? s.task : undefined,
    mine: s.mine === "1" || s.mine === true || s.mine === "true" ? true : undefined,
  }),
});

function ListPage() {
  const { data: tasks = [] } = useTasks();
  const { data: clients = [] } = useClients();
  const { data: profiles = [] } = useProfiles();
  const { data: subtasks = [] } = useSubtasks();
  const { data: collaborators = [] } = useTaskCollaborators();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: columns = [] } = useColumns();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<TaskFilterValue>(() =>
    search.mine ? { scope: "mine" } : {},
  );
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Task | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Auto-open a task when arriving with ?task=<id>
  useEffect(() => {
    if (!search.task) return;
    const t = tasks.find((x) => x.id === search.task);
    if (t) {
      setEdit(t);
      setOpen(true);
      navigate({
        to: "/tasks/list",
        search: (p: any) => ({ ...p, task: undefined }),
        replace: true,
      });
    }
  }, [search.task, tasks, navigate]);

  const subtaskAssigneeTaskIds = useMemo(() => {
    const s = new Set<string>();
    if (!user?.id) return s;
    for (const st of subtasks as any[])
      if (st.assignee_id === user.id && st.task_id) s.add(st.task_id);
    return s;
  }, [subtasks, user?.id]);

  const subtaskAssigneeTaskIdsByUser = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const st of subtasks as any[]) {
      if (!st.assignee_id || !st.task_id) continue;
      const set = map.get(st.assignee_id) ?? new Set<string>();
      set.add(st.task_id);
      map.set(st.assignee_id, set);
    }
    return map;
  }, [subtasks]);

  const collaboratorTaskIds = useMemo(
    () => new Set(collaborators.filter((collaborator) => collaborator.collaborator_id === user?.id).map((collaborator) => collaborator.task_id)),
    [collaborators, user?.id],
  );

  const list = useMemo(() => {
    const r = applyTaskFilters(tasks, filters, {
      userId: user?.id ?? null,
      subtaskAssigneeTaskIds,
      collaboratorTaskIds,
      subtaskAssigneeTaskIdsByUser,
    });
    return r.filter((task) => task.status !== "done" && !task.completed_at).sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [tasks, filters, user?.id, subtaskAssigneeTaskIds, collaboratorTaskIds, subtaskAssigneeTaskIdsByUser]);

  const completeTask = async (taskId: string) => {
    const { error } = await supabase
      .from("tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (error) {
      toast.error(error.message);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    toast.success("Tarefa concluída.");
  };

  const moveToTrash = async (task: Task) => {
    if (!confirm(`Mover a tarefa “${task.title}” para a lixeira?`)) return;
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .eq("id", task.id);
    if (error) return toast.error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["tasks", "deleted"] });
    toast.success("Tarefa movida para a lixeira.");
  };

  const toggleTaskSelection = (taskId: string, checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      checked ? next.add(taskId) : next.delete(taskId);
      return next;
    });
  };

  const selectAllVisibleTasks = (checked: boolean) => {
    setSelectedTaskIds(checked ? new Set(list.map((task) => task.id)) : new Set());
  };

  const moveSelectedToTrash = async () => {
    const ids = [...selectedTaskIds].filter((id) => list.some((task) => task.id === id));
    if (!ids.length) return;
    if (!confirm(`Mover ${ids.length} tarefa(s) selecionada(s) para a lixeira?`)) return;

    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .in("id", ids);
    if (error) return toast.error(error.message);

    setSelectedTaskIds(new Set());
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    await queryClient.invalidateQueries({ queryKey: ["tasks", "deleted"] });
    toast.success(`${ids.length} tarefa(s) movida(s) para a lixeira.`);
  };

  const allVisibleSelected = list.length > 0 && list.every((task) => selectedTaskIds.has(task.id));

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-display text-base font-bold tabular-nums text-foreground">{list.length}</span>{" "}
          {list.length === 1 ? "tarefa" : "tarefas"}
        </p>
        <Button
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Nova tarefa
        </Button>
      </header>
      <TaskFilters filters={filters} onChange={setFilters} />

      {selectedTaskIds.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-accent/50 px-3 py-2 text-sm animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="font-medium text-accent-foreground">
            <span className="tabular-nums">{selectedTaskIds.size}</span> tarefa(s) selecionada(s)
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelectedTaskIds(new Set())}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void moveSelectedToTrash()}>
              <Trash2 className="h-4 w-4" />Mover para a lixeira
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 border-b bg-muted/60 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr>
              <th className="w-10 px-3 py-2.5 text-center">
                <Checkbox
                  aria-label="Selecionar todas as tarefas visíveis"
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) => selectAllVisibleTasks(checked === true)}
                />
              </th>
              <th className="w-[29%] px-3 py-2.5">Tarefa</th>
              <th className="w-[12%] px-3 py-2.5">Cliente</th>
              <th className="w-[13%] px-3 py-2.5">Responsável</th>
              <th className="w-[10%] px-3 py-2.5">Colaboradores</th>
              <th className="w-[11%] px-3 py-2.5">Status</th>
              <th className="w-[9%] px-3 py-2.5">Prioridade</th>
              <th className="w-[10%] px-3 py-2.5">Prazo</th>
              <th className="w-[6%] px-2 py-2.5 text-center"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center">
                  <p className="font-medium">Nenhuma tarefa encontrada</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ajuste os filtros ou crie uma nova tarefa.</p>
                </td>
              </tr>
            ) : list.map((t) => {
              const client = clients.find((c) => c.id === t.client_id);
              const assignee = profiles.find((p) => p.id === t.assignee_id);
              const statusColumn = columns.find((column) => column.id === t.column_id);
              const done = t.completed_at !== null;
              const overdue = t.due_date && isPast(new Date(t.due_date)) && t.status !== "done" && !done;
              const selected = selectedTaskIds.has(t.id);
              const taskCollaborators = collaborators.filter((collaborator) => collaborator.task_id === t.id).map((collaborator) => profiles.find((profile) => profile.id === collaborator.collaborator_id)).filter(Boolean);

              return (
                <tr
                  key={t.id}
                  className={`group cursor-pointer border-t transition-colors duration-150 ${selected ? "bg-accent/50" : "hover:bg-accent/30"} ${done ? "text-muted-foreground" : ""}`}
                  onClick={() => {
                    setEdit(t);
                    setOpen(true);
                  }}
                >
                  <td className="px-3 py-2.5 text-center" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      aria-label={`Selecionar tarefa ${t.title}`}
                      checked={selected}
                      onCheckedChange={(checked) => toggleTaskSelection(t.id, checked === true)}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`block truncate font-medium transition-colors group-hover:text-primary ${done ? "line-through decoration-muted-foreground/50" : ""}`}>{t.title}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    {client ? (
                      <span className="flex min-w-0 items-center gap-1.5 text-xs">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: client.color || "var(--primary)" }} />
                        <span className="truncate">{client.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {assignee ? (
                      <span className="flex min-w-0 items-center gap-2 text-xs">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={assignee.avatar_url || undefined} alt={assignee.full_name || assignee.email || "Usuário"} />
                          <AvatarFallback className="bg-accent text-[9px] font-semibold text-accent-foreground">
                            {(assignee.full_name || assignee.email || "?").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{assignee.full_name || assignee.email}</span>
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {taskCollaborators.length > 0 ? (
                      <div className="flex -space-x-1.5" title={taskCollaborators.map((p: any) => p.full_name || p.email).join(", ")}>
                        {taskCollaborators.slice(0, 3).map((person: any) => {
                          const name = person.full_name || person.email || "Usuário";
                          return <Avatar key={person.id} className="h-6 w-6 border-2 border-card transition-transform group-hover:translate-x-0.5"><AvatarImage src={person.avatar_url || undefined} alt={name} /><AvatarFallback className="text-[9px]">{name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>;
                        })}
                        {taskCollaborators.length > 3 ? <span className="ml-2 self-center text-[11px] text-muted-foreground">+{taskCollaborators.length - 3}</span> : null}
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {statusColumn ? (
                      <span
                        className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: `color-mix(in oklab, ${statusColumn.color || "var(--primary)"} 14%, transparent)` }}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: statusColumn.color || "var(--primary)" }} />
                        <span className="truncate">{statusColumn.name}</span>
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {t.priority ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: priorityColors[t.priority] }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: priorityColors[t.priority] }} />
                        {priorityLabels[t.priority]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-xs tabular-nums">
                    {t.due_date ? (
                      <span className={overdue ? "inline-flex rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive" : "text-muted-foreground"}>
                        {format(new Date(t.due_date), "dd MMM yyyy", { locale: ptBR })}
                        {t.due_time ? ` · ${t.due_time.slice(0, 5)}` : ""}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-1 py-2 text-center">
                    <div className="flex justify-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 hover:text-primary"
                        title="Concluir tarefa"
                        disabled={done}
                        onClick={(event) => {
                          event.stopPropagation();
                          void completeTask(t.id);
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Mover para a lixeira"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          void moveToTrash(t);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TaskDialog open={open} onOpenChange={setOpen} task={edit} />
    </div>
  );
}
