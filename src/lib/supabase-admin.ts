// Modified by LAST HUMAN demo (fork of oil-oil/wolfcha).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let realAdmin: SupabaseClient<Database> | null = null;

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getRealAdmin(): SupabaseClient<Database> {
  if (!isSupabaseAdminConfigured()) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Get it from Supabase Dashboard > Settings > API > service_role key"
    );
  }
  if (!realAdmin) {
    realAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    );
  }
  return realAdmin;
}

export function ensureAdminClient() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Get it from Supabase Dashboard > Settings > API > service_role key"
    );
  }
}

/**
 * Created lazily so Next.js can collect API routes without Supabase env.
 * Accessing a method without credentials throws at call time, not import time.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const real = getRealAdmin();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
