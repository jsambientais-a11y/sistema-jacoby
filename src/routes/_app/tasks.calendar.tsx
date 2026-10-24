import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isPast,
  isSameMonth,
  isWeekend,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTasks, useClients, useSubtasks, useTaskCollaborators, type Task } from "@/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { TaskFilters, applyTaskFilters, type TaskFilterValue } from "@/components/TaskFilters";
import { TaskDialog } from "@/components/TaskDialog";

export const Route = createFileRoute("/_app/tasks/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  const { data: tasks = [] } = useTasks();
  const { data: clients = [] } = useClients();
  const { data: subtasks = [] } = useSubtasks();
  const { data: collaborators = [] } = useTaskCollaborators();
  const { user } = useAuth();
  const [cursor, setCursor] = useState(new Date());
  const [filters, setFilters] = useState<TaskFilterValue>({});
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Task | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

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

  const visible = useMemo(
    () =>
      applyTaskFilters(tasks, filters, {
        userId: user?.id ?? null,
        subtaskAssigneeTaskIds,
        collaboratorTaskIds,
        subtaskAssigneeTaskIdsByUser,
      }),
    [tasks, filters, user?.id, subtaskAssigneeTaskIds, collaboratorTaskIds, subtaskAssigneeTaskIdsByUser],
  );

  const subtaskDueDatesByTask = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const st of subtasks) {
      if (!st.task_id || !st.due_date) continue;
      const list = map.get(st.task_id) ?? [];
      list.push(st.due_date);
      map.set(st.task_id, list);
    }
    return map;
  }, [subtasks]);

  const dayTasks = (day: Date) =>
    visible.filter((t) => {
      if (t.due_date && isSameDay(new Date(t.due_date), day)) return true;
      return (subtaskDueDatesByTask.get(t.id) ?? []).some((due) => isSameDay(new Date(due), day));
    });

  const monthTaskCount = days
    .filter((day) => isSameMonth(day, cursor))
    .reduce((sum, day) => sum + dayTasks(day).length, 0);

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border bg-card p-0.5 shadow-sm">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCursor(subMonths(cursor, 1))} title="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => setCursor(new Date())}>
              Hoje
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCursor(addMonths(cursor, 1))} title="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <h2 key={format(cursor, "yyyy-MM")} className="text-xl font-bold capitalize leading-tight animate-in fade-in slide-in-from-left-1 duration-200">
              {format(cursor, "MMMM yyyy", { locale: ptBR })}
            </h2>
            <p className="text-xs text-muted-foreground">
              <span className="tabular-nums">{monthTaskCount}</span> {monthTaskCount === 1 ? "tarefa no mês" : "tarefas no mês"}
            </p>
          </div>
        </div>
        <Button
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Tarefa
        </Button>
      </header>
      <TaskFilters filters={filters} onChange={setFilters} />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
            <div key={d} className="px-3 py-2">
              {d}
            </div>
          ))}
        </div>
        <div key={format(cursor, "yyyy-MM")} className="grid grid-cols-7 animate-in fade-in duration-300">
          {days.map((day) => {
            const dayKey = day.toISOString();
            const inMonth = isSameMonth(day, cursor);
            const today = isSameDay(day, new Date());
            const ts = dayTasks(day);
            const expanded = expandedDay === dayKey;
            const shown = expanded ? ts : ts.slice(0, 3);
            return (
              <div
                key={dayKey}
                className={`group min-h-32 border-b border-r p-1.5 transition-colors duration-150 [&:nth-child(7n)]:border-r-0 ${
                  today ? "bg-accent/40" : inMonth ? (isWeekend(day) ? "bg-muted/25 hover:bg-accent/20" : "hover:bg-accent/20") : "bg-muted/40 text-muted-foreground"
                }`}
              >
                <div className="mb-1 flex items-center justify-between px-0.5">
                  <span
                    className={`inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs tabular-nums ${
                      today ? "bg-primary font-semibold text-primary-foreground shadow-sm" : inMonth ? "font-medium" : ""
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {ts.length > 0 && (
                    <span className="text-[10px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      {ts.length}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {shown.map((t) => {
                    const client = clients.find((c) => c.id === t.client_id);
                    const color = client?.color || t.color || "var(--primary)";
                    const done = t.completed_at !== null;
                    const late = !done && t.due_date && isPast(new Date(t.due_date)) && !isSameDay(new Date(t.due_date), new Date());
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          setEdit(t);
                          setOpen(true);
                        }}
                        title={t.title}
                        className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] font-medium transition-all duration-150 hover:-translate-y-px hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          done ? "text-muted-foreground line-through" : "text-foreground"
                        }`}
                        style={{ background: `color-mix(in oklab, ${color} 13%, transparent)` }}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: late ? "var(--destructive)" : color }} />
                        <span className="truncate">
                          {t.due_time && <span className="tabular-nums text-muted-foreground">{t.due_time.slice(0, 5)} </span>}
                          {t.title}
                        </span>
                      </button>
                    );
                  })}
                  {ts.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setExpandedDay(expanded ? null : dayKey)}
                      className="w-full rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium text-primary transition-colors hover:bg-accent/60"
                    >
                      {expanded ? "Mostrar menos" : `+${ts.length - 3} mais`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <TaskDialog open={open} onOpenChange={setOpen} task={edit} />
    </div>
  );
}
