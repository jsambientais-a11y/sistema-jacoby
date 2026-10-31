import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import releaseNotes from "@/lib/release-notes.json";
import { useAuth } from "@/hooks/use-auth";
import jacobySymbol from "@/assets/jacoby-symbol.svg";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RefreshCw, CheckCircle2, Sparkles, Check } from "lucide-react";
import { parseAppVersion, updateReloadUrl, updateStatus, type AppVersion, type ReleaseNotes } from "@/lib/app-update";

declare const __JACOBY_BUILD_ID__: string;

const UPDATE_TOAST_ID = "jacoby-app-update";
const SEEN_KEY = "jacoby-release-seen";
const SNOOZE_KEY = "jacoby-update-snooze";
const REMIND_AFTER_MS = 10 * 60 * 1000;
const UPDATE_TITLE = "● Nova versão · ";
const readStorage = (storage: "local" | "session", key: string) => {
  try { return (storage === "local" ? localStorage : sessionStorage).getItem(key); } catch { return null; }
};
const writeStorage = (storage: "local" | "session", key: string, value: string) => {
  try { (storage === "local" ? localStorage : sessionStorage).setItem(key, value); } catch { /* Storage may be disabled. */ }
};

export function AppUpdateBanner() {
  const { user, isClient } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
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
  const [remindTick, setRemindTick] = useState(0);
  const checkRef = useRef<() => void>(() => {});
  const lastCheck = useRef(0);
  useEffect(() => {
    // HMR already updates local development. Only compare published builds.
    if (import.meta.env.DEV) return;
    let disposed = false;
    let checking = false;
    let controller: AbortController | null = null;
    const check = async () => {
      if (checking || document.visibilityState === "hidden" || !navigator.onLine) return;
      checking = true;
      lastCheck.current = Date.now();
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10000);
      try {
        const base = import.meta.env.BASE_URL || "/";
        const response = await fetch(`${base}app-version.json?t=${Date.now()}`, {cache:"no-store",signal:controller.signal});
        if (!response.ok) return;
        const version = parseAppVersion(await response.json());
        if (!disposed && version) { setChecked(true); setAvailable(version.id !== __JACOBY_BUILD_ID__ ? version : null); }
      } catch { /* Offline or unavailable deployment: preserve current work. */ }
      finally { window.clearTimeout(timeout); checking = false; setRemindTick(tick => tick + 1); }
    };
    checkRef.current = () => void check();
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
  // Quem está usando o sistema também é avisado ao trocar de tela (no máximo a cada 20 s).
  useEffect(() => {
    if (Date.now() - lastCheck.current > 20000) checkRef.current();
  }, [pathname]);
  const localPreview = import.meta.env.DEV;
  const status = updateStatus(Boolean(available), localPreview, localUpdated, checked);
  const needsUpdate = status === "available";
  const reload = useCallback(async () => {
    setReloading(true); setError("");
    try {
      // Unique URL bypasses cached HTML; JS/CSS already have content hashes.
      // Verify connectivity before leaving the current editing session.
      const target = updateReloadUrl(window.location.href,available?.id || __JACOBY_BUILD_ID__);
      const response = await fetch(target,{cache:"reload",headers:{Accept:"text/html"},signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error();
      if (localPreview) writeStorage("session","jacoby-update-preview",releaseNotes.version);
      window.location.replace(target);
    } catch {
      setError("Não foi possível atualizar agora. Verifique a conexão e tente novamente.");
      setReloading(false);
    }
  }, [available?.id, localPreview]);
  const notes: ReleaseNotes = available?.releaseNotes || releaseNotes;

  // Notificação ativa de nova versão: aparece mesmo sem a pessoa olhar o topo da tela
  // e volta a lembrar 10 minutos depois de fechada, até que o sistema seja atualizado.
  useEffect(() => {
    if (!available || !user) { toast.dismiss(UPDATE_TOAST_ID); return; }
    const snoozedUntil = Number(readStorage("session", `${SNOOZE_KEY}:${available.id}`) || 0);
    if (snoozedUntil > Date.now()) return;
    toast("Nova versão do sistema disponível", {
      id: UPDATE_TOAST_ID,
      description: `${notes.title}. Salve o que estiver editando e atualize.`,
      duration: Infinity,
      icon: <Sparkles className="h-4 w-4 text-amber-500" />,
      action: { label: "Atualizar agora", onClick: () => void reload() },
      cancel: { label: "Ver novidades", onClick: () => setDetailsOpen(true) },
      onDismiss: () => writeStorage("session", `${SNOOZE_KEY}:${available.id}`, String(Date.now() + REMIND_AFTER_MS)),
    });
  }, [available, user, notes.title, reload, remindTick]);

  // Título da aba sinaliza a nova versão, para quem está em outra aba ou janela.
  useEffect(() => {
    if (!available) return;
    const apply = () => { if (!document.title.startsWith(UPDATE_TITLE)) document.title = UPDATE_TITLE + document.title; };
    apply();
    const titleNode = document.querySelector("title");
    const observer = new MutationObserver(apply);
    if (titleNode) observer.observe(titleNode, { childList: true });
    return () => { observer.disconnect(); document.title = document.title.replace(UPDATE_TITLE, ""); };
  }, [available]);

  // Depois de atualizar, a equipe vê as novidades uma vez por versão.
  useEffect(() => {
    if (!user || isClient || readStorage("local", SEEN_KEY) === releaseNotes.version) return;
    writeStorage("local", SEEN_KEY, releaseNotes.version);
    const timer = window.setTimeout(() => setDetailsOpen(true), 1200);
    return () => window.clearTimeout(timer);
  }, [user, isClient]);

  const sections = notes.sections || [];
  const base = import.meta.env.BASE_URL || "/";
  return <>{headerTarget && createPortal(<aside aria-label="Atualizações do sistema" className="relative shrink-0">
    <div className={`inline-flex items-center gap-1 rounded-full border p-0.5 transition-colors ${needsUpdate ? "jacoby-update-blink border-amber-500 bg-amber-200 text-amber-950 shadow-md" : "border-primary/25 bg-accent/60 text-accent-foreground"}`}>
      <button type="button" onClick={() => setDetailsOpen(true)} className="inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-xs font-bold transition hover:bg-black/5" title="Ver as novidades desta versão">
        {needsUpdate ? <Sparkles className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        {needsUpdate ? "Nova atualização!" : status === "current" ? "Novidades" : "Verificando versão"}
        <span className="hidden font-normal tabular-nums sm:inline">{releaseNotes.version}</span>
      </button>
      <span className="h-4 border-l border-current opacity-20" aria-hidden="true" />
      <button type="button" disabled={reloading} onClick={() => void reload()} aria-label={localPreview ? "Recarregar prévia local" : "Atualizar sistema agora"} title="Salve sua edição antes de atualizar" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-current opacity-70 transition hover:bg-black/5 hover:opacity-100 disabled:opacity-50">
        <RefreshCw className={`h-3.5 w-3.5 ${reloading ? "animate-spin" : ""}`} />
      </button>
    </div>
    {error && <p role="alert" className="absolute right-0 top-full mt-2 w-64 rounded-lg border bg-background p-2 text-xs text-destructive shadow-sm">{error}</p>}
    <span role="status" aria-live="polite" className="sr-only">{needsUpdate ? "Nova atualização disponível. Salve sua edição antes de atualizar." : status === "current" ? "Você está na versão atual do sistema." : "Verificando atualizações."}</span>
  </aside>, headerTarget)}
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#14532d] to-primary px-6 pb-6 pt-7 text-white sm:px-8">
          <div className="absolute inset-x-0 bottom-0 flex h-1"><span className="w-3/4 bg-[#2fae4e]" /><span className="w-1/4 bg-[#f5a623]" /></div>
          <div className="flex items-start gap-4">
            <span className="hidden h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white p-1.5 shadow-md sm:grid"><img src={jacobySymbol} alt="" className="h-full w-full object-contain" /></span>
            <div className="min-w-0">
              <span className="inline-flex rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums">Versão {notes.version || releaseNotes.version}</span>
              <DialogTitle className="mt-2 text-2xl font-bold leading-tight text-white">{notes.title}</DialogTitle>
              <DialogDescription className="mt-1.5 max-w-2xl text-sm text-white/80">{notes.summary}</DialogDescription>
            </div>
          </div>
          {sections.length > 0 && <nav className="mt-5 flex flex-wrap gap-2" aria-label="Seções da atualização">
            {sections.map((section, index) => <a key={section.title} href={`#novidade-${index}`} className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/20 transition hover:bg-white/20">{section.title}</a>)}
          </nav>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {sections.length ? <div className="space-y-10">
            {sections.map((section, index) => <section key={section.title} id={`novidade-${index}`} className="scroll-mt-4 animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}>
              <div className="flex items-baseline gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-bold text-primary tabular-nums">{index + 1}</span>
                <div>
                  <h3 className="text-lg font-bold">{section.title}</h3>
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                </div>
              </div>
              {section.image && <img className="mt-4 w-full rounded-xl border shadow-sm" src={`${base}${section.image}`} alt={section.imageAlt || section.title} loading="lazy" />}
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {section.items.map((item) => <li key={item} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>
                  <span>{item}</span>
                </li>)}
              </ul>
            </section>)}
          </div> : <>
            <img className="w-full rounded-xl border" src={`${base}${notes.image}`} alt={notes.imageAlt} />
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">{notes.changes.map(change => <li key={change}>{change}</li>)}</ul>
          </>}
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t bg-muted/40 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-xs text-muted-foreground">{needsUpdate ? "Salve as alterações em andamento antes de atualizar." : status === "current" ? "Você está usando a versão atual. Quando houver uma nova, o sistema avisa por aqui." : "Consultando se há uma nova versão disponível."}{localPreview && " Ambiente local · não publicado."}</p>
          <button type="button" disabled={reloading} onClick={() => needsUpdate || localPreview ? void reload() : setDetailsOpen(false)} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60">
            {needsUpdate ? <RefreshCw className={`h-4 w-4 ${reloading ? "animate-spin" : ""}`} /> : <Check className="h-4 w-4" />}
            {reloading ? "Atualizando…" : needsUpdate ? "Atualizar agora" : localPreview ? "Recarregar sistema" : "Entendi"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
