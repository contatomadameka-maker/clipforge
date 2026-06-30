// ─────────────────────────────────────────────────────────────
// frontend/lib/supabase.ts
// Cliente Supabase — usado em componentes client-side
// ─────────────────────────────────────────────────────────────

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function createClient() {
  if (client) return client;
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return client;
}

// Proxy que cria o cliente sob demanda, somente no browser
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = createClient();
    return (c as any)[prop];
  },
});
