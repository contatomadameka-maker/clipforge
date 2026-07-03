"use client";

// frontend/app/settings/page.tsx
// Página de configurações com planos e pagamento

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API = "https://clipforge-6yzz.onrender.com";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    credits: 200,
    color: "#7c6df5",
    badge: null,
    features: ["200 créditos/mês", "Criativo de Produto", "Suporte por email"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 97,
    credits: 600,
    color: "#3ecf8e",
    badge: "Mais popular",
    features: ["600 créditos/mês", "Criativo + Studio YouTube", "Prioridade na fila", "Suporte prioritário"],
  },
  {
    id: "agency",
    name: "Agency",
    price: 197,
    credits: 1500,
    color: "#f59e0b",
    badge: null,
    features: ["1.500 créditos/mês", "Tudo do Pro", "Múltiplos usuários", "Gerente de conta"],
  },
];

type Tab = "plan" | "profile" | "password";

export default function SettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("plan");
  const [loading, setLoading] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [currentPlan, setCurrentPlan] = useState<string>("free");
  const [credits, setCredits] = useState<number>(50);

  // Perfil
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // Senha
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [passMsg, setPassMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "plan") setTab("plan");
    if (params.get("payment") === "success") {
      setTab("plan");
    }

    try {
      const { getSupabase } = require("@/lib/supabase");
      const sb = getSupabase();
      sb.auth.getUser().then(({ data }: any) => {
        if (data?.user) {
          setUserId(data.user.id);
          setUserEmail(data.user.email || "");
          setName(data.user.user_metadata?.name || "");
          fetch(`${API}/credits/${data.user.id}`)
            .then(r => r.json())
            .then(d => { if (d.balance !== undefined) setCredits(d.balance); })
            .catch(() => {});
        }
      });
    } catch {}
  }, []);

  async function handleCheckout(planId: string) {
    setLoading(planId);
    try {
      let uid = userId;
      let email = userEmail;

      // Tenta pegar do Supabase se não tiver
      if (!uid || !email) {
        try {
          const { getSupabase } = require("@/lib/supabase");
          const sb = getSupabase();
          const { data } = await sb.auth.getUser();
          uid = data?.user?.id || "";
          email = data?.user?.email || "";
        } catch {}
      }

      const res = await fetch(`${API}/stripe/create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planId,
          user_id: uid || "anonymous",
          user_email: email || "user@clipforge.com",
        }),
      });
      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        alert("Erro ao criar checkout: " + (data.detail || "Tente novamente"));
      }
    } catch (e) {
      alert("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(null);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { getSupabase } = require("@/lib/supabase");
      const sb = getSupabase();
      await sb.auth.updateUser({ data: { name } });
      setProfileMsg("Perfil atualizado!");
      setTimeout(() => setProfileMsg(null), 3000);
    } catch {
      setProfileMsg("Erro ao salvar.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPass !== confirmPass) {
      setPassMsg({ type: "error", text: "As senhas não coincidem." });
      return;
    }
    if (newPass.length < 8) {
      setPassMsg({ type: "error", text: "Mínimo 8 caracteres." });
      return;
    }
    setSavingPass(true);
    try {
      const { getSupabase } = require("@/lib/supabase");
      const sb = getSupabase();
      await sb.auth.updateUser({ password: newPass });
      setPassMsg({ type: "ok", text: "Senha alterada com sucesso!" });
      setNewPass(""); setConfirmPass("");
    } catch {
      setPassMsg({ type: "error", text: "Erro ao alterar senha." });
    } finally {
      setSavingPass(false);
    }
  }

  async function handleLogout() {
    try {
      const { getSupabase } = require("@/lib/supabase");
      const sb = getSupabase();
      await sb.auth.signOut();
    } catch {}
    router.push("/login");
  }

  return (
    <div style={{ padding: "24px 28px", maxWidth: "860px" }}>
      <div className="mb-6">
        <h1 className="text-[20px] font-bold text-[#f0f0f5] mb-1" style={{ letterSpacing: "-0.02em" }}>
          Configurações
        </h1>
        <p className="text-[13px] text-[#55556a]">Gerencie seu perfil, senha e plano</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        {[
          { id: "plan" as Tab, label: "Plano e créditos" },
          { id: "profile" as Tab, label: "Perfil" },
          { id: "password" as Tab, label: "Senha" },
        ].map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className="px-4 py-2.5 text-[13px] font-medium cursor-pointer border-none bg-transparent transition-all"
            style={{
              color: tab === t.id ? "#f0f0f5" : "#55556a",
              borderBottom: tab === t.id ? "2px solid #7c6df5" : "2px solid transparent",
              marginBottom: "-1px",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Plano ── */}
      {tab === "plan" && (
        <div className="flex flex-col gap-5">
          {/* Saldo atual */}
          <div className="rounded-[14px] p-5 flex items-center justify-between"
            style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
            <div>
              <p className="text-[12px] text-[#55556a] mb-1">Créditos disponíveis</p>
              <p className="text-[28px] font-bold text-[#f0f0f5]">
                {credits.toLocaleString()}
                <span className="text-[14px] font-normal text-[#55556a] ml-1">/ mês</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[12px] text-[#55556a] mb-1">Plano atual</p>
              <p className="text-[16px] font-semibold text-[#f0f0f5] capitalize">{currentPlan === "free" ? "Gratuito" : currentPlan}</p>
            </div>
          </div>

          {/* Grid de planos */}
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {PLANS.map(plan => (
              <div key={plan.id} className="rounded-[14px] p-5 flex flex-col gap-4 relative"
                style={{
                  background: "rgba(16,16,22,0.95)",
                  border: `0.5px solid ${currentPlan === plan.id ? plan.color : "rgba(255,255,255,0.08)"}`,
                  boxShadow: currentPlan === plan.id ? `0 0 0 1px ${plan.color}33` : "none",
                }}>

                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap"
                    style={{ background: plan.color, color: "#fff" }}>
                    {plan.badge}
                  </div>
                )}

                <div>
                  <p className="text-[11px] font-semibold mb-2" style={{ color: plan.color, letterSpacing: "0.08em" }}>
                    {plan.name.toUpperCase()}
                  </p>
                  <p className="text-[32px] font-bold text-[#f0f0f5] leading-none">
                    R${plan.price}
                    <span className="text-[13px] font-normal text-[#55556a]">/mês</span>
                  </p>
                  <p className="text-[12px] text-[#55556a] mt-1">{plan.credits.toLocaleString()} créditos</p>
                </div>

                <div className="flex flex-col gap-2 flex-1">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: `${plan.color}22` }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={plan.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                      <span className="text-[12px] text-[#9090a8]">{f}</span>
                    </div>
                  ))}
                </div>

                <button type="button"
                  onClick={() => handleCheckout(plan.id)}
                  disabled={loading === plan.id || currentPlan === plan.id}
                  className="w-full h-10 rounded-[8px] text-[13px] font-semibold cursor-pointer border-none transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: currentPlan === plan.id ? "rgba(255,255,255,0.05)" : plan.color,
                    color: currentPlan === plan.id ? "#55556a" : "#fff",
                  }}>
                  {loading === plan.id ? "Redirecionando..." : currentPlan === plan.id ? "Plano atual" : `Assinar ${plan.name}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Perfil ── */}
      {tab === "profile" && (
        <div className="rounded-[14px] p-6"
          style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-4 max-w-sm">
            <div>
              <label className="text-[12px] font-medium text-[#9090a8] block mb-1.5">Nome</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Seu nome"
                className="w-full h-10 px-3 rounded-[8px] text-sm outline-none placeholder-[#3a3a4a]"
                style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium text-[#9090a8] block mb-1.5">Email</label>
              <input type="email" value={userEmail} disabled
                className="w-full h-10 px-3 rounded-[8px] text-sm outline-none opacity-50"
                style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", cursor: "not-allowed" }} />
              <p className="text-[11px] text-[#55556a] mt-1">O email não pode ser alterado.</p>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={savingProfile}
                className="px-4 py-2 rounded-[8px] text-[13px] font-semibold cursor-pointer border-none"
                style={{ background: "#7c6df5", color: "#fff" }}>
                {savingProfile ? "Salvando..." : "Salvar"}
              </button>
              {profileMsg && <span className="text-[12px] text-[#3ecf8e]">{profileMsg}</span>}
            </div>
          </form>
        </div>
      )}

      {/* ── Senha ── */}
      {tab === "password" && (
        <div className="rounded-[14px] p-6"
          style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4 max-w-sm">
            <div>
              <label className="text-[12px] font-medium text-[#9090a8] block mb-1.5">Nova senha</label>
              <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full h-10 px-3 rounded-[8px] text-sm outline-none placeholder-[#3a3a4a]"
                style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
            </div>
            <div>
              <label className="text-[12px] font-medium text-[#9090a8] block mb-1.5">Confirmar nova senha</label>
              <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full h-10 px-3 rounded-[8px] text-sm outline-none placeholder-[#3a3a4a]"
                style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
            </div>
            {passMsg && (
              <p className="text-[12px]" style={{ color: passMsg.type === "ok" ? "#3ecf8e" : "#f87171" }}>
                {passMsg.text}
              </p>
            )}
            <button type="submit" disabled={savingPass}
              className="w-fit px-4 py-2 rounded-[8px] text-[13px] font-semibold cursor-pointer border-none"
              style={{ background: "#7c6df5", color: "#fff" }}>
              {savingPass ? "Alterando..." : "Alterar senha"}
            </button>
          </form>
        </div>
      )}

      {/* Sair */}
      <div className="mt-8 pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <button type="button" onClick={handleLogout}
          className="px-4 py-2 rounded-[8px] text-[13px] font-medium cursor-pointer border-none transition-all"
          style={{ background: "rgba(240,68,68,0.1)", color: "#f87171", border: "0.5px solid rgba(240,68,68,0.2)" }}>
          Sair da conta
        </button>
      </div>
    </div>
  );
}
