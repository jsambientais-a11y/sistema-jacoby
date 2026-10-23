import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import releaseNotes from "@/lib/release-notes.json";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RefreshCw, CheckCircle2, Sparkles } from "lucide-react";
import { parseAppVersion, updateReloadUrl, updateStatus, type AppVersion } from "@/lib/app-update";

declare const __JACOBY_BUILD_ID__: string;

export function AppUpdateBanner() {
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const [checked, setChecked] = useState(false);
  const [localUpdated, setLocalUpdated] = useState(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    try { setLocalUpdated(sessionStorage.getItem("jacoby-update-preview") === releaseNotes.version); } catch { /* Storage may be disabled. */ }
    if (new URLSearchParams(window.location.search).get("_jacobyUpdate") === __JACOBY_BUILD_ID__) setLocalUpdated(true);
  }, []);
  useEffect(() => {
    const locate = () => {
      const target = window.innerWidth < 768
        ? document.getElementById("app-updates-mobile") || document.getElementById("app-updates-desktop")
        : document.getElementById("app-updates-desktop");
      setHeaderTarget(current => current === target ? current : target);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, {childList:true,subtree:true});
    window.addEventListener("resize",locate);
    return () => { observer.disconnect(); window.removeEventListener("resize",locate); };
  }, []);
  const [available, setAvailable] = useState<AppVersion | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    // HMR already updates local development. Only compare published builds.
    if (import.meta.env.DEV) return;
    let disposed = false;
    let checking = false;
    let controller: AbortController | null = null;
    const check = async () => {
      if (checking || document.visibilityState === "hidden" || !navigator.onLine) return;
      checking = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10000);
      try {
        const base = import.meta.env.BASE_URL || "/";
        const response = await fetch(`${base}app-version.json?t=${Date.now()}`, {cache:"no-store",signal:controller.signal});
        if (!response.ok) return;
        const version = parseAppVersion(await response.json());
        if (!disposed && version) { setChecked(true); setAvailable(version.id !== __JACOBY_BUILD_ID__ ? version : null); }
      } catch { /* Offline or unavailable deployment: preserve current work. */ }
      finally { window.clearTimeout(timeout); checking = false; }
    };
    void check();
    const timer = window.setInterval(check,60000);
    window.addEventListener("focus",check);
    window.addEventListener("online",check);
    document.addEventListener("visibilitychange",check);
    return () => {
      disposed = true; controller?.abort(); window.clearInterval(timer);
      window.removeEventListener("focus",check); window.removeEventListener("online",check);
      document.removeEventListener("visibilitychange",check);
    };
  },[]);
  const localPreview = import.meta.env.DEV;
  const status = updateStatus(Boolean(available), localPreview, localUpdated, checked);
  const needsUpdate = status === "available";
  const reload = async () => {
    setReloading(true); setError("");
    try {
      // Unique URL bypasses cached HTML; JS/CSS already have content hashes.
      // Verify connectivity before leaving the current editing session.
      const target = updateReloadUrl(window.location.href,available?.id || __JACOBY_BUILD_ID__);
      const response = await fetch(target,{cache:"reload",headers:{Accept:"text/html"},signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error();
      if (localPreview) {
        try { sessionStorage.setItem("jacoby-update-preview",releaseNotes.version); } catch { /* URL also preserves the completed preview. */ }
      }
      window.location.replace(target);
    } catch {
      setError("Não foi possível atualizar agora. Verifique a conexão e tente novamente.");
      setReloading(false);
    }
  };
  const notes = available?.releaseNotes || releaseNotes;
  return <>{headerTarget && createPortal(<aside aria-label="Atualizações do sistema" className="relative shrink-0">
    <div className={`inline-flex items-center gap-1 rounded-full border p-0.5 ${needsUpdate ? "jacoby-update-blink border-amber-500 bg-amber-200 text-amber-950 shadow-md" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
      <button type="button" onClick={() => setDetailsOpen(true)} className="inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-xs font-bold hover:bg-black/5" title="Ver o resumo da atualização">
        {needsUpdate ? <Sparkles className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        {needsUpdate ? "Nova atualização!" : status === "current" ? "Versão atual" : "Verificando versão"}
        <span className="hidden font-normal sm:inline">{releaseNotes.version}</span>
      </button>
      <span className="h-4 border-l" aria-hidden="true" />
      <button type="button" disabled={reloading} onClick={() => void reload()} aria-label={localPreview ? "Recarregar prévia local" : "Atualizar sistema agora"} title="Salve sua edição antes de atualizar" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
        <RefreshCw className={`h-3.5 w-3.5 ${reloading ? "animate-spin" : ""}`} />
      </button>
    </div>
    {error && <p role="alert" className="absolute right-0 top-full mt-2 w-64 rounded-lg border bg-background p-2 text-xs text-destructive shadow-sm">{error}</p>}
    <span role="status" aria-live="polite" className="sr-only">{needsUpdate ? "Nova atualização disponível. Salve sua edição antes de atualizar." : status === "current" ? "Você está na versão atual do sistema." : "Verificando atualizações."}</span>
  </aside>, headerTarget)}
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogTitle>{notes.title}</DialogTitle>
        <DialogDescription>Versão {notes.version || releaseNotes.version} · {notes.summary}</DialogDescription>
        <img className="w-full rounded-xl border" src={`${import.meta.env.BASE_URL || "/"}${notes.image}`} alt={notes.imageAlt} />
        <ul className="list-disc space-y-2 pl-5 text-sm">{notes.changes.map(change => <li key={change}>{change}</li>)}</ul>
        <p className="text-xs text-muted-foreground">{needsUpdate ? "Salve as alterações em andamento antes de atualizar." : status === "current" ? "Você está usando a versão atual. O aviso voltará a piscar quando houver uma nova atualização." : "Consultando se há uma nova versão disponível."}{localPreview && " Ambiente local · não publicado."}</p>
        <button type="button" disabled={reloading} onClick={() => void reload()} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{reloading ? "Atualizando…" : needsUpdate ? "Atualizar agora" : "Recarregar sistema"}</button>
      </DialogContent>
    </Dialog>
  </>;
}
