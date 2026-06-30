"use client";

// ─────────────────────────────────────────────────────────────
// frontend/lib/useAuth.ts
// Hook para login, cadastro, logout e estado do usuário
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  loading: boolean;
}

export function useAuth() {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    // Verifica sessão atual ao carregar
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({ user: session?.user ?? null, loading: false });
    });

    // Escuta mudanças de autenticação (login, logout, refresh de token)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, loading: false });
    });

    return () => listener.subscription.unsubscribe();
  }, [mounted]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;

    // Cria o perfil e créditos iniciais via backend
    // (o backend faz isso no endpoint /auth/register, mas o Supabase
    // Auth já criou o usuário — aqui só garantimos a sincronização)
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
