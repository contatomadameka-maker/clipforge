// ─────────────────────────────────────────────────────────────
// frontend/lib/supabase.ts
// Cliente Supabase — usado em componentes client-side
// ─────────────────────────────────────────────────────────────

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Cliente singleton para uso direto em componentes
export const supabase = createClient();
