/**
 * Fonte única de autenticação e autorização da interface.
 * Expõe sessão, perfil, categoria (admin/colaborador/cliente) e permissões de navegação.
 */
import { restrictedFinancePermission } from "@/lib/finance-access";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  theme_preferences: Record<string, unknown> | null;
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  isCollaborator: boolean;
  isClient: boolean;
  clientId: string | null;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

// GitHub Pages can be opened before the new Supabase project is configured.
// In that narrow case, authentication stays only in this browser profile.
export const isStaticPreview =
  import.meta.env.VITE_GITHUB_PAGES === "true" && !import.meta.env.VITE_SUPABASE_URL;
const previewPermissions = [
  "dashboard",
  "tasks",
  "notes",
  "import_ata",
  "clients",
  "outsourced",
  "reports",
  "documents",
  "portal",
  "portal_units",
  "portal_reports",
  "billing",
  "movement_settings",
  "calendar",
  "users",
  "trash",
  "settings",
];
const localAccountsKey = "jacoby-local-accounts-v1";
const localSessionKey = "jacoby-local-session-v1";
const localAuthChanged = "jacoby-local-auth-changed";
const localDataKey = "jacoby-local-data-v1";

type LocalAccount = {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
};

function getLocalAccounts(): LocalAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(localAccountsKey) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function ensureLocalBoard() {
  try {
    const database = JSON.parse(localStorage.getItem(localDataKey) ?? "{}");
    if (!Array.isArray(database.kanban_columns) || database.kanban_columns.length === 0) {
      const columns = [
        ["A Fazer", "#64748b"],
        ["Em Andamento", "#f59e0b"],
        ["Aguardando Retorno", "#d4dd33"],
        ["Em Revisão", "#38bdf8"],
        ["Concluídas", "#22c55e"],
      ].map(([name, color], position) => ({
        id: `jacoby-local-column-${position}`,
        name,
        color,
        position,
        created_at: new Date().toISOString(),
      }));
      database.kanban_columns = columns;
      database.tasks = (database.tasks ?? []).map((task: Record<string, unknown>) =>
        task.column_id ? task : { ...task, column_id: columns[0].id },
      );
      localStorage.setItem(localDataKey, JSON.stringify(database));
    }
  } catch {
    // A malformed local cache is safely rebuilt as an empty board.
    localStorage.setItem(
      localDataKey,
      JSON.stringify({
        kanban_columns: [
          {
            id: "jacoby-local-column-0",
            name: "A Fazer",
            color: "#64748b",
            position: 0,
            created_at: new Date().toISOString(),
          },
        ],
        tasks: [],
      }),
    );
  }
}

