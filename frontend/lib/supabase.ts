// ─────────────────────────────────────────────────────────────
// frontend/lib/supabase.ts
// Cliente Supabase — usado em componentes client-side
// ─────────────────────────────────────────────────────────────

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error("getSupabase() só pode ser chamado no navegador");
  }
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
