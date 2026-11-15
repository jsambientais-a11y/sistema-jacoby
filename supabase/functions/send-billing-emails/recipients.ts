export const BILLING_COPY_EMAIL = "js.js.ambientais@gmail.com";
export function billingEmailRecipients(recipient: string) {
  const to = [recipient.trim().toLowerCase()];
  return { to, cc: to.includes(BILLING_COPY_EMAIL) ? [] : [BILLING_COPY_EMAIL] };
}

/** Preview the same per-message policy used by the dispatcher, including TO = Juliana. */
export function billingEmailPreviewRecipients(recipients: string[]) {
  const messages = recipients.map(billingEmailRecipients);
  return {
    recipients: messages.flatMap((message) => message.to),
    cc: [...new Set(messages.flatMap((message) => message.cc))],
  };
}
