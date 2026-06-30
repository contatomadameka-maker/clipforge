"use client";

// ─────────────────────────────────────────────────────────────
// frontend/app/settings/page.tsx
// Configurações da conta — perfil, senha, plano
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { getSupabase } from "@/lib/supabase";

type Tab = "profile" | "password" | "plan";

const plans = [
  { id: "starter", name: "Starter", price: "R$49", credits: "400", current: false },
  { id: "pro", name: "Pro", price: "R$99", credits: "1.000", current: true },
  { id: "creator", name: "Creator", price: "R$199", credits: "2.500", current: false },
  { id: "agency", name: "Agency", price: "R$349", credits: "5.000", current: false },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("profile");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [passMsg, setPassMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.user_metadata?.name || "");
      setEmail(user.email || "");
    }
  }, [user]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.updateUser({
        data: { name },
      });
      if (error) throw error;
      setProfileMsg("Perfil atualizado.");
    } catch (err: any) {
      setProfileMsg("Não foi possível salvar. Tenta de novo.");
    } finally {
      setSavingProfile(false);
      setTimeout(() => setProfileMsg(null), 3000);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassMsg(null);

    if (newPass.length < 8) {
      setPassMsg({ type: "error", text: "A nova senha precisa ter no mínimo 8 caracteres." });
      return;
    }
    if (newPass !== confirmPass) {
      setPassMsg({ type: "error", text: "As senhas não coincidem." });
      return;
    }

    setSavingPass(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      setPassMsg({ type: "ok", text: "Senha alterada com sucesso." });
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (err: any) {
      setPassMsg({ type: "error", text: "Não foi possível alterar a senha." });
    } finally {
      setSavingPass(false);
    }
  }

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div style={{ padding: "28px", maxWidth: "760px", display: "flex", flexDirection: "column", gap: "24px" }}>

      <div>
        <h1 style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: "22px", fontWeight: 700, color: "#f0f0f5", letterSpacing: "-0.02em", marginBottom: "4px" }}>
          Configurações
        </h1>
        <p style={{ fontSize: "13px", color: "#9090a8" }}>Gerencie seu perfil, senha e plano</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        {[
          { id: "profile" as Tab, label: "Perfil" },
          { id: "password" as Tab, label: "Senha" },
          { id: "plan" as Tab, label: "Plano e créditos" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 16px",
              fontSize: "13px",
              fontWeight: 500,
              background: "none",
              border: "none",
              borderBottom: tab === t.id ? "2px solid #7c6df5" : "2px solid transparent",
              color: tab === t.id ? "#f0f0f5" : "#55556a",
              cursor: "pointer",
              marginBottom: "-1px",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Perfil ─────────────────────────────────── */}
      {tab === "profile" && (
        <div style={{ background: "#131318", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
            <div style={{
              width: "64px", height: "64px", borderRadius: "50%",
              background: "rgba(124,109,245,0.12)", border: "1px solid rgba(124,109,245,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "20px", fontWeight: 600, color: "#a99cf8",
            }}>
              {initials}
            </div>
            <div>
              <p style={{ fontSize: "14px", fontWeight: 500, color: "#f0f0f5" }}>Foto do perfil</p>
              <p style={{ fontSize: "12px", color: "#55556a" }}>Em breve você poderá enviar uma imagem</p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 500, color: "#9090a8", display: "block", marginBottom: "6px" }}>Nome</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                placeholder="Seu nome"
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 500, color: "#9090a8", display: "block", marginBottom: "6px" }}>Email</label>
              <input
                type="email"
                value={email}
                disabled
                style={{ ...inputStyle, opacity: 0.5, cursor: "not-allowed" }}
              />
              <p style={{ fontSize: "11px", color: "#55556a", marginTop: "6px" }}>O email não pode ser alterado por aqui.</p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
              <button type="submit" disabled={savingProfile} style={btnPrimaryStyle}>
                {savingProfile ? "Salvando..." : "Salvar alterações"}
              </button>
              {profileMsg && <span style={{ fontSize: "12px", color: "#3ecf8e" }}>{profileMsg}</span>}
            </div>
          </form>
        </div>
      )}

      {/* ── Senha ──────────────────────────────────── */}
      {tab === "password" && (
        <div style={{ background: "#131318", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "24px" }}>
          <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "360px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 500, color: "#9090a8", display: "block", marginBottom: "6px" }}>Nova senha</label>
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                style={inputStyle}
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 500, color: "#9090a8", display: "block", marginBottom: "6px" }}>Confirmar nova senha</label>
              <input
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                style={inputStyle}
                placeholder="Repita a nova senha"
              />
            </div>

            {passMsg && (
              <p style={{ fontSize: "12px", color: passMsg.type === "ok" ? "#3ecf8e" : "#f87171" }}>
                {passMsg.text}
              </p>
            )}

            <button type="submit" disabled={savingPass} style={{ ...btnPrimaryStyle, alignSelf: "flex-start" }}>
              {savingPass ? "Alterando..." : "Alterar senha"}
            </button>
          </form>
        </div>
      )}

      {/* ── Plano ──────────────────────────────────── */}
      {tab === "plan" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ background: "#131318", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: "12px", color: "#55556a", marginBottom: "4px" }}>Créditos restantes</p>
              <p style={{ fontSize: "24px", fontWeight: 700, color: "#f0f0f5" }}>840 <span style={{ fontSize: "14px", fontWeight: 400, color: "#55556a" }}>/ 2.000</span></p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "12px", color: "#55556a", marginBottom: "4px" }}>Renova em</p>
              <p style={{ fontSize: "16px", fontWeight: 500, color: "#f0f0f5" }}>14 dias</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {plans.map((p) => (
              <div
                key={p.id}
                style={{
                  background: "#131318",
                  border: p.current ? "2px solid #7c6df5" : "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "12px",
                  padding: "18px",
                  position: "relative",
                }}
              >
                {p.current && (
                  <span style={{
                    position: "absolute", top: "-10px", left: "16px",
                    background: "#7c6df5", color: "#fff", fontSize: "10px", fontWeight: 600,
                    padding: "3px 10px", borderRadius: "20px",
                  }}>
                    Plano atual
                  </span>
                )}
                <p style={{ fontSize: "15px", fontWeight: 600, color: "#f0f0f5", marginBottom: "2px" }}>{p.name}</p>
                <p style={{ fontSize: "20px", fontWeight: 700, color: "#f0f0f5", marginBottom: "8px" }}>
                  {p.price}<span style={{ fontSize: "12px", fontWeight: 400, color: "#55556a" }}>/mês</span>
                </p>
                <p style={{ fontSize: "12px", color: "#9090a8", marginBottom: "14px" }}>{p.credits} créditos</p>
                {!p.current && (
                  <button style={{ ...btnSecondaryStyle, width: "100%" }}>
                    Mudar para {p.name}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sair ───────────────────────────────────── */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: "20px" }}>
        <button onClick={handleLogout} style={btnDangerStyle}>
          Sair da conta
        </button>
      </div>

    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "40px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  padding: "0 12px",
  fontSize: "13px",
  color: "#f0f0f5",
  outline: "none",
  fontFamily: "inherit",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: "8px",
  border: "none",
  background: "#7c6df5",
  color: "#fff",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "6px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "#9090a8",
  fontSize: "12px",
  fontWeight: 500,
  cursor: "pointer",
};

const btnDangerStyle: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: "8px",
  border: "1px solid rgba(240,68,68,0.25)",
  background: "rgba(240,68,68,0.10)",
  color: "#f87171",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
};
