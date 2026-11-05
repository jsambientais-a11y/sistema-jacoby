/** Regras puras do acesso ao Portal do Cliente, sem dependência de tela ou banco. */

const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type PortalLoginDraft = {
  fullName: string;
  email: string;
  password: string;
  keepPasswordNote: boolean;
};

export const emptyPortalLogin: PortalLoginDraft = {
  fullName: "",
  email: "",
  password: "",
  keepPasswordNote: true,
};

/**
 * Logins de empresas visíveis em Clientes são geridos lá. Fica em Usuários só o
 * que não tem cadastro visível: a RAG, que é demonstrativa e oculta pelo banco, e
 * logins sem vínculo, que ainda precisam de alguém para corrigi-los.
 */
export function usersManagedInClients(
  links: { user_id: string; client_id: string }[],
  visibleClientIds: string[],
) {
  const visible = new Set(visibleClientIds);
  return new Set(links.filter((link) => visible.has(link.client_id)).map((link) => link.user_id));
}

export type PortalStatus = "enabled" | "disabled" | "none";

/** Uma empresa tem acesso se ao menos um login dela estiver ativo. */
export function portalStatusByClient(
  links: { user_id: string; client_id: string }[],
  disabledUserIds: string[],
) {
  const disabled = new Set(disabledUserIds);
  const status = new Map<string, PortalStatus>();
  for (const link of links) {
    const loginEnabled = !disabled.has(link.user_id);
    if (loginEnabled) status.set(link.client_id, "enabled");
    else if (!status.has(link.client_id)) status.set(link.client_id, "disabled");
  }
  return status;
}

export function portalLoginError(draft: PortalLoginDraft, passwordRequired = true) {
  if (draft.fullName.trim().length < 2) return "Informe o nome do responsável pelo acesso.";
  if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) return "Informe um e-mail de login válido.";
  if (passwordRequired && draft.password.length < 6) {
    return "A senha deve ter ao menos 6 caracteres.";
  }
  return null;
}

/** Senha sem caracteres ambíguos (0/O, 1/l), fácil de ditar ao cliente. */
export function generatePortalPassword(length = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join("");
}
