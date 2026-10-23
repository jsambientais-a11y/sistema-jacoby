import { randomUUID } from "node:crypto";
import type { Plugin } from "vite";
import releaseNotes from "../src/lib/release-notes.json";

// A single value is shared by the client constant and the public release manifest.
export const appVersion = { id: randomUUID(), builtAt: new Date().toISOString(), releaseNotes };
export function appVersionPlugin(): Plugin {
  return {
    name: "jacoby-app-version",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0]?.endsWith("/app-version.json")) {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(appVersion));
        } else next();
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "app-version.json", source: JSON.stringify(appVersion) });
    },
  };
}
