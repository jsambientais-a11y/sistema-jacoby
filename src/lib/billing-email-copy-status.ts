export const REQUIRED_BILLING_COPY = "js.ambientais@gmail.com";
export function hasConfirmedBillingCopy(recipients: string[], copies: string[] | null) {
  if (copies === null || !recipients.length) return false;
  const copied = copies.some(
    (email) => typeof email === "string" && email.trim().toLowerCase() === REQUIRED_BILLING_COPY,
  );
  return recipients.every(
    (email) => email.trim().toLowerCase() === REQUIRED_BILLING_COPY || copied,
  );
}
