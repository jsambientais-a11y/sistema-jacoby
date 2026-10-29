import { useEffect, useRef, useState } from "react";
import {
  openIsoRemote,
  saveIsoRemote,
  isoRemoteError,
  type IsoRemoteSnapshot,
} from "@/lib/iso-remote";
import { IsoSyncQueue } from "@/lib/iso-sync-queue";
import { parseIsoState, type IsoLocalState } from "@/lib/iso-local-state";
export function useIsoServerSync({
  enabled,
  userId,
  storageKey,
  setState,
  setError,
  loaded,
  initial,
}: {
  enabled: boolean;
  userId: string | undefined;
  storageKey: string;
  setState: (s: IsoLocalState) => void;
  setError: (s: string) => void;
  loaded: () => void;
  initial: () => IsoLocalState;
}) {
  const [snapshot, setSnapshot] = useState<IsoRemoteSnapshot | null>(null);
  const [status, setStatus] = useState("Conectando ao servidor…");
  const [reload, setReload] = useState(0);
  const queue = useRef<IsoSyncQueue<IsoLocalState> | null>(null);
  const current = useRef({ setState, setError, loaded, initial });
  current.current = { setState, setError, loaded, initial };
  const failed = useRef(false);
  const busy = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setSnapshot(null);
    failed.current = false;
    setStatus("Conectando ao servidor…");
    queue.current?.stop();
    queue.current = null;
    const hydrate = async () => {
      try {
        if (!userId || !/^[-a-f0-9]{36}$/i.test(userId))
          throw new Error("Entre com sua conta da Jacoby para acessar o ISO compartilhado.");
        const remote = await openIsoRemote();
        if (!active) return;
        setSnapshot(remote);
        const meta = JSON.parse(localStorage.getItem(`${storageKey}:sync`) || "null") as {
          pending?: boolean;
          revision?: number;
        } | null;
        const cached = localStorage.getItem(storageKey);
        let next = remote.state || current.current.initial();
        const pending = meta?.pending && cached ? parseIsoState(cached) : null;
        if (pending) {
          next = pending;
          if (meta?.revision !== remote.revision || remote.access === "viewer")
            throw new Error("ISO_REVISION_CONFLICT");
        }
        const selectedId = localStorage.getItem(`${storageKey}:selection`);
        if (selectedId && next.audits.some((a) => a.id === selectedId))
          next = { ...next, selectedId };
        current.current.setState(next);
        current.current.setError("");
        const q = new IsoSyncQueue<IsoLocalState>(
          remote.revision,
          (rev, value) => saveIsoRemote(remote.id, rev, value),
          (value, revision) => {
            if (!active) return;
            // Não sinalizar "salvo" enquanto uma edição posterior está na fila.
            const latest = localStorage.getItem(storageKey);
            const signature = (v: IsoLocalState) => JSON.stringify({ ...v, selectedId: "" });
            const pending = latest ? signature(parseIsoState(latest)) !== signature(value) : false;
            localStorage.setItem(`${storageKey}:sync`, JSON.stringify({ revision, pending }));
            setSnapshot((s) => (s ? { ...s, revision, state: value } : s));
            setStatus(pending ? "Salvando no servidor…" : "Salvo no servidor");
          },
          (error) => {
            if (!active) return;
            failed.current = true;
            current.current.setError(isoRemoteError(error));
            setStatus("Sincronização interrompida · cópia preservada");
          },
        );
        queue.current = q;
        if (pending) {
          q.enqueue(next);
          setStatus("Salvando no servidor…");
        } else {
          localStorage.setItem(storageKey, JSON.stringify(next));
          localStorage.setItem(
            `${storageKey}:sync`,
            JSON.stringify({ revision: remote.revision, pending: false }),
          );
          setStatus(remote.access === "viewer" ? "Somente leitura" : "Salvo no servidor");
        }
      } catch (error) {
        if (active) {
          failed.current = true;
          current.current.setError(isoRemoteError(error));
          setStatus("ISO indisponível · edições bloqueadas");
          try {
            const cached = localStorage.getItem(storageKey);
            if (cached) current.current.setState(parseIsoState(cached));
          } catch {
            /* cópia bruta preservada */
          }
        }
      } finally {
        if (active) current.current.loaded();
      }
    };
    void hydrate();
    const unload = (event: BeforeUnloadEvent) => {
      if (queue.current?.busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    const timer = window.setInterval(async () => {
      if (!active || failed.current || !queue.current || queue.current.busy || busy.current) return;
      busy.current = true;
      try {
        const remote = await openIsoRemote();
        if (!active || queue.current?.busy) return;
        setSnapshot(remote);
        if (remote.revision !== queue.current.revision) {
          const next = remote.state || current.current.initial();
          const chosen = localStorage.getItem(`${storageKey}:selection`);
          if (chosen && next.audits.some((a) => a.id === chosen)) next.selectedId = chosen;
          current.current.setState(next);
          localStorage.setItem(storageKey, JSON.stringify(next));
          queue.current.revision = remote.revision;
          localStorage.setItem(
            `${storageKey}:sync`,
            JSON.stringify({ revision: remote.revision, pending: false }),
          );
        }
        current.current.setError("");
        setStatus(remote.access === "viewer" ? "Somente leitura" : "Salvo no servidor");
      } catch (error) {
        if (active) {
          failed.current = true;
          queue.current?.stop();
          current.current.setError(isoRemoteError(error));
          setStatus("Conexão interrompida · cópia preservada");
        }
      } finally {
        busy.current = false;
      }
    }, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("beforeunload", unload);
      queue.current?.stop();
      queue.current = null;
    };
  }, [enabled, userId, storageKey, reload]);
  const enqueue = (value: IsoLocalState) => {
    const q = queue.current;
    if (!q || failed.current || snapshot?.access === "viewer") return false;
    // Pending é durável ANTES do pedido de rede, permitindo recuperação após fechar a aba.
    localStorage.setItem(
      `${storageKey}:sync`,
      JSON.stringify({ revision: q.revision, pending: true }),
    );
    setStatus("Salvando no servidor…");
    q.enqueue(value);
    return true;
  };
  const reloadServer = () => {
    if (queue.current?.busy) return;
    const old = localStorage.getItem(storageKey);
    if (old) localStorage.setItem(`${storageKey}:recovery:${Date.now()}`, old);
    localStorage.removeItem(`${storageKey}:sync`);
    setReload((n) => n + 1);
  };
  return {
    snapshot,
    status,
    enqueue,
    reloadServer,
    canWrite: !enabled || (!!snapshot && snapshot.access !== "viewer" && !failed.current),
  };
}
