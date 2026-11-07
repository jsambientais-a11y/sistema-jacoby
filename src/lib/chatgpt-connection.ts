import { z } from "zod";

// UUIDs confirmados da Jacoby. O teste do Reinan só é aceito em desenvolvimento.
export const CHATGPT_OWNER_ID = "b2f6e43d-ce24-4de2-a770-0548793cc180";
export const CHATGPT_TESTER_ID = "9f04a62f-dba4-4cbb-918d-96e848ab0c16";
export function canManageChatGpt(
  userId: string | undefined,
  isAdmin: boolean,
  isClient: boolean,
  development = false,
) {
  return (
    isAdmin &&
    !isClient &&
    (userId === CHATGPT_OWNER_ID || (development && userId === CHATGPT_TESTER_ID))
  );
}
export function isChatGptCallback(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "chatgpt.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      (url.pathname === "/connector_platform_oauth_redirect" ||
        /^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(url.pathname))
    );
  } catch {
    return false;
  }
}
export const chatGptTaskDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    clientId: z.string().uuid().optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T12:00:00Z`);
        return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
      })
      .optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  })
  .strict();
export type ChatGptTaskDraft = z.infer<typeof chatGptTaskDraftSchema>;
export function parseChatGptDraft(value: string | undefined) {
  if (!value || value.length > 2500) return null;
  try {
    return chatGptTaskDraftSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

// Formato oficial do aplicativo ChatGPT/Codex. Preenche o compositor com o
// plugin mencionado, sem enviar automaticamente o pedido.
export function buildJacobyAssistantLink(pluginId: string | undefined, prompt: string) {
  if (!pluginId || !/^[a-zA-Z0-9][a-zA-Z0-9_.@-]{0,199}$/.test(pluginId)) return null;
  const message = prompt.trim();
  if (!message || message.length > 2000) return null;
  return `codex://new?prompt=${encodeURIComponent(`[@Jacoby](plugin://${pluginId}) ${message}`)}`;
}

// TanStack decodes JSON-valued query parameters before validateSearch runs.
export function normalizeChatGptDraftSearch(value: unknown): string | undefined {
  if (typeof value === "string") return parseChatGptDraft(value) ? value : undefined;
  const parsed = chatGptTaskDraftSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const encoded = JSON.stringify(parsed.data);
  return encoded.length <= 2500 ? encoded : undefined;
}
