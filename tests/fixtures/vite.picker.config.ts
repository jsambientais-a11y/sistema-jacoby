import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// Dedicated fixture server: no TanStack SSR, env files, auth or Supabase client.
export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  envDir: false,
  cacheDir: "node_modules/.vite-invoice-picker-qa",
  optimizeDeps: { entries: ["tests/fixtures/invoice-file-picker.html"] },
  envPrefix: "JACOBY_QA_",
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  plugins: [react(), tailwindcss()],
  server: { host: "127.0.0.1", port: 5176, strictPort: true },
});
