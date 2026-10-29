import { useEffect, useState } from "react";
import { useIsoWorkspace } from "./IsoWorkspace";
import { listIsoMembers, setIsoMember, isoRemoteError } from "@/lib/iso-remote";
import { toast } from "sonner";
export function IsoAccessPanel() {
  const ws = useIsoWorkspace();
  const [members, setMembers] = useState<{ email: string; access: string }[]>([]);
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const load = () =>
    listIsoMembers()
      .then(setMembers)
      .catch((e) => toast.error(isoRemoteError(e)));
  useEffect(() => {
    if (ws.remote && ws.access === "admin") void load();
  }, [ws.remote, ws.access]);
  if (!ws.remote || ws.access !== "admin") return null;
  const grant = async () => {
    setBusy(true);
    try {
      await setIsoMember(email, access);
      await load();
      setEmail("");
      toast.success("Permissão atualizada no servidor.");
    } catch (e) {
      toast.error(isoRemoteError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border bg-white p-5">
      <h2 className="font-bold">Acesso ao ISO compartilhado</h2>
      <p className="text-sm text-slate-600">
        Administradoras têm acesso completo. Autorize somente contas internas já cadastradas. Contas
        de clientes são bloqueadas pelo banco.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="E-mail da conta interna"
          className="rounded border p-2"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail da conta interna"
        />
        <select
          aria-label="Permissão ISO"
          className="rounded border p-2"
          value={access}
          onChange={(e) => setAccess(e.target.value)}
        >
          <option value="viewer">Somente leitura</option>
          <option value="editor">Editar</option>
          <option value="remove">Remover acesso</option>
        </select>
        <button
          className="rounded bg-green-800 px-3 text-white disabled:opacity-50"
          disabled={busy || !email.includes("@")}
          onClick={() => void grant()}
        >
          Salvar permissão
        </button>
      </div>
      {members.map((m) => (
        <div className="flex justify-between border-t pt-2 text-sm" key={m.email}>
          <span>{m.email}</span>
          <span>{m.access === "editor" ? "Edição" : "Leitura"}</span>
        </div>
      ))}
    </section>
  );
}
