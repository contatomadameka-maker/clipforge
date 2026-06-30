"use client";

// ─────────────────────────────────────────────────────────────
// frontend/lib/useAuth.ts
// Hook para login, cadastro, logout e estado do usuário
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "./supabase";
import type { User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({ user: session?.user ?? null, loading: false });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, loading: false });
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;

    if (data.user) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/sync-profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: data.user.id,
            name,
            email,
          }),
        });
      } catch (e) {
        console.error("Erro ao sincronizar perfil:", e);
      }
    }

    return data;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
    return data;
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
  };
}
