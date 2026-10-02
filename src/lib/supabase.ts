// Modified by LAST HUMAN demo (fork of oil-oil/wolfcha).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

let realClient: SupabaseClient<Database> | null = null;

function isConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

function getRealClient(): SupabaseClient<Database> | null {
  if (!isConfigured()) return null;
  if (!realClient) {
    realClient = createClient<Database>(supabaseUrl as string, supabaseAnonKey as string);
  }
  return realClient;
}

const authListeners = new Set<(event: string, session: null) => void>();

const stubAuth = {
  async getSession() {
    return { data: { session: null }, error: null };
  },
  async getUser() {
    return { data: { user: null }, error: null };
  },
  onAuthStateChange(callback: (event: string, session: null) => void) {
    authListeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe() {
            authListeners.delete(callback);
          },
        },
      },
    };
  },
  async signOut() {
    return { error: null };
  },
  async signInWithPassword() {
    return { data: { user: null, session: null }, error: { message: "登录已关闭" } };
  },
  async signInWithOAuth() {
    return { data: { provider: null, url: null }, error: { message: "登录已关闭" } };
  },
  async signUp() {
    return { data: { user: null, session: null }, error: { message: "登录已关闭" } };
  },
  async resetPasswordForEmail() {
    return { data: {}, error: { message: "登录已关闭" } };
  },
  async updateUser() {
    return { data: { user: null }, error: { message: "登录已关闭" } };
  },
  async exchangeCodeForSession() {
    return { data: { user: null, session: null }, error: { message: "登录已关闭" } };
  },
};

function stubQuery() {
  const result = Promise.resolve({ data: null, error: { message: "Supabase is not configured" } });
  const builder: Record<string, unknown> = {
    then: result.then.bind(result),
    catch: result.catch.bind(result),
    finally: result.finally.bind(result),
  };
  const chain = () => builder;
  for (const method of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "single", "maybeSingle", "order", "limit", "in", "gte", "lte", "match"]) {
    builder[method] = chain;
  }
  return builder;
}

/**
 * Supabase is optional in the public demo. Importing this module must not throw
 * when NEXT_PUBLIC_SUPABASE_URL is unset; callers get an inert client instead.
 */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const real = getRealClient();
    if (!real) {
      if (prop === "auth") return stubAuth;
      if (prop === "from") return () => stubQuery();
      return undefined;
    }
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
