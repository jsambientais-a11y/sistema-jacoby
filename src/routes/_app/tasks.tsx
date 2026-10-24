import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { KanbanSquare, List as ListIcon, Calendar as CalIcon } from "lucide-react";

import { ProcessTemplatesLibrary } from "@/components/ProcessTemplatesLibrary";

export const Route = createFileRoute("/_app/tasks")({
  component: TasksLayout,
});

function TasksLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const views = [
    { to: "/tasks/kanban", label: "Kanban", icon: KanbanSquare },
    { to: "/tasks/list", label: "Lista", icon: ListIcon },
    { to: "/tasks/calendar", label: "Calendário", icon: CalIcon },
  ] as const;
  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b bg-background/95 px-6 py-3 backdrop-blur">
        <span className="mr-2 text-sm font-medium text-muted-foreground">Visualizar como:</span>
        <div className="inline-flex rounded-lg border bg-muted/40 p-1">
          {views.map((v) => {
            const active = pathname === v.to || pathname.startsWith(v.to + "/");
            const Icon = v.icon;
            return (
              <Link
                key={v.to}
                to={v.to}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {v.label}
              </Link>
            );
          })}
        </div>
        <ProcessTemplatesLibrary />
      </div>
      <Outlet />
    </div>
  );
}
