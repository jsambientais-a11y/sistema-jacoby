import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";

import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

// GitHub Pages hosts this repository under /sistema-jacoby.
// The router basepath must match vite.pages.config.ts.
// O app mobile (vite.app.config.ts) roda na raiz e define VITE_ROUTER_BASEPATH = "".
const router = getRouter(import.meta.env.VITE_ROUTER_BASEPATH ?? "/sistema-jacoby");

// No app Android, o botão "voltar" do aparelho volta uma tela no sistema
// em vez de fechar o app. Só carrega o plugin quando roda dentro do app.
if ((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
  void import("@capacitor/app").then(({ App }) => {
    void App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.exitApp();
    });
  });
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
