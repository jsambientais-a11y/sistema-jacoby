import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouterGenerator } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

import { appVersion, appVersionPlugin } from "./build/app-version";

// Build do aplicativo mobile (App Store / Play Store) via Capacitor.
// É a mesma versão estática do GitHub Pages, mas servida na raiz ("/") de dentro
// do app, sem o prefixo /sistema-jacoby/. Os dados continuam vindo do Supabase.
export default defineConfig({
  base: "/",
  define: {
    __JACOBY_BUILD_ID__: JSON.stringify(appVersion.id),
    "import.meta.env.VITE_GITHUB_PAGES": JSON.stringify("true"),
    // Dentro do app o roteador não usa prefixo.
    "import.meta.env.VITE_ROUTER_BASEPATH": JSON.stringify(""),
    // Links de e-mail (confirmação de conta, redefinição de senha) não conseguem
    // abrir o app; eles levam para a versão web publicada.
    "import.meta.env.VITE_PUBLIC_WEB_URL": JSON.stringify("https://ragcodebr.github.io/sistema-jacoby/"),
  },
  resolve: {
    alias: {
      "@tanstack/react-start/server": "/src/pages-react-start-stub.ts",
      "@tanstack/react-start": "/src/pages-react-start-stub.ts",
    },
  },
  plugins: [appVersionPlugin(), tanstackRouterGenerator(), react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: "dist-app",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.app.html",
    },
  },
});
