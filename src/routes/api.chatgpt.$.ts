import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/chatgpt/$")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("../server/chatgpt-mcp")).handleChatGptRequest(request),
      POST: async ({ request }) =>
        (await import("../server/chatgpt-mcp")).handleChatGptRequest(request),
    },
  },
});
