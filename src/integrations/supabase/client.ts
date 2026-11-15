import { createLocalReviewBucket } from "@/lib/local-review-storage";
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Supabase browser client.
 *
 * This clean GitHub Pages copy must point to its own Supabase project.
 * Do not paste credentials from the Lovable/original project here.
 *
 * In GitHub Pages, Vite replaces VITE_* values during build time. That means
 * changing the Supabase project later requires rebuilding and redeploying Pages.
 */
const localDataKey = 'jacoby-local-data-v1';

function readLocalData() {
  if (typeof window === 'undefined') return {} as Record<string, any[]>;
  try {
    const parsed = JSON.parse(localStorage.getItem(localDataKey) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {} as Record<string, any[]>;
  }
}

function writeLocalData(data: Record<string, any[]>) {
  localStorage.setItem(localDataKey, JSON.stringify(data));
}

function createFallbackQueryBuilder(message: string, isPreview = false, table = '') {
  const error = isPreview ? null : new Error(message);
  const state: {
    operation: 'select' | 'insert' | 'update' | 'delete';
    payload: any;
    filters: Array<(row: any) => boolean>;
    orders: Array<{ field: string; ascending: boolean }>;
    limit?: number;
    range?: [number, number];
    single: boolean;
    conflict?: string[];
  } = { operation: 'select', payload: null, filters: [], orders: [], single: false };

  const execute = () => {
    if (!isPreview) return { data: null, error };
    const database = readLocalData();
    const rows = Array.isArray(database[table]) ? database[table] : [];
    const matches = (row: any) => state.filters.every((filter) => filter(row));
    let result: any[];

    if (state.operation === 'insert') {
      const inserted = (Array.isArray(state.payload) ? state.payload : [state.payload]).map(
        (row) => ({
          ...(table === "tasks"
            ? { deleted_at: null, completed_at: null, is_demo: false, position: 0 }
            : {}),
          ...(table === "task_process_templates" ? { deleted_at: null } : {}),
          ...row,
          ...(table === "billing_receivable_tracking"
            ? {
                commission_amount:
                  Math.round(
                    Number(
                      row.rule_type === "percent"
                        ? (Number(row.net_invoice_amount || 0) * Number(row.rule_value)) / 100
                        : row.rule_value,
                    ) * 100,
                  ) / 100,
              }
            : {}),
          id: row.id ?? crypto.randomUUID(),
          created_at: row.created_at ?? new Date().toISOString(),
        }),
      );
      const next = [...rows];
      result = inserted.map((row) => {
        const index = state.conflict
          ? next.findIndex((old) => state.conflict!.every((key) => old[key] === row[key]))
          : -1;
        if (index < 0) {
          next.push(row);
          return row;
        }
        next[index] = {
          ...next[index],
          ...row,
          id: next[index].id,
          created_at: next[index].created_at,
        };
        return next[index];
      });
      database[table] = next;
      writeLocalData(database);
    } else if (state.operation === 'update') {
      result = rows.filter(matches).map((row) => ({ ...row, ...state.payload, updated_at: new Date().toISOString() }));
      database[table] = rows.map((row) => matches(row) ? { ...row, ...state.payload, updated_at: new Date().toISOString() } : row);
      writeLocalData(database);
    } else if (state.operation === 'delete') {
      result = rows.filter(matches);
      database[table] = rows.filter((row) => !matches(row));
      writeLocalData(database);
    } else {
      result = rows.filter(matches);
    }

    for (const order of state.orders) {
      result.sort((a, b) => {
        const left = a[order.field] ?? '';
        const right = b[order.field] ?? '';
        return (left > right ? 1 : left < right ? -1 : 0) * (order.ascending ? 1 : -1);
      });
    }
    if (state.range) result = result.slice(state.range[0], state.range[1] + 1);
    if (state.limit !== undefined) result = result.slice(0, state.limit);
    return { data: state.single ? result[0] ?? null : result, error: null };
  };

  const builder = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => Promise.resolve(execute()).then(resolve, reject);
      if (prop === 'catch') return (callback: (reason: unknown) => unknown) => Promise.resolve(execute()).catch(callback);
      if (prop === 'finally') return (callback: () => void) => Promise.resolve(execute()).finally(callback);
      if (prop === 'select') return () => builder;
        if (prop === "insert" || prop === "upsert")
          return (payload: any, options?: { onConflict?: string }) => {
            state.operation = "insert";
            state.payload = payload;
            state.conflict = prop === "upsert" ? options?.onConflict?.split(",") : undefined;
            return builder;
          };
      if (prop === 'update') return (payload: any) => { state.operation = 'update'; state.payload = payload; return builder; };
      if (prop === 'delete') return () => { state.operation = 'delete'; return builder; };
      if (prop === 'eq') return (field: string, value: unknown) => { state.filters.push((row) => row[field] === value); return builder; };
      if (prop === 'in') return (field: string, values: unknown[]) => { state.filters.push((row) => values.includes(row[field])); return builder; };
      if (prop === 'is') return (field: string, value: unknown) => { state.filters.push((row) => row[field] === value); return builder; };
      if (prop === 'not') return (field: string, operator: string, value: unknown) => { if (operator === 'is') state.filters.push((row) => row[field] !== value); return builder; };
      if (prop === 'match') return (values: Record<string, unknown>) => { state.filters.push((row) => Object.entries(values).every(([key, value]) => row[key] === value)); return builder; };
      if (prop === 'order') return (field: string, options?: { ascending?: boolean }) => { state.orders.push({ field, ascending: options?.ascending !== false }); return builder; };
      if (prop === 'limit') return (limit: number) => { state.limit = limit; return builder; };
      if (prop === 'range') return (from: number, to: number) => { state.range = [from, to]; return builder; };
      if (prop === 'single' || prop === 'maybeSingle') return () => { state.single = true; return Promise.resolve(execute()); };
      if (prop === 'or' || prop === 'filter' || prop === 'contains' || prop === 'over') return () => builder;
      return undefined;
    },
  });

  return builder as any;
}

