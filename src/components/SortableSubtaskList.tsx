import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lista de subtarefas reordenável por arrastar (alça ⋮⋮) e por teclado
 * (foco na alça → Espaço → setas → Espaço). Usa um DndContext próprio: pode
 * ficar dentro de um card que também é arrastável no kanban, porque a alça
 * interrompe a propagação dos eventos que iniciariam o arraste do card.
 */

// Só move na vertical e nunca sai da área da lista (não sobe/desce além do card).
const restrictToList: Modifier = ({ transform, draggingNodeRect, containerNodeRect }) => {
  if (!draggingNodeRect || !containerNodeRect) return { ...transform, x: 0 };
  const minY = containerNodeRect.top - draggingNodeRect.top;
  const maxY = containerNodeRect.bottom - draggingNodeRect.bottom;
  return { ...transform, x: 0, y: Math.min(Math.max(transform.y, minY), maxY) };
};

export type SubtaskRowState = {
  index: number;
  isDragging: boolean;
  handleProps: HTMLAttributes<HTMLButtonElement> & { ref: (el: HTMLElement | null) => void };
};

export function SortableSubtaskList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  className,
  disabled,
}: {
  items: T[];
  onReorder: (next: T[]) => void;
  renderItem: (item: T, state: SubtaskRowState) => ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToList]}
      onDragEnd={handleDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Pressione espaço para pegar a subtarefa, use as setas para mover e espaço para soltar.",
        },
      }}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item, index) => (
            <SortableRow key={item.id} id={item.id} disabled={disabled}>
              {(state) => renderItem(item, { ...state, index })}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

const stopEvent = (event: SyntheticEvent) => event.stopPropagation();

function SortableRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (state: Omit<SubtaskRowState, "index">) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 20 : undefined,
  };

  const handleProps: SubtaskRowState["handleProps"] = {
    ...attributes,
    ref: setActivatorNodeRef,
    // Inicia o arraste da subtarefa e impede que o card (kanban) também comece a ser arrastado.
    onPointerDown: (event) => {
      listeners?.onPointerDown?.(event);
      event.stopPropagation();
    },
    onKeyDown: (event) => {
      listeners?.onKeyDown?.(event);
      event.stopPropagation();
    },
    onTouchStart: stopEvent,
    onMouseDown: stopEvent,
    onClick: stopEvent,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ isDragging, handleProps })}
    </div>
  );
}

export function SubtaskDragHandle({
  handleProps,
  className,
  label = "Arrastar para reordenar",
}: {
  handleProps: SubtaskRowState["handleProps"];
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      {...handleProps}
      aria-label={label}
      title={label}
      className={cn(
        "flex shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/50 transition hover:bg-muted hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
        className,
      )}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * Descrição (anotações) de uma subtarefa editável no próprio lugar.
 * Clique no texto para editar · Enter salva · Shift+Enter quebra linha · Esc cancela.
 */
export function SubtaskNotesInline({
  value,
  editing,
  onEditingChange,
  onSave,
  className,
  textClassName,
  placeholder = "Descreva esta subtarefa…",
}: {
  value: string | null;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSave: (next: string) => void;
  className?: string;
  textClassName?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing) {
      setDraft(value ?? "");
      cancelled.current = false;
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        autosize(el);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = () => {
    if (cancelled.current) return;
    onEditingChange(false);
    const next = draft.trim();
    if (next !== (value ?? "").trim()) onSave(next);
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        rows={1}
        placeholder={placeholder}
        onChange={(event) => {
          setDraft(event.target.value);
          autosize(event.currentTarget);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancelled.current = true;
            onEditingChange(false);
          }
        }}
        onPointerDown={stopEvent}
        onClick={stopEvent}
        className={cn(
          "block w-full resize-none overflow-hidden rounded border border-input bg-background px-1.5 py-1 text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring",
          textClassName,
          className,
        )}
      />
    );
  }

  if (!value?.trim()) return null;

  return (
    <button
      type="button"
      title="Clique para editar a descrição"
      onPointerDown={stopEvent}
      onClick={(event) => {
        event.stopPropagation();
        onEditingChange(true);
      }}
      className={cn(
        "block w-full cursor-text whitespace-pre-wrap break-words rounded px-1 text-left text-muted-foreground transition hover:bg-muted/60 hover:text-foreground [overflow-wrap:anywhere]",
        textClassName,
        className,
      )}
    >
      {value}
    </button>
  );
}

function autosize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
