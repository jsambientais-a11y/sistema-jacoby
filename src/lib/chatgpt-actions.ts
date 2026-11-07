import { z } from "zod";
export const assistantDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  });
const priority = z.enum(["low", "medium", "high", "urgent"]);
const taskInput = z
  .object({
    tipo: z.literal("editar_tarefa"),
    id: z.string().uuid(),
    titulo: z.string().trim().min(1).max(200).optional(),
    prazo: assistantDate.nullable().optional(),
    prioridade: priority.optional(),
  })
  .strict();
const accountInput = z
  .object({
    tipo: z.literal("criar_conta"),
    natureza: z.enum(["payable", "receivable"]),
    descricao: z.string().trim().min(1).max(500),
    valor_centavos: z.number().int().positive().max(1_000_000_000_000),
    vencimento: assistantDate,
    favorecido: z.string().trim().max(500).default(""),
    categoria: z.string().trim().max(200).default(""),
  })
  .strict();
export const assistantActionInput = z.discriminatedUnion("tipo", [taskInput, accountInput]);
export const assistantActionSchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().uuid(),
    expiresAt: z.number().int().positive(),
    pedido: assistantActionInput,
    // Snapshot is for review. Update additionally requires an unchanged server version.
    anterior: z
      .object({
        title: z.string(),
        due_date: assistantDate.nullable(),
        priority: priority.nullable(),
        updated_at: z.string().datetime({ offset: true }),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.pedido.tipo === "editar_tarefa" &&
      (!v.anterior ||
        (v.pedido.titulo === undefined &&
          v.pedido.prazo === undefined &&
          v.pedido.prioridade === undefined))
    )
      ctx.addIssue({ code: "custom", message: "Informe a tarefa atual e uma alteração." });
  });
export type AssistantAction = z.infer<typeof assistantActionSchema>;
export function normalizeAssistantAction(value: unknown): string | undefined {
  try {
    const decoded = typeof value === "string" ? JSON.parse(value) : value;
    const parsed = assistantActionSchema.safeParse(decoded);
    if (!parsed.success) return undefined;
    const text = JSON.stringify(parsed.data);
    return text.length <= 6000 ? text : undefined;
  } catch {
    return undefined;
  }
}
/** Explicit review in the authenticated Jacoby UI is the only write path. No payments or settlement. */
export async function applyAssistantAction(
  db: any,
  value: unknown,
  userId: string,
  now = Date.now(),
) {
  const action = assistantActionSchema.parse(value);
  if (action.expiresAt < now || action.expiresAt > now + 30 * 60_000)
    throw new Error("Esta proposta expirou. Peça uma nova ao assistente.");
  const p = action.pedido;
  if (p.tipo === "editar_tarefa") {
    const patch = {
      ...(p.titulo !== undefined ? { title: p.titulo } : {}),
      ...(p.prazo !== undefined ? { due_date: p.prazo } : {}),
      ...(p.prioridade !== undefined ? { priority: p.prioridade } : {}),
    };
    const r = await db
      .from("tasks")
      .update(patch)
      .eq("id", p.id)
      .eq("updated_at", action.anterior!.updated_at)
      .is("deleted_at", null)
      .select("id");
    if (r.error)
      throw new Error("Não foi possível alterar a tarefa. Confira seu acesso e tente novamente.");
    if (!r.data?.length)
      throw new Error(
        "A tarefa mudou ou não está disponível. Peça uma nova proposta antes de salvar.",
      );
    return { id: p.id, tela: "/tasks/kanban" };
  }
  const r = await db
    .from("enterprise_finance_accounts")
    .insert({
      id: action.requestId,
      created_by: userId,
      kind: p.natureza,
      description: p.descricao,
      amount_cents: p.valor_centavos,
      due_on: p.vencimento,
      counterparty: p.favorecido,
      category: p.categoria,
      notes: "Preparado pelo assistente e confirmado na Jacoby.",
      settled_on: null,
    })
    .select("id");
  if (r.error)
    throw new Error(
      r.error.code === "23505"
        ? "Esta proposta já foi salva. Confira o lançamento antes de tentar novamente."
        : "Não foi possível salvar a conta. Confira seu acesso e os campos.",
    );
  if (!r.data?.length) throw new Error("Não foi possível confirmar o lançamento.");
  return {
    id: action.requestId,
    tela: p.natureza === "payable" ? "/contas-a-pagar" : "/contas-a-receber",
  };
}
