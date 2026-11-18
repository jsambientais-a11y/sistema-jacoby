import { rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// O Capacitor procura dist-app/index.html; o Vite gera com o nome da entrada.
const dir = path.resolve("dist-app");
if (!existsSync(path.join(dir, "index.app.html"))) throw new Error("Build do app não encontrado.");
await rename(path.join(dir, "index.app.html"), path.join(dir, "index.html"));
console.log("dist-app pronto para o Capacitor");
