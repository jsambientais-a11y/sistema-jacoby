import { BillingEmailRecipientsPreview } from "../../src/components/BillingEmailRecipientsPreview";
import { hasConfirmedBillingCopy } from "../../src/lib/billing-email-copy-status";
// Local-only regression fixture. No auth session, database client, upload or email is used.
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BillingInvoiceFilePicker } from "../../src/components/BillingInvoiceFilePicker";
import { BillingButton, BillingReadOnlyProvider } from "../../src/components/BillingReadOnly";
import { mayAppendFinalizedInvoice, mayCreateBulletin } from "../../src/lib/billing-invoice-access";
import "../../src/styles.css";
const profiles = {
  open: {
    permissions: ["billing", "billing_lock_finalized"],
    status: "draft",
    client: false,
    published: false,
  },
  finalizedDenied: {
    permissions: ["billing", "billing_lock_finalized"],
    status: "closed",
    client: false,
    published: false,
  },
  finalizedAppend: {
    permissions: ["billing", "billing_lock_finalized", "billing_append_finalized_invoice"],
    status: "closed",
    client: false,
    published: false,
  },
  publishedAppend: {
    permissions: ["billing", "billing_lock_finalized", "billing_append_finalized_invoice"],
    status: "closed",
    client: false,
    published: true,
  },
  client: {
    permissions: ["billing", "billing_lock_finalized", "billing_append_finalized_invoice"],
    status: "closed",
    client: true,
    published: true,
  },
  noBilling: {
    permissions: ["billing_lock_finalized", "billing_append_finalized_invoice"],
    status: "closed",
    client: false,
    published: false,
  },
  admin: { permissions: ["billing"], status: "closed", client: false, published: true },
};
export function Fixture() {
  const [profile, setProfile] = useState<keyof typeof profiles>("open");
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(0);
  const [copyMode, setCopyMode] = useState("unknown");
  const copies =
    copyMode === "unknown" ? null : copyMode === "confirmed" ? ["js.ambientais@gmail.com"] : [];
  const input = useRef<HTMLInputElement>(null);
  const current = profiles[profile];
  const billing = current.permissions.includes("billing") && !current.client;
  const locked =
    current.permissions.includes("billing_lock_finalized") && current.status === "closed";
  const mayAppend = mayAppendFinalizedInvoice(current.permissions, billing, current.client);
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-8">
      <h1 className="text-2xl font-bold">QA local — seletor de notas</h1>
      <p>
        Dados e perfis fictícios. Este teste não realiza uploads, publicações, emails ou alterações
        de permissões.
      </p>
      <label>
        Perfil isolado{" "}
        <select
          aria-label="Perfil isolado"
          value={profile}
          onChange={(event) => setProfile(event.target.value as keyof typeof profiles)}
          className="border p-2"
        >
          {Object.keys(profiles).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <p data-testid="profile-state">
        status={current.status}; publicado={String(current.published)}; readonly={String(locked)};
        anexar={String(mayAppend)}
      </p>
      <label>
        <input
          type="checkbox"
          aria-label="Gravação em andamento"
          checked={busy}
          onChange={(event) => setBusy(event.target.checked)}
        />{" "}
        Gravação em andamento (simulada)
      </label>
      <BillingReadOnlyProvider value={locked}>
        <BillingButton
          allowReadOnly
          type="button"
          disabled={!mayCreateBulletin(billing, current.client)}
          onClick={() => setCreated((value) => value + 1)}
        >
          Cadastrar novo BM (simulado)
        </BillingButton>
        <p>Cadastros simulados: {created}</p>
        <section className="space-y-2 rounded border p-4">
          <h2>Arquivos gerais do BM</h2>
          <BillingInvoiceFilePicker
            label="Anexar arquivo ao BM"
            inputRef={input}
            allowReadOnly={mayAppend}
            disabled={!billing || (locked && !mayAppend) || busy}
            blockedReason="Ação indisponível neste perfil ou durante gravação."
            onFile={(file) => {
              setEvents((previous) => [...previous, `BM: ${file.name}`]);
            }}
          />
        </section>
        <section className="space-y-2 rounded border p-4">
          <h2>Arquivo de faturamento — linha do serviço</h2>
          {locked ? (
            <BillingButton
              type="button"
              allowReadOnly={mayAppend}
              disabled={!mayAppend || busy}
              onClick={() => {
                if (mayAppend && input.current && !input.current.disabled) input.current.click();
              }}
            >
              Anexar nova nota ao BM
            </BillingButton>
          ) : (
            <BillingInvoiceFilePicker
              label="Anexar arquivo de faturamento"
              disabled={!billing || busy}
              onFile={(file) => {
                setEvents((previous) => [...previous, `Serviço: ${file.name}`]);
              }}
            />
          )}
          <BillingButton type="button">Alterar valor do serviço</BillingButton>
          <BillingButton type="button">Publicar BM</BillingButton>
        </section>
      </BillingReadOnlyProvider>
      <section className="space-y-2 rounded border p-4">
        <label>
          Resposta fictícia de CC{" "}
          <select
            aria-label="Resposta fictícia de CC"
            value={copyMode}
            onChange={(event) => setCopyMode(event.target.value)}
          >
            <option value="unknown">Não informado pelo servidor</option>
            <option value="empty">CC vazio</option>
            <option value="confirmed">Juliana confirmada</option>
          </select>
        </label>
        <BillingEmailRecipientsPreview
          recipients={["cliente@example.invalid"]}
          copies={copies}
          outsourcedIssuer={null}
        />
        <button
          type="button"
          disabled={!hasConfirmedBillingCopy(["cliente@example.invalid"], copies)}
        >
          Confirmar envio (simulado, sem ação)
        </button>
      </section>
      <p data-testid="selection-count">Arquivos selecionados: {events.length}</p>
      <pre>{events.join("\n")}</pre>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