function createFallbackSupabaseClient() {
  const message = 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to enable database features.';
  const isPreview =
    import.meta.env.VITE_LOCAL_REVIEW === "true" || import.meta.env.VITE_GITHUB_PAGES === "true";
  const error = isPreview ? null : new Error(message);
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };

  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error }),
      getSession: () => Promise.resolve({ data: { session: null }, error }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } }, error }),
      signOut: () => Promise.resolve({ error }),
      signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error }),
      signUp: () => Promise.resolve({ data: { user: null, session: null }, error }),
      signInWithOAuth: () => Promise.resolve({ data: { provider: '', url: '' }, error }),
      setSession: () => Promise.resolve({ error }),
      getClaims: () => Promise.resolve({ data: { claims: null }, error }),
    },
    from: (table: string) => createFallbackQueryBuilder(message, isPreview, table),
    // Keep optional background jobs from breaking the interface if the client
    // is opened without environment settings (for example in a static preview).
    rpc: () => Promise.resolve({ data: null, error }),
    channel: () => channel,
    storage: {
      from: (bucket: string) =>
        isPreview
          ? createLocalReviewBucket(bucket)
          : {
              list: () => Promise.resolve({ data: [], error }),
              upload: () => Promise.resolve({ data: null, error }),
              download: () => Promise.resolve({ data: null, error }),
              remove: () => Promise.resolve({ data: null, error }),
              getPublicUrl: () => ({ data: { publicUrl: "" }, error }),
            },
    },
    functions: {
      invoke: () => Promise.resolve({ data: null, error }),
    },
    removeChannel: () => undefined,
  } as any;
}

function createSupabaseClient() {
  // Explicit offline review must override even credentials in .env.local.
  if (import.meta.env.VITE_LOCAL_REVIEW === "true") return createFallbackSupabaseClient();
  // Client-side static build: values come from GitHub Actions/local .env as VITE_*.
  // Local SSR/dev fallback: values can also come from process.env for compatibility.
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.warn('[Supabase] Missing credentials. Falling back to a local-safe client.');
    return createFallbackSupabaseClient();
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      // Persisting sessions in localStorage is what keeps the user logged in after reloads.
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    }
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Lazy proxy: importing this module does not crash immediately if env vars are missing.
// The clear error is raised only when some code actually calls supabase.from/auth/etc.
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    // Supabase methods (notably `rpc`) rely on their original client instance
    // as `this`. Binding them here keeps the lazy proxy transparent to callers.
    const value = Reflect.get(_supabase, prop, _supabase);
    return typeof value === "function" ? value.bind(_supabase) : value;
  },
});