async function hashLocalPassword(email: string, password: string) {
  const bytes = new TextEncoder().encode(`${email.toLowerCase()}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hasLocalPreviewAccounts() {
  return getLocalAccounts().length > 0;
}

export async function createLocalPreviewAccount({
  fullName,
  email,
  password,
}: {
  fullName: string;
  email: string;
  password: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = getLocalAccounts();
  if (accounts.some((account) => account.email === normalizedEmail))
    throw new Error("Já existe uma conta com este e-mail neste navegador.");
  const account: LocalAccount = {
    id: `jacoby-local-${crypto.randomUUID()}`,
    fullName: fullName.trim(),
    email: normalizedEmail,
    passwordHash: await hashLocalPassword(normalizedEmail, password),
  };
  localStorage.setItem(localAccountsKey, JSON.stringify([...accounts, account]));
  ensureLocalBoard();
  localStorage.setItem(localSessionKey, account.id);
  window.dispatchEvent(new Event(localAuthChanged));
}

export async function signInLocalPreviewAccount({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const account = getLocalAccounts().find((item) => item.email === normalizedEmail);
  if (!account || account.passwordHash !== (await hashLocalPassword(normalizedEmail, password))) {
    throw new Error("E-mail ou senha inválidos neste navegador.");
  }
  localStorage.setItem(localSessionKey, account.id);
  window.dispatchEvent(new Event(localAuthChanged));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCollaborator, setIsCollaborator] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedProfileUserId = useRef<string | null>(null);
  const loadingProfileUserId = useRef<string | null>(null);
  const cachedSessionUserId = useRef<string | null | undefined>(undefined);

  // A troca de login não pode reaproveitar consultas da pessoa anterior. Esta
  // limpeza fica no provedor de autenticação (e não na tela), portanto ocorre
  // mesmo enquanto a navegação desmonta o AppShell no logout.
  const synchronizeQuerySession = (nextUserId: string | null) => {
    if (cachedSessionUserId.current !== undefined && cachedSessionUserId.current !== nextUserId) {
      queryClient.clear();
    }
    cachedSessionUserId.current = nextUserId;
  };

  const loadProfile = async (uid: string) => {
    setLoading(true);
    // Profiles live in public.profiles, keyed by the Supabase auth user id.
    // The trigger in the migrations creates this row when a new user signs up.
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, theme_preferences")
      .eq("id", uid)
      .maybeSingle();
    const { data: authUser } = await supabase.auth.getUser();
    setProfile(prof ? ({ ...prof, email: authUser.user?.email ?? null } as Profile) : null);
    // Admin-only pages are controlled by public.user_roles, not by hardcoded emails.
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    const admin = !!roles?.some((r: { role: string }) => r.role === "admin");
    const collaborator = !!roles?.some((r: { role: string }) => r.role === "collaborator");
    const client = !!roles?.some((r: { role: string }) => r.role === "client");
    setIsAdmin(admin);
    setIsCollaborator(collaborator);
    setIsClient(client);
    const { data: link } = await (supabase.from("client_user_links" as any) as any)
      .select("client_id")
      .eq("user_id", uid)
      .maybeSingle();
    setClientId(link?.client_id ?? null);
    const { data: access } = await (supabase.from("user_permissions") as any)
      .select("permissions")
      .eq("user_id", uid)
      .maybeSingle();
    setPermissions(admin ? previewPermissions : (access?.permissions ?? []));
    loadedProfileUserId.current = uid;
    loadingProfileUserId.current = null;
    setLoading(false);
  };

  const scheduleProfileLoad = (uid: string, force = false) => {
    // O Supabase pode emitir SIGNED_IN novamente ao renovar a sessão ou ao voltar
    // para a aba. Isso não é um novo login e não deve desmontar a tela atual.
    if (!force && (loadedProfileUserId.current === uid || loadingProfileUserId.current === uid))
      return;
    loadingProfileUserId.current = uid;
    setTimeout(() => void loadProfile(uid), 0);
  };

  useEffect(() => {
    if (isStaticPreview) {
      const restoreLocalSession = () => {
        ensureLocalBoard();
        const account = getLocalAccounts().find(
          (item) => item.id === localStorage.getItem(localSessionKey),
        );
        synchronizeQuerySession(account?.id ?? null);
        setSession(null);
        setUser(account ? ({ id: account.id, email: account.email } as User) : null);
        setProfile(
          account
            ? {
                id: account.id,
                full_name: account.fullName,
                email: account.email,
                avatar_url: null,
                theme_preferences: null,
              }
            : null,
        );
        setIsAdmin(!!account);
        setIsCollaborator(false);
        setIsClient(false);
        setClientId(null);
        setPermissions(account ? previewPermissions : []);
        setLoading(false);
      };
      restoreLocalSession();
      window.addEventListener(localAuthChanged, restoreLocalSession);
      return () => window.removeEventListener(localAuthChanged, restoreLocalSession);
    }
    // Supabase emits auth state changes after sign-in, sign-out and token refresh.
    // The timeout avoids updating profile data inside the auth callback stack.
    const { data: sub } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, s: Session | null) => {
        synchronizeQuerySession(s?.user.id ?? null);
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          if (event === "SIGNED_IN" || event === "USER_UPDATED") scheduleProfileLoad(s.user.id);
        } else {
          loadedProfileUserId.current = null;
          loadingProfileUserId.current = null;
          setProfile(null);
          setIsAdmin(false);
          setIsCollaborator(false);
          setIsClient(false);
          setClientId(null);
          setPermissions([]);
        }
      },
    );
    // Initial page load: restore any saved session from localStorage.
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      synchronizeQuerySession(data.session?.user.id ?? null);
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) scheduleProfileLoad(data.session.user.id);
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (isStaticPreview) {
      localStorage.removeItem(localSessionKey);
      window.dispatchEvent(new Event(localAuthChanged));
      return;
    }
    // Supabase clears the persisted browser session; the listener above resets local React state.
    synchronizeQuerySession(null);
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (isStaticPreview) return;
    if (user) {
      loadedProfileUserId.current = null;
      scheduleProfileLoad(user.id, true);
    }
  };
  const hasPermission = (permission: string) =>
    restrictedFinancePermission(permission, user?.id, isAdmin, isClient) ??
    (isAdmin || permissions.includes(permission));

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        isAdmin,
        isCollaborator,
        isClient,
        clientId,
        permissions,
        hasPermission,
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
