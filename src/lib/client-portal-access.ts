/** Operações administrativas sobre os logins do Portal do Cliente. */
import { supabase } from "@/integrations/supabase/client";
import type { PortalLoginDraft } from "@/lib/client-portal-rules";

export type PortalLogin = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  access_enabled: boolean;
  last_sign_in_at: string | null;
  password_note: string | null;
  password_note_updated_at: string | null;
};

export const portalAccessKey = (clientId: string) => ["client_portal_access", clientId];

export async function invokeAdminUserAccess(
  action: "create" | "update" | "impersonate_client",
  data: Record<string, unknown>,
) {
  const { data: result, error } = await supabase.functions.invoke("admin-user-access", {
    body: { action, data },
  });
  if (error) {
    const response = (error as any).context;
    if (response && typeof response.json === "function") {
      const payload = await response.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    }
    throw error;
  }
  if (result?.error) throw new Error(result.error);
  return result;
}

async function callRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw error;
  return data;
}

export async function listPortalLogins(clientId: string) {
  const rows = await callRpc("admin_list_client_portal_access", { target_client_id: clientId });
  return (rows ?? []) as PortalLogin[];
}

export const savePortalPasswordNote = (userId: string, note: string) =>
  callRpc("admin_set_client_portal_password_note", { target_user_id: userId, new_note: note });

export const setPortalAccessEnabled = (userId: string, enabled: boolean) =>
  callRpc("admin_set_client_portal_access", { target_user_id: userId, enabled });

export async function resetPortalPassword(userId: string, password: string, keepNote: boolean) {
  await callRpc("admin_reset_user_password", { target_user_id: userId, new_password: password });
  if (keepNote) await savePortalPasswordNote(userId, password);
}

export async function updatePortalLogin(login: PortalLogin, fullName: string, email: string) {
  await callRpc("admin_update_client_profile_name", {
    target_user_id: login.user_id,
    new_full_name: fullName.trim(),
  });
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail !== (login.email ?? "").toLowerCase()) {
    await callRpc("admin_update_client_email", {
      target_user_id: login.user_id,
      new_email: normalizedEmail,
    });
  }
}

export async function createPortalLogin(clientId: string, draft: PortalLoginDraft) {
  const { userId } = await invokeAdminUserAccess("create", {
    fullName: draft.fullName.trim(),
    email: draft.email.trim().toLowerCase(),
    password: draft.password,
    role: "client",
    permissions: ["portal"],
    clientId,
  });
  if (draft.keepPasswordNote) await savePortalPasswordNote(userId, draft.password);
}
