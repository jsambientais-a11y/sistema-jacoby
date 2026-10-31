import { useState, type FormEvent } from "react";
import { Layers, Plus, Search, Pencil, Trash2, ArrowUp, ArrowDown, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useTasks, type Task } from "@/hooks/use-data";
import { useProcessTemplates } from "@/hooks/use-process-templates";
import type { ProcessTemplate } from "@/lib/task-process-templates";
import { SaveProcessTemplate } from "@/components/SaveProcessTemplate";
import { TaskDialog } from "@/components/TaskDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
export function ProcessTemplatesLibrary() {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [showDeleted, setShowDeleted] = useState(false);
  const [chosen, setChosen] = useState<ProcessTemplate | null>(null),
    [draft, setDraft] = useState<ProcessTemplate | null>(null),
    [deleting, setDeleting] = useState<ProcessTemplate | null>(null),
    [busy, setBusy] = useState(false);
  const templates = useProcessTemplates();
  const tasks = useTasks();
  const matches = (text: string) =>
    text.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"));
  const error = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Não foi possível salvar a alteração.");
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    try {
      await templates.edit({
        ...draft,
        name: draft.name.trim(),
        title: draft.title.trim(),
        steps: draft.steps.map((s) => ({ ...s, title: s.title.trim() })),
      });
      setDraft(null);
      toast.success("Modelo atualizado. Os processos existentes foram preservados.");
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await templates.remove(deleting.id);
      setDeleting(null);
      toast.success("Modelo excluído. Você pode restaurá-lo em Excluídos.");
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  const restore = async (id: string) => {
    setBusy(true);
    try {
      await templates.restore(id);
      toast.success("Modelo restaurado.");
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  const move = (index: number, delta: number) => {
    if (!draft) return;
    const steps = [...draft.steps];
    [steps[index], steps[index + delta]] = [steps[index + delta], steps[index]];
    setDraft({ ...draft, steps });
  };
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto shrink-0"
        onClick={() => setOpen(true)}
      >
        <Layers className="mr-2 h-4 w-4" />
        Modelos de processos
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogTitle>Modelos de processos</DialogTitle>
          <DialogDescription>
            Gerencie os roteiros reutilizáveis. Alterar ou excluir um modelo não modifica os
            processos já criados.
          </DialogDescription>
          <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
            {templates.localOnly
              ? "Modelos guardados neste navegador."
              : "Modelos compartilhados com a equipe."}{" "}
            Ao usar um modelo, confira cliente, responsáveis e prazo. Os excluídos ficam disponíveis
            para restauração.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              aria-label="Buscar modelos e tarefas"
              placeholder="Buscar modelo ou tarefa pelo nome"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">
              {showDeleted ? "Modelos excluídos" : "Modelos salvos"} (
              {(showDeleted ? templates.deleted : templates.data || []).length})
            </h3>
            <Button variant="outline" size="sm" onClick={() => setShowDeleted(!showDeleted)}>
              {showDeleted ? "Ver modelos salvos" : `Excluídos (${templates.deleted.length})`}
            </Button>
          </div>
          {templates.error && (
            <p role="alert" className="text-sm text-destructive">
              {templates.error.message}
            </p>
          )}
          {templates.isLoading && <p>Consultando modelos…</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {(showDeleted ? templates.deleted : templates.data || [])
              .filter((model) => matches(model.name))
              .map((model) => (
                <article
                  key={model.id}
                  className="min-w-0 space-y-3 rounded-xl border bg-primary/5 p-4"
                >
                  <div>
                    <h4 className="font-semibold break-words">{model.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {model.steps.length} etapas · roteiro reutilizável para qualquer cliente
                    </p>
                  </div>
                  <ol className="max-h-48 list-decimal space-y-1 overflow-y-auto pl-5 text-sm">
                    {model.steps.map((step, index) => (
                      <li key={index} className="break-words">
                        {step.title}
                      </li>
                    ))}
                  </ol>
                  {showDeleted ? (
                    <Button
                      variant="outline"
                      disabled={busy || !templates.canManage}
                      onClick={() => void restore(model.id)}
                    >
                      <Undo2 className="mr-2 h-4 w-4" />
                      Restaurar modelo
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={() => {
                          setChosen(model);
                          setOpen(false);
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Novo processo com este modelo
                      </Button>
                      {templates.canManage && (
                        <div className="flex flex-wrap gap-2 border-t pt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Editar modelo ${model.name}`}
                            onClick={() =>
                              setDraft({ ...model, steps: model.steps.map((s) => ({ ...s })) })
                            }
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive"
                            aria-label={`Excluir modelo ${model.name}`}
                            onClick={() => setDeleting(model)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </article>
              ))}
          </div>
          {!templates.isLoading &&
            !templates.error &&
            !(showDeleted ? templates.deleted : templates.data || []).filter((m) => matches(m.name))
              .length && (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Nenhum modelo nesta seleção.
              </p>
            )}
          {!showDeleted && templates.canManage && (
            <>
              <h3 className="mt-3 font-semibold">Salvar padrão de uma tarefa existente</h3>
              {tasks.isLoading ? (
                <p>Consultando tarefas…</p>
              ) : (
                <div className="space-y-2">
                  {(tasks.data as Task[] | undefined)
                    ?.filter((task) => matches(task.title))
                    .map((task) => (
                      <div
                        key={task.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                      >
                        <span className="text-sm font-medium">{task.title}</span>
                        <SaveProcessTemplate taskId={task.id} title={task.title} />
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!draft}
        onOpenChange={(value) => {
          if (!value && !busy) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>Editar modelo de processo</DialogTitle>
          <DialogDescription>
            As alterações valem para novos processos. Prazos relativos e responsáveis das etapas
            existentes são preservados.
          </DialogDescription>
          {draft && (
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="model-name">Nome do modelo</Label>
                <Input
                  id="model-name"
                  required
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model-title">Título do novo processo</Label>
                <Input
                  id="model-title"
                  required
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <h3 className="font-semibold">Etapas ({draft.steps.length})</h3>
              {draft.steps.map((step, index) => (
                <div key={index} className="space-y-2 rounded-lg border p-3">
                  <Label htmlFor={`model-step-${index}`}>Etapa {index + 1}</Label>
                  <Input
                    id={`model-step-${index}`}
                    required
                    value={step.title}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        steps: draft.steps.map((s, i) =>
                          i === index ? { ...s, title: e.target.value } : s,
                        ),
                      })
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={index === 0}
                      aria-label={`Mover etapa ${index + 1} para cima`}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={index === draft.steps.length - 1}
                      aria-label={`Mover etapa ${index + 1} para baixo`}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDraft({ ...draft, steps: draft.steps.filter((_, i) => i !== index) })
                      }
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remover etapa
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setDraft({
                    ...draft,
                    steps: [
                      ...draft.steps,
                      { title: "", notes: null, assigneeId: null, offsetDays: null },
                    ],
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar etapa
              </Button>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  Cancelar
                </Button>
                <Button disabled={busy}>{busy ? "Salvando…" : "Salvar alterações"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(value) => {
          if (!value && !busy) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Excluir modelo?</DialogTitle>
          <DialogDescription>
            O modelo “{deleting?.name}” sairá da lista disponível para novos processos. Os processos
            já criados serão preservados. Você poderá restaurá-lo em Excluídos.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
              {busy ? "Excluindo…" : "Excluir modelo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <TaskDialog
        open={!!chosen}
        onOpenChange={(value) => {
          if (!value) setChosen(null);
        }}
        initialTemplate={chosen}
      />
    </>
  );
}
