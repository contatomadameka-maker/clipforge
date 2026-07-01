"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [tab, setTab] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (tab === "login") await signIn(email, password);
      else await signUp(email, password, name);
      router.push("/dashboard");
    } catch (err: any) {
      setError(traduzErro(err.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    try { await signInWithGoogle(); }
    catch (err: any) { setError(traduzErro(err.message)); }
  }

  function traduzErro(msg: string) {
    if (msg.includes("Invalid login credentials")) return "Email ou senha incorretos.";
    if (msg.includes("User already registered")) return "Email já cadastrado.";
    if (msg.includes("Password should be at least")) return "Senha precisa ter mínimo 8 caracteres.";
    return "Algo deu errado. Tenta novamente.";
  }

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col items-center justify-center p-4">

      {/* Logo no topo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-[10px] bg-[#7c6df5] flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg>
        </div>
        <span className="text-[#f0f0f5] font-bold text-xl tracking-tight">ClipForge</span>
      </div>

      {/* Container central — lado a lado no desktop, empilhado no mobile */}
      <div className="w-full max-w-4xl flex flex-col lg:flex-row gap-0 overflow-hidden rounded-2xl"
        style={{ border: "0.5px solid rgba(255,255,255,0.1)", boxShadow: "0 40px 80px rgba(0,0,0,0.6)" }}>

        {/* ── Lado esquerdo — descrição ────────────── */}
        <div className="flex-1 p-8 lg:p-10 flex flex-col justify-center relative overflow-hidden"
          style={{ background: "rgba(19,19,24,0.95)", borderRight: "0.5px solid rgba(255,255,255,0.07)" }}>

          {/* Orb decorativo */}
          <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full opacity-20 blur-3xl bg-[#7c6df5] pointer-events-none" />
          <div className="absolute -bottom-10 left-20 w-48 h-48 rounded-full opacity-10 blur-3xl bg-[#3ecf8e] pointer-events-none" />

          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-[#7c6df5] animate-pulse" />
              <span className="text-[#7c6df5] text-xs font-semibold uppercase tracking-widest">Plataforma de vídeos com IA</span>
            </div>

            <h1 className="text-3xl lg:text-4xl font-black leading-tight tracking-tighter text-[#f0f0f5] mb-4">
              De uma ideia<br />a um vídeo<br />
              <span className="bg-gradient-to-r from-[#a99cf8] via-[#7c6df5] to-[#3ecf8e] bg-clip-text text-transparent">
                que vende.
              </span>
            </h1>

            <p className="text-[#9090a8] text-sm leading-relaxed mb-7">
              Qualquer ideia vira vídeo pronto — YouTube, TikTok Shop ou onde sua audiência estiver.
            </p>

            <div className="flex flex-col gap-3">
              {[
                { icon: "M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z", text: "9 agentes de IA para qualquer formato" },
                { icon: "M9 12a4 4 0 100 8 4 4 0 000-8zM15 2v10M15 2a4 4 0 004 4", text: "Canvas de 4 blocos para TikTok Shop" },
                { icon: "M13 10V3L4 14h7v7l9-11h-7z", text: "Roteiro, narração e SEO automáticos" },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-[#9090a8]">
                  <div className="w-7 h-7 rounded-[7px] flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(124,109,245,0.12)", border: "0.5px solid rgba(124,109,245,0.25)" }}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="#a99cf8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d={f.icon}/>
                    </svg>
                  </div>
                  {f.text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Lado direito — formulário ────────────── */}
        <div className="w-full lg:w-[400px] flex-shrink-0 p-8 lg:p-10"
          style={{ background: "rgba(13,13,18,0.98)" }}>

          {tab === "register" && (
            <div className="flex items-center gap-2 mb-5 text-xs font-semibold text-[#3ecf8e] px-3 py-1.5 rounded-full w-fit"
              style={{ background: "rgba(62,207,142,0.10)", border: "0.5px solid rgba(62,207,142,0.22)" }}>
              <div className="w-1 h-1 rounded-full bg-[#3ecf8e]" />
              50 créditos grátis no cadastro
            </div>
          )}

          {/* Tabs */}
          <div className="flex p-1 rounded-[10px] mb-6"
            style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
            {(["login", "register"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150 border-none cursor-pointer"
                style={tab === t ? {
                  background: "rgba(124,109,245,0.15)", color: "#a99cf8",
                  border: "0.5px solid rgba(124,109,245,0.25)",
                } : { background: "transparent", color: "#55556a" }}>
                {t === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="text-xs text-[#f87171] px-3 py-2.5 rounded-[10px]"
                style={{ background: "rgba(240,68,68,0.10)", border: "0.5px solid rgba(240,68,68,0.25)" }}>
                {error}
              </div>
            )}

            {tab === "register" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[#9090a8]">Nome</label>
                <div className="relative">
                  <input type="text" value={name} onChange={e => setName(e.target.value)} required
                    placeholder="Seu nome completo"
                    className="w-full h-11 pl-10 pr-4 text-sm rounded-[10px] outline-none bg-transparent"
                    style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#55556a" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/>
                  </svg>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#9090a8]">Email</label>
              <div className="relative">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="seu@email.com"
                  className="w-full h-11 pl-10 pr-4 text-sm rounded-[10px] outline-none bg-transparent"
                  style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#55556a" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#9090a8]">Senha</label>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder={tab === "register" ? "Mínimo 8 caracteres" : "Sua senha"}
                  className="w-full h-11 pl-10 pr-10 text-sm rounded-[10px] outline-none bg-transparent"
                  style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#55556a" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#55556a] hover:text-[#9090a8] bg-transparent border-none cursor-pointer p-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    {showPass
                      ? <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/>
                      : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                    }
                  </svg>
                </button>
              </div>
              {tab === "login" && (
                <div className="text-right">
                  <a href="#" className="text-xs text-[#55556a] hover:text-[#a99cf8]">Esqueceu a senha?</a>
                </div>
              )}
            </div>

            <button type="submit" disabled={loading}
              className="h-11 rounded-[10px] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer border-none transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
              style={{ background: "#7c6df5" }}>
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
              ) : (
                <>
                  {tab === "login" ? "Entrar na plataforma" : "Criar minha conta"}
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </>
              )}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }}/>
              <span className="text-xs text-[#55556a]">ou continue com</span>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }}/>
            </div>

            <button type="button" onClick={handleGoogle}
              className="h-11 w-full rounded-[10px] text-sm font-medium text-[#9090a8] flex items-center justify-center gap-2.5 cursor-pointer transition-colors hover:text-[#f0f0f5] border-none"
              style={{ border: "0.5px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continuar com Google
            </button>
          </form>

          <div className="mt-5 text-center text-xs text-[#55556a]">
            {tab === "login" ? (
              <>Não tem conta? <span className="text-[#a99cf8] cursor-pointer hover:underline" onClick={() => setTab("register")}>Criar grátis →</span></>
            ) : (
              <>Já tem conta? <span className="text-[#a99cf8] cursor-pointer hover:underline" onClick={() => setTab("login")}>Entrar →</span></>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 text-xs text-[#55556a]">
        <span>© 2025 ClipForge</span><span>·</span>
        <a href="#" className="hover:text-[#9090a8]">Privacidade</a><span>·</span>
        <a href="#" className="hover:text-[#9090a8]">Termos</a>
      </div>
    </div>
  );
}
