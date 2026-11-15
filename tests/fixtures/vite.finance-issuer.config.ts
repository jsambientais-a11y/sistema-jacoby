import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
const mock = fileURLToPath(new URL("./finance-issuer-mocks.ts", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  envDir: false,
  envPrefix: "JACOBY_QA_",
  cacheDir: "node_modules/.vite-finance-issuer-qa",
  optimizeDeps: { entries: ["tests/fixtures/finance-issuer.html"] },
  resolve: {
    alias: [
      ...[
        "use-finance-accounts",
        "use-finance-recurrences",
        "use-credit-cards",
        "use-cost-centers",
        "use-receipt-details",
        "use-billing-flow",
      ].map((name) => ({ find: `@/hooks/${name}`, replacement: mock })),
      { find: "@/integrations/supabase/client", replacement: mock },
      { find: "@", replacement: fileURLToPath(new URL("../../src", import.meta.url)) },
    ],
  },
  plugins: [react(), tailwindcss()],
  server: { host: "127.0.0.1", port: 5177, strictPort: true },
});
