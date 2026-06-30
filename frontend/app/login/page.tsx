"use client";

// ─────────────────────────────────────────────────────────────
// frontend/app/login/page.tsx
// Tela de login — visual cinematográfico com animações CSS
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import Link from "next/link";
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
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .cf-login-root {
          min-height: 100vh;
          display: flex;
          align-items: stretch;
          font-family: 'Inter', system-ui, sans-serif;
          background: #080810;
          position: relative;
          overflow: hidden;
        }

        /* ── Fundo animado ─────────────────────────────── */
        .cf-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
        }

        .cf-bg-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(124,109,245,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(124,109,245,0.06) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 80% 80% at 20% 50%, black 40%, transparent 100%);
        }

        .cf-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          animation: orbFloat 8s ease-in-out infinite;
        }

        .cf-orb-1 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(124,109,245,0.18) 0%, transparent 70%);
          top: -100px; left: -100px;
          animation-delay: 0s;
        }

        .cf-orb-2 {
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(62,207,142,0.10) 0%, transparent 70%);
          bottom: -80px; left: 200px;
          animation-delay: -3s;
        }

        .cf-orb-3 {
          width: 300px; height: 300px;
          background: radial-gradient(circle, rgba(124,109,245,0.12) 0%, transparent 70%);
          top: 40%; left: 30%;
          animation-delay: -5s;
        }

        @keyframes orbFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-30px) scale(1.05); }
        }

        /* Partículas */
        .cf-particles {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }

        .cf-particle {
          position: absolute;
          width: 2px; height: 2px;
          background: rgba(124,109,245,0.6);
          border-radius: 50%;
          animation: particleDrift linear infinite;
        }

        @keyframes particleDrift {
          0% { transform: translateY(100vh) translateX(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(-100px) translateX(var(--drift)); opacity: 0; }
        }

        /* Linha scan */
        .cf-scanline {
          position: absolute;
          left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(124,109,245,0.3), rgba(62,207,142,0.3), transparent);
          animation: scanMove 6s linear infinite;
          z-index: 1;
        }

        @keyframes scanMove {
          0% { top: -2px; opacity: 0; }
          5% { opacity: 1; }
          95% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }

        /* ── Layout ────────────────────────────────────── */
        .cf-left {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 48px 56px;
          position: relative;
          z-index: 1;
        }

        .cf-right {
          width: 480px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px;
          position: relative;
          z-index: 1;
          min-height: 100vh;
        }

        /* ── Logo ──────────────────────────────────────── */
        .cf-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
          position: absolute;
          top: 48px;
          left: 56px;
        }

        .cf-logo-mark {
          width: 38px; height: 38px;
          border-radius: 10px;
          background: #7c6df5;
          display: flex; align-items: center; justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .cf-logo-mark::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 60%);
        }

        .cf-logo-mark svg { width: 18px; height: 18px; fill: white; }

        .cf-logo-name {
          font-family: 'Inter Tight', sans-serif;
          font-size: 20px;
          font-weight: 800;
          color: #f0f0f5;
          letter-spacing: -0.03em;
        }

        /* ── Hero text ─────────────────────────────────── */
        .cf-hero {
          display: flex;
          flex-direction: column;
          max-width: 520px;
        }

        .cf-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #7c6df5;
          margin-bottom: 20px;
        }

        .cf-eyebrow-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #7c6df5;
          animation: dotPulse 2s ease-in-out infinite;
        }

        @keyframes dotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }

        .cf-headline {
          font-family: 'Inter Tight', sans-serif;
          font-size: 52px;
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.04em;
          color: #f0f0f5;
          margin-bottom: 20px;
        }

        .cf-headline-accent {
          background: linear-gradient(135deg, #a99cf8 0%, #7c6df5 40%, #3ecf8e 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .cf-subtext {
          font-size: 16px;
          line-height: 1.6;
          color: #9090a8;
          margin-bottom: 40px;
          max-width: 380px;
        }

        /* ── Features ──────────────────────────────────── */
        .cf-features {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .cf-feature {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
          color: #9090a8;
        }

        .cf-feature-icon {
          width: 28px; height: 28px;
          border-radius: 7px;
          background: rgba(124,109,245,0.12);
          border: 0.5px solid rgba(124,109,245,0.25);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .cf-feature-icon svg {
          width: 14px; height: 14px;
          stroke: #a99cf8;
          fill: none;
          stroke-width: 1.75;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        /* ── Rodapé esquerdo ───────────────────────────── */
        .cf-footer-left {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #55556a;
          position: absolute;
          bottom: 40px;
          left: 56px;
        }

        .cf-footer-left a { color: #55556a; text-decoration: none; }
        .cf-footer-left a:hover { color: #9090a8; }

        /* ── Card do formulário ────────────────────────── */
        .cf-card {
          width: 100%;
          max-width: 400px;
          background: rgba(19, 19, 24, 0.92);
          border: 0.5px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          padding: 36px 32px;
          backdrop-filter: blur(24px);
          box-shadow:
            0 0 0 0.5px rgba(124,109,245,0.15),
            0 40px 80px rgba(0,0,0,0.6);
          position: relative;
          overflow: hidden;
        }

        .cf-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(124,109,245,0.5), rgba(62,207,142,0.3), transparent);
        }

        /* ── Tabs ──────────────────────────────────────── */
        .cf-tabs {
          display: flex;
          background: rgba(255,255,255,0.04);
          border: 0.5px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 3px;
          margin-bottom: 28px;
        }

        .cf-tab {
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
        }

        .cf-tab.active {
          background: rgba(124,109,245,0.15);
          color: #a99cf8;
          border: 0.5px solid rgba(124,109,245,0.25);
        }

        /* ── Form ──────────────────────────────────────── */
        .cf-form { display: flex; flex-direction: column; gap: 14px; }

        .cf-field { display: flex; flex-direction: column; gap: 6px; }

        .cf-label {
          font-size: 12px;
          font-weight: 500;
          color: #9090a8;
          letter-spacing: 0.02em;
        }

        .cf-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }

        .cf-input-icon {
          position: absolute;
          left: 12px;
          width: 16px; height: 16px;
          stroke: #55556a;
          fill: none;
          stroke-width: 1.75;
          stroke-linecap: round;
          stroke-linejoin: round;
          pointer-events: none;
          transition: stroke 0.15s;
        }

        .cf-input {
          width: 100%;
          height: 44px;
          background: rgba(255,255,255,0.05);
          border: 0.5px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 0 40px 0 40px;
          font-size: 14px;
          color: #f0f0f5;
          font-family: inherit;
          outline: none;
          transition: border-color 0.15s, background 0.15s;
        }

        .cf-input::placeholder { color: #55556a; }

        .cf-input:focus {
          border-color: rgba(124,109,245,0.5);
          background: rgba(124,109,245,0.06);
        }

        .cf-input:focus + .cf-input-icon { stroke: #a99cf8; }

        .cf-input-wrap:focus-within .cf-input-icon { stroke: #a99cf8; }

        .cf-eye-btn {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          display: flex; align-items: center; justify-content: center;
        }

        .cf-eye-btn svg {
          width: 16px; height: 16px;
          stroke: #55556a;
          fill: none;
          stroke-width: 1.75;
          stroke-linecap: round;
          stroke-linejoin: round;
          transition: stroke 0.15s;
        }

        .cf-eye-btn:hover svg { stroke: #9090a8; }

        /* Esqueci a senha */
        .cf-forgot {
          text-align: right;
          margin-top: -8px;
        }

        .cf-forgot a {
          font-size: 12px;
          color: #55556a;
          text-decoration: none;
          transition: color 0.12s;
        }

        .cf-forgot a:hover { color: #a99cf8; }

        /* ── Botão submit ──────────────────────────────── */
        .cf-btn-submit {
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
          position: relative;
          overflow: hidden;
          margin-top: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .cf-btn-submit::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%);
          pointer-events: none;
        }

        .cf-btn-submit:hover { opacity: 0.9; }
        .cf-btn-submit:active { transform: scale(0.99); }
        .cf-btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        .cf-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Divisor Google ────────────────────────────── */
        .cf-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 4px 0;
        }

        .cf-divider-line {
          flex: 1;
          height: 0.5px;
          background: rgba(255,255,255,0.08);
        }

        .cf-divider span {
          font-size: 11px;
          color: #55556a;
          white-space: nowrap;
        }

        /* ── Google btn ────────────────────────────────── */
        .cf-btn-google {
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
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
        }

        .cf-btn-google:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,255,255,0.15);
          color: #f0f0f5;
        }

        .cf-btn-google svg { width: 18px; height: 18px; }

        /* ── Rodapé card ───────────────────────────────── */
        .cf-card-footer {
          margin-top: 20px;
          text-align: center;
          font-size: 12px;
          color: #55556a;
        }

        .cf-card-footer span { color: #9090a8; }

        /* ── Bônus badge ───────────────────────────────── */
        .cf-bonus {
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
          margin-bottom: 24px;
        }

        .cf-bonus-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #3ecf8e;
        }

        /* ── Responsive ────────────────────────────────── */
        @media (max-width: 900px) {
          .cf-left { display: none; }
          .cf-right { width: 100%; padding: 24px 16px; align-items: flex-start; padding-top: 60px; }
          .cf-card { max-width: 100%; }
        }
      `}</style>

      <div className="cf-login-root">

        {/* Background */}
        <div className="cf-bg">
          <div className="cf-bg-grid" />
          <div className="cf-orb cf-orb-1" />
          <div className="cf-orb cf-orb-2" />
          <div className="cf-orb cf-orb-3" />
          <div className="cf-particles">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="cf-particle"
                style={{
                  left: `${(i * 5.3) % 100}%`,
                  animationDuration: `${8 + (i * 1.3) % 8}s`,
                  animationDelay: `${(i * 0.7) % 8}s`,
                  ['--drift' as string]: `${((i % 5) - 2) * 30}px`,
                  width: i % 3 === 0 ? '3px' : '2px',
                  height: i % 3 === 0 ? '3px' : '2px',
                  opacity: 0.4 + (i % 4) * 0.15,
                }}
              />
            ))}
          </div>
          <div className="cf-scanline" />
        </div>

        {/* ── Lado esquerdo ────────────────────────────── */}
        <div className="cf-left">
          <Link href="/" className="cf-logo">
            <div className="cf-logo-mark">
              <svg viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z" /></svg>
            </div>
            <span className="cf-logo-name">ClipForge</span>
          </Link>

          <div className="cf-hero">
            <div className="cf-eyebrow">
              <div className="cf-eyebrow-dot" />
              Plataforma de vídeos com IA
            </div>
            <h1 className="cf-headline">
              De uma ideia<br />
              a um vídeo<br />
              <span className="cf-headline-accent">que vende.</span>
            </h1>
            <p className="cf-subtext">
              Qualquer ideia vira vídeo pronto — para YouTube, TikTok Shop, ou onde sua audiência estiver. Roteiro, narração e edição, gerados por IA.
            </p>
            <div className="cf-features">
              {[
                { icon: "M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z", text: "Pipeline de 9 agentes de IA para qualquer formato longo" },
                { icon: "M9 12a4 4 0 100 8 4 4 0 000-8zM15 2v10M15 2a4 4 0 004 4", text: "Canvas de 4 blocos para TikTok Shop" },
                { icon: "M13 10V3L4 14h7v7l9-11h-7z", text: "Pesquisa, roteiro, narração e SEO automáticos" },
              ].map((f, i) => (
                <div key={i} className="cf-feature">
                  <div className="cf-feature-icon">
                    <svg viewBox="0 0 24 24"><path d={f.icon} /></svg>
                  </div>
                  {f.text}
                </div>
              ))}
            </div>
          </div>

          <div className="cf-footer-left">
            <span>© 2025 ClipForge</span>
            <span>·</span>
            <a href="#">Privacidade</a>
            <span>·</span>
            <a href="#">Termos</a>
          </div>
        </div>

        {/* ── Lado direito — formulário ─────────────────── */}
        <div className="cf-right">
          <div className="cf-card">

            {tab === "register" && (
              <div className="cf-bonus">
                <div className="cf-bonus-dot" />
                50 créditos grátis no cadastro
              </div>
            )}

            <div className="cf-tabs">
              <button
                className={`cf-tab ${tab === "login" ? "active" : ""}`}
                onClick={() => setTab("login")}
              >
                Entrar
              </button>
              <button
                className={`cf-tab ${tab === "register" ? "active" : ""}`}
                onClick={() => setTab("register")}
              >
                Criar conta
              </button>
            </div>

            <form className="cf-form" onSubmit={handleSubmit}>

              {error && (
                <div style={{
                  background: "rgba(240,68,68,0.10)",
                  border: "0.5px solid rgba(240,68,68,0.25)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  fontSize: "12px",
                  color: "#f87171",
                }}>
                  {error}
                </div>
              )}

              {tab === "register" && (
                <div className="cf-field">
                  <label className="cf-label">Nome</label>
                  <div className="cf-input-wrap">
                    <input
                      type="text"
                      className="cf-input"
                      placeholder="Seu nome completo"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                    <svg className="cf-input-icon" viewBox="0 0 24 24">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
                    </svg>
                  </div>
                </div>
              )}

              <div className="cf-field">
                <label className="cf-label">Email</label>
                <div className="cf-input-wrap">
                  <input
                    type="email"
                    className="cf-input"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <svg className="cf-input-icon" viewBox="0 0 24 24">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
              </div>

              <div className="cf-field">
                <label className="cf-label">Senha</label>
                <div className="cf-input-wrap">
                  <input
                    type={showPass ? "text" : "password"}
                    className="cf-input"
                    placeholder={tab === "register" ? "Mínimo 8 caracteres" : "Sua senha"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <svg className="cf-input-icon" viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  <button
                    type="button"
                    className="cf-eye-btn"
                    onClick={() => setShowPass(!showPass)}
                    aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                  >
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
                <div className="cf-forgot">
                  <a href="#">Esqueceu a senha?</a>
                </div>
              )}

              <button
                type="submit"
                className="cf-btn-submit"
                disabled={loading}
              >
                {loading ? (
                  <div className="cf-spinner" />
                ) : (
                  <>
                    {tab === "login" ? "Entrar na plataforma" : "Criar minha conta"}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>

              <div className="cf-divider">
                <div className="cf-divider-line" />
                <span>ou continue com</span>
                <div className="cf-divider-line" />
              </div>

              <button type="button" className="cf-btn-google" onClick={handleGoogle}>
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continuar com Google
              </button>

            </form>

            <div className="cf-card-footer">
              {tab === "login" ? (
                <>Não tem conta? <span style={{ cursor: "pointer", color: "#a99cf8" }} onClick={() => setTab("register")}>Criar grátis →</span></>
              ) : (
                <>Já tem conta? <span style={{ cursor: "pointer", color: "#a99cf8" }} onClick={() => setTab("login")}>Entrar →</span></>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
