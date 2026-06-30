"use client";

// ─────────────────────────────────────────────────────────────
// frontend/app/login/page.tsx
// Tela de login — reescrita do zero com Grid simples
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [tab, setTab] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (tab === "login") {
        await signIn(email, password);
      } else {
        await signUp(email, password, name);
      }
      router.push("/dashboard");
    } catch (err: any) {
      setError(traduzErro(err.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(traduzErro(err.message));
    }
  }

  function traduzErro(msg: string): string {
    if (msg.includes("Invalid login credentials")) return "Email ou senha incorretos.";
    if (msg.includes("User already registered")) return "Esse email já está cadastrado.";
    if (msg.includes("Password should be at least")) return "A senha precisa ter no mínimo 8 caracteres.";
    if (msg.includes("Unable to validate email")) return "Email inválido.";
    return "Algo deu errado. Tenta novamente.";
  }

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@700;800&display=swap" rel="stylesheet" />

      <style>{`
        .lg2-page * { box-sizing: border-box; }

        .lg2-page {
          display: grid;
          grid-template-columns: 1fr 480px;
          width: 100%;
          height: 100dvh;
          min-height: 600px;
          background: #080810;
          font-family: 'Inter', system-ui, sans-serif;
          overflow: hidden;
          position: relative;
        }

        .lg2-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
        }

        .lg2-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(124,109,245,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(124,109,245,0.06) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 80% 80% at 25% 50%, black 40%, transparent 100%);
        }

        .lg2-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          animation: lg2Float 8s ease-in-out infinite;
        }
        .lg2-orb-1 { width: 460px; height: 460px; background: radial-gradient(circle, rgba(124,109,245,0.18) 0%, transparent 70%); top: -80px; left: -100px; }
        .lg2-orb-2 { width: 360px; height: 360px; background: radial-gradient(circle, rgba(62,207,142,0.10) 0%, transparent 70%); bottom: -60px; left: 180px; animation-delay: -3s; }

        @keyframes lg2Float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-24px) scale(1.04); }
        }

        .lg2-scan {
          position: absolute;
          left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(124,109,245,0.3), rgba(62,207,142,0.3), transparent);
          animation: lg2Scan 6s linear infinite;
        }
        @keyframes lg2Scan {
          0% { top: -2px; opacity: 0; }
          5% { opacity: 1; }
          95% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }

        .lg2-dot {
          position: absolute;
          background: rgba(124,109,245,0.55);
          border-radius: 50%;
          animation: lg2Drift linear infinite;
        }
        @keyframes lg2Drift {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-100vh); opacity: 0; }
        }

        /* ── Coluna esquerda ───────────────────────────── */
        .lg2-left {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 48px 56px;
          min-width: 0;
          overflow: hidden;
          gap: 0;
        }

        .lg2-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
          position: absolute;
          top: 40px;
          left: 56px;
        }
        .lg2-logo-mark {
          width: 38px; height: 38px;
          border-radius: 10px;
          background: #7c6df5;
          display: flex; align-items: center; justify-content: center;
        }
        .lg2-logo-mark svg { width: 18px; height: 18px; fill: white; }
        .lg2-logo-name {
          font-family: 'Inter Tight', sans-serif;
          font-size: 20px;
          font-weight: 800;
          color: #f0f0f5;
          letter-spacing: -0.03em;
        }

        .lg2-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #7c6df5;
          margin-bottom: 20px;
          width: fit-content;
        }
        .lg2-eyebrow-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #7c6df5;
          animation: lg2Pulse 2s ease-in-out infinite;
        }
        @keyframes lg2Pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }

        .lg2-headline {
          font-family: 'Inter Tight', sans-serif;
          font-size: 50px;
          font-weight: 800;
          line-height: 1.06;
          letter-spacing: -0.04em;
          color: #f0f0f5;
          margin-bottom: 20px;
          max-width: 520px;
        }
        .lg2-headline-accent {
          background: linear-gradient(135deg, #a99cf8 0%, #7c6df5 40%, #3ecf8e 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .lg2-subtext {
          font-size: 16px;
          line-height: 1.6;
          color: #9090a8;
          margin-bottom: 36px;
          max-width: 420px;
        }

        .lg2-features { display: flex; flex-direction: column; gap: 12px; max-width: 460px; }
        .lg2-feature { display: flex; align-items: center; gap: 12px; font-size: 13px; color: #9090a8; }
        .lg2-feature-icon {
          width: 28px; height: 28px;
          border-radius: 7px;
          background: rgba(124,109,245,0.12);
          border: 0.5px solid rgba(124,109,245,0.25);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .lg2-feature-icon svg { width: 14px; height: 14px; stroke: #a99cf8; fill: none; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }

        .lg2-footer {
          position: absolute;
          bottom: 40px;
          left: 56px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #55556a;
        }
        .lg2-footer a { color: #55556a; text-decoration: none; }
        .lg2-footer a:hover { color: #9090a8; }

        /* ── Coluna direita ────────────────────────────── */
        .lg2-right {
          position: fixed;
          top: 0;
          right: 0;
          width: 480px;
          height: 100%;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow-y: auto;
        }

        .lg2-card {
          width: 100%;
          max-width: 400px;
          margin-top: -80px;
          background: rgba(19, 19, 24, 0.92);
          border: 0.5px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          padding: 32px 30px;
          backdrop-filter: blur(24px);
          box-shadow: 0 0 0 0.5px rgba(124,109,245,0.15), 0 40px 80px rgba(0,0,0,0.6);
          position: relative;
        }
        .lg2-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(124,109,245,0.5), rgba(62,207,142,0.3), transparent);
        }

        .lg2-bonus {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(62,207,142,0.10);
          border: 0.5px solid rgba(62,207,142,0.22);
          border-radius: 20px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 600;
          color: #3ecf8e;
          margin-bottom: 20px;
        }
        .lg2-bonus-dot { width: 5px; height: 5px; border-radius: 50%; background: #3ecf8e; }

        .lg2-tabs {
          display: flex;
          background: rgba(255,255,255,0.04);
          border: 0.5px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 3px;
          margin-bottom: 24px;
        }
        .lg2-tab {
          flex: 1;
          padding: 8px;
          border-radius: 8px;
          border: none;
          background: transparent;
          font-size: 13px;
          font-weight: 500;
          color: #55556a;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
        }
        .lg2-tab.active {
          background: rgba(124,109,245,0.15);
          color: #a99cf8;
          border: 0.5px solid rgba(124,109,245,0.25);
        }

        .lg2-form { display: flex; flex-direction: column; gap: 13px; }
        .lg2-field { display: flex; flex-direction: column; gap: 6px; }
        .lg2-label { font-size: 12px; font-weight: 500; color: #9090a8; }

        .lg2-input-wrap { position: relative; display: flex; align-items: center; }
        .lg2-input-icon {
          position: absolute; left: 12px;
          width: 16px; height: 16px;
          stroke: #55556a; fill: none; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round;
          pointer-events: none;
        }
        .lg2-input {
          width: 100%;
          height: 42px;
          background: rgba(255,255,255,0.05);
          border: 0.5px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 0 40px;
          font-size: 14px;
          color: #f0f0f5;
          font-family: inherit;
          outline: none;
          transition: border-color 0.15s, background 0.15s;
        }
        .lg2-input::placeholder { color: #55556a; }
        .lg2-input:focus { border-color: rgba(124,109,245,0.5); background: rgba(124,109,245,0.06); }

        .lg2-eye-btn {
          position: absolute; right: 12px;
          background: none; border: none; cursor: pointer; padding: 4px;
          display: flex; align-items: center; justify-content: center;
        }
        .lg2-eye-btn svg { width: 16px; height: 16px; stroke: #55556a; fill: none; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
        .lg2-eye-btn:hover svg { stroke: #9090a8; }

        .lg2-forgot { text-align: right; margin-top: -6px; }
        .lg2-forgot a { font-size: 12px; color: #55556a; text-decoration: none; }
        .lg2-forgot a:hover { color: #a99cf8; }

        .lg2-error {
          background: rgba(240,68,68,0.10);
          border: 0.5px solid rgba(240,68,68,0.25);
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 12px;
          color: #f87171;
        }

        .lg2-btn-submit {
          height: 46px;
          border-radius: 10px;
          border: none;
          background: #7c6df5;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
          margin-top: 2px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .lg2-btn-submit:hover { opacity: 0.9; }
        .lg2-btn-submit:active { transform: scale(0.99); }
        .lg2-btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        .lg2-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: lg2Spin 0.7s linear infinite;
        }
        @keyframes lg2Spin { to { transform: rotate(360deg); } }

        .lg2-divider { display: flex; align-items: center; gap: 12px; margin: 2px 0; }
        .lg2-divider-line { flex: 1; height: 0.5px; background: rgba(255,255,255,0.08); }
        .lg2-divider span { font-size: 11px; color: #55556a; white-space: nowrap; }

        .lg2-btn-google {
          height: 44px;
          border-radius: 10px;
          border: 0.5px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04);
          color: #9090a8;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.12s, border-color 0.12s;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          width: 100%;
        }
        .lg2-btn-google:hover { background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.15); color: #f0f0f5; }
        .lg2-btn-google svg { width: 18px; height: 18px; }

        .lg2-card-footer { margin-top: 18px; text-align: center; font-size: 12px; color: #55556a; }
        .lg2-card-footer span { color: #a99cf8; cursor: pointer; }

        @media (max-width: 900px) {
          .lg2-page { grid-template-columns: 1fr; }
          .lg2-left { display: none; }
          .lg2-right { padding: 16px; }
        }
      `}</style>

      <div className="lg2-page">

        <div className="lg2-bg">
          <div className="lg2-grid" />
          <div className="lg2-orb lg2-orb-1" />
          <div className="lg2-orb lg2-orb-2" />
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className="lg2-dot"
              style={{
                left: `${(i * 6.3) % 100}%`,
                bottom: 0,
                width: i % 3 === 0 ? "3px" : "2px",
                height: i % 3 === 0 ? "3px" : "2px",
                opacity: 0.3 + (i % 4) * 0.12,
                animationDuration: `${9 + (i * 1.1) % 7}s`,
                animationDelay: `${(i * 0.6) % 7}s`,
              }}
            />
          ))}
          <div className="lg2-scan" />
        </div>

        <div className="lg2-left">
          <a href="/" className="lg2-logo">
            <div className="lg2-logo-mark">
              <svg viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z" /></svg>
            </div>
            <span className="lg2-logo-name">ClipForge</span>
          </a>

          <div className="lg2-eyebrow">
            <div className="lg2-eyebrow-dot" />
            Plataforma de vídeos com IA
          </div>
          <h1 className="lg2-headline">
            De uma ideia<br />
            a um vídeo<br />
            <span className="lg2-headline-accent">que vende.</span>
          </h1>
          <p className="lg2-subtext">
            Qualquer ideia vira vídeo pronto — para YouTube, TikTok Shop, ou onde sua audiência estiver. Roteiro, narração e edição, gerados por IA.
          </p>
          <div className="lg2-features">
            {[
              { icon: "M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z", text: "Pipeline de 9 agentes de IA para qualquer formato longo" },
              { icon: "M9 12a4 4 0 100 8 4 4 0 000-8zM15 2v10M15 2a4 4 0 004 4", text: "Canvas de 4 blocos para TikTok Shop" },
              { icon: "M13 10V3L4 14h7v7l9-11h-7z", text: "Pesquisa, roteiro, narração e SEO automáticos" },
            ].map((f, i) => (
              <div key={i} className="lg2-feature">
                <div className="lg2-feature-icon">
                  <svg viewBox="0 0 24 24"><path d={f.icon} /></svg>
                </div>
                {f.text}
              </div>
            ))}
          </div>

          <div className="lg2-footer">
            <span>© 2025 ClipForge</span>
            <span>·</span>
            <a href="#">Privacidade</a>
            <span>·</span>
            <a href="#">Termos</a>
          </div>
        </div>

        <div className="lg2-right">
          <div className="lg2-card">

            {tab === "register" && (
              <div className="lg2-bonus">
                <div className="lg2-bonus-dot" />
                50 créditos grátis no cadastro
              </div>
            )}

            <div className="lg2-tabs">
              <button type="button" className={`lg2-tab ${tab === "login" ? "active" : ""}`} onClick={() => setTab("login")}>
                Entrar
              </button>
              <button type="button" className={`lg2-tab ${tab === "register" ? "active" : ""}`} onClick={() => setTab("register")}>
                Criar conta
              </button>
            </div>

            <form className="lg2-form" onSubmit={handleSubmit}>

              {error && <div className="lg2-error">{error}</div>}

              {tab === "register" && (
                <div className="lg2-field">
                  <label className="lg2-label">Nome</label>
                  <div className="lg2-input-wrap">
                    <input
                      type="text"
                      className="lg2-input"
                      placeholder="Seu nome completo"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                    <svg className="lg2-input-icon" viewBox="0 0 24 24">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
                    </svg>
                  </div>
                </div>
              )}

              <div className="lg2-field">
                <label className="lg2-label">Email</label>
                <div className="lg2-input-wrap">
                  <input
                    type="email"
                    className="lg2-input"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <svg className="lg2-input-icon" viewBox="0 0 24 24">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
              </div>

              <div className="lg2-field">
                <label className="lg2-label">Senha</label>
                <div className="lg2-input-wrap">
                  <input
                    type={showPass ? "text" : "password"}
                    className="lg2-input"
                    placeholder={tab === "register" ? "Mínimo 8 caracteres" : "Sua senha"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <svg className="lg2-input-icon" viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  <button type="button" className="lg2-eye-btn" onClick={() => setShowPass(!showPass)} aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}>
                    {showPass ? (
                      <svg viewBox="0 0 24 24">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {tab === "login" && (
                <div className="lg2-forgot">
                  <a href="#">Esqueceu a senha?</a>
                </div>
              )}

              <button type="submit" className="lg2-btn-submit" disabled={loading}>
                {loading ? (
                  <div className="lg2-spinner" />
                ) : (
                  <>
                    {tab === "login" ? "Entrar na plataforma" : "Criar minha conta"}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>

              <div className="lg2-divider">
                <div className="lg2-divider-line" />
                <span>ou continue com</span>
                <div className="lg2-divider-line" />
              </div>

              <button type="button" className="lg2-btn-google" onClick={handleGoogle}>
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continuar com Google
              </button>

            </form>

            <div className="lg2-card-footer">
              {tab === "login" ? (
                <>Não tem conta? <span onClick={() => setTab("register")}>Criar grátis →</span></>
              ) : (
                <>Já tem conta? <span onClick={() => setTab("login")}>Entrar →</span></>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
