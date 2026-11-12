/**
 * "Entrar como cliente": o administrador abre o portal com a sessão do cliente,
 * sem usar senha, e volta para a própria conta sem precisar logar de novo.
 */
import { supabase } from "@/integrations/supabase/client";
import { invokeAdminUserAccess } from "@/lib/client-portal-access";

const backupKey = "jacoby-admin-session-backup";

type AdminSessionBackup = { access_token: string; refresh_token: string };

function readBackup(): AdminSessionBackup | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(backupKey) ?? "null");
  } catch {
    return null;
  }
}

export const isImpersonatingClient = () => readBackup() !== null;

function openApp(path: string) {
  // Recarrega a página para nenhuma tela manter dados da conta anterior.
  window.location.assign(`${import.meta.env.BASE_URL}${path}`);
}

export async function startClientImpersonation(userId: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sessão de administrador não encontrada.");
  const { tokenHash } = await invokeAdminUserAccess("impersonate_client", { userId });
  // A tentativa pode ter renovado a sessão e rotacionado o refresh token.
  const { data: current, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !current.session || current.session.user.id !== data.session.user.id) {
    throw new Error("A sessão de administrador mudou. Atualize a página e tente novamente.");
  }

  const backup: AdminSessionBackup = {
    access_token: current.session.access_token,
    refresh_token: current.session.refresh_token,
  };
  localStorage.setItem(backupKey, JSON.stringify(backup));
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (error) {
    localStorage.removeItem(backupKey);
    throw error;
  }
  openApp("portal/movimentacoes");
}

export async function stopClientImpersonation() {
  const backup = readBackup();
  // scope local: o padrão encerraria também a sessão real do cliente, em outro aparelho.
  await supabase.auth.signOut({ scope: "local" });
  localStorage.removeItem(backupKey);
  if (backup) await supabase.auth.setSession(backup);
  openApp("clients");
}
