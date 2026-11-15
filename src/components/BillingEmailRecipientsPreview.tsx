import { hasConfirmedBillingCopy, REQUIRED_BILLING_COPY } from "@/lib/billing-email-copy-status";
type Props = {
  recipients: string[];
  copies: string[] | null;
  outsourcedIssuer: { emails: string[]; companyName: string } | null;
};

/** Each card corresponds to one separate email, never a shared TO list. */
export function BillingEmailRecipientsPreview({ recipients, copies, outsourcedIssuer }: Props) {
  return (
    <div className="space-y-3">
      {recipients.length ? (
        <>
          {hasConfirmedBillingCopy(recipients, copies) ? (
            <p role="status" className="text-sm font-medium">
              {copies?.some((email) => email.trim().toLowerCase() === REQUIRED_BILLING_COPY)
                ? `Cópia confirmada pelo servidor: ${REQUIRED_BILLING_COPY}`
                : `Juliana já é destinatária principal: ${REQUIRED_BILLING_COPY}. Não haverá cópia adicional na mesma mensagem.`}
            </p>
          ) : (
            <p role="alert" className="text-sm text-destructive">
              O servidor não confirmou a cópia para Juliana ({REQUIRED_BILLING_COPY}). O envio não
              pode ser confirmado até a configuração ser verificada.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Cada destinatário recebe um e-mail separado. Quando confirmado, o CC acompanha cada
            mensagem; por isso, Juliana pode receber várias cópias do mesmo BM. Novas tentativas de
            envio também mantêm o CC confirmado.
          </p>
          {recipients.map((recipient) => {
            const email = recipient.trim().toLowerCase();
            const cc = copies?.filter((copy) => copy.trim().toLowerCase() !== email);
            return (
              <div key={email} className="space-y-1 rounded border p-2">
                <p>
                  <strong>Para:</strong> {email}
                </p>
                {outsourcedIssuer?.emails.some((value) => value.trim().toLowerCase() === email) && (
                  <p className="text-xs text-muted-foreground">
                    Terceirizada emissora: {outsourcedIssuer.companyName}
                  </p>
                )}
                <p>
                  <strong>CC:</strong>{" "}
                  {cc == null
                    ? "Não informado pelo servidor; confira a configuração antes de enviar."
                    : cc.length
                      ? cc.join(", ")
                      : "Nenhuma cópia adicional nesta mensagem."}
                </p>
              </div>
            );
          })}
        </>
      ) : (
        <p className="text-amber-700">
          Nenhum e-mail válido foi encontrado no cadastro do cliente, nos logins vinculados ou na
          terceirizada emissora. Cadastre um destinatário antes de enviar.
        </p>
      )}
      {outsourcedIssuer && outsourcedIssuer.emails.length === 0 && (
        <p className="text-amber-700">
          A terceirizada emissora {outsourcedIssuer.companyName} não possui e-mail válido cadastrado
          e não receberá este envio.
        </p>
      )}
    </div>
  );
}
