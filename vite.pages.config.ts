import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouterGenerator } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

import { appVersion, appVersionPlugin } from "./build/app-version";

export default defineConfig({
  // GitHub Pages serves project sites under /<repo-name>/.
  // Keep this in sync with the repository name, otherwise asset URLs break and the page opens blank.
  base: "/sistema-jacoby/",
  define: {
    __JACOBY_BUILD_ID__: JSON.stringify(appVersion.id),
    // The app uses this flag to avoid TanStack Start server behavior in the static GitHub Pages build.
    "import.meta.env.VITE_GITHUB_PAGES": JSON.stringify("true"),
  },
  resolve: {
    alias: {
      "@tanstack/react-start/server": "/src/pages-react-start-stub.ts",
      "@tanstack/react-start": "/src/pages-react-start-stub.ts",
    },
  },
  // A publicação estática usa uma configuração própria; mantenha o gerador
  // de rotas aqui para que páginas novas (como /portal/conta) façam parte do bundle.
  plugins: [appVersionPlugin(), tanstackRouterGenerator(), react(), tailwindcss(), tsconfigPaths()],
  build: {
    // Static files are generated here first, then scripts/prepare-gh-pages.mjs renames the entry file.
    outDir: ".gh-pages-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.pages.html",
    },
  },
});
