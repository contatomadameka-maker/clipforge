"use client";

// ─────────────────────────────────────────────────────────────
// frontend/app/admin/page.tsx
// Painel administrativo — só acessível por você (Dirlei)
// Usuários, MRR, custos de API, fila de jobs, atividade
// ─────────────────────────────────────────────────────────────

import { useState } from "react";

// ── Tipos ─────────────────────────────────────────────────────

type Plan = "starter" | "pro" | "creator" | "agency";
type UserStatus = "active" | "trial" | "churned";
type UserFilter = "all" | "pro" | "creator" | "agency" | "churned";

interface User {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  credits: number;
  videos: number;
  status: UserStatus;
  since: string;
  mrr: number;
}

// ── Mock data ─────────────────────────────────────────────────

const users: User[] = [
  { id: "1", name: "Lucas Ferreira",  email: "lucas@email.com",  plan: "creator", credits: 1840, videos: 47,  status: "active",  since: "Jan 2025", mrr: 199 },
  { id: "2", name: "Mariana Costa",   email: "mari@email.com",   plan: "pro",     credits: 320,  videos: 23,  status: "active",  since: "Fev 2025", mrr: 99  },
  { id: "3", name: "Rafael Souza",    email: "rafa@email.com",   plan: "agency",  credits: 3200, videos: 118, status: "active",  since: "Dez 2024", mrr: 349 },
  { id: "4", name: "Juliana Lima",    email: "ju@email.com",     plan: "starter", credits: 50,   videos: 4,   status: "trial",   since: "Jun 2025", mrr: 49  },
  { id: "5", name: "André Oliveira",  email: "andre@email.com",  plan: "pro",     credits: 0,    videos: 31,  status: "churned", since: "Nov 2024", mrr: 0   },
  { id: "6", name: "Camila Santos",   email: "cami@email.com",   plan: "creator", credits: 980,  videos: 62,  status: "active",  since: "Mar 2025", mrr: 199 },
  { id: "7", name: "Pedro Alves",     email: "pedro@email.com",  plan: "pro",     credits: 710,  videos: 19,  status: "active",  since: "Abr 2025", mrr: 99  },
];

const apiCosts = [
  { name: "Runway Gen-4",  cost: 810,  pct: 82 },
  { name: "ElevenLabs",    cost: 310,  pct: 38 },
  { name: "Shotstack",     cost: 180,  pct: 22 },
  { name: "Claude API",    cost: 74,   pct: 10 },
  { name: "HeyGen",        cost: 58,   pct: 8  },
  { name: "Outros",        cost: 46,   pct: 6  },
];

const events = [
  { type: "new",  text: "Rafael Souza fez upgrade para Agency",        time: "Há 14 min" },
  { type: "new",  text: "3 novos cadastros via Google OAuth",           time: "Há 1h"     },
  { type: "warn", text: "Runway API com latência alta — 4.2s média",   time: "Há 2h"     },
  { type: "info", text: "87 vídeos gerados hoje — novo recorde",       time: "Há 3h"     },
  { type: "new",  text: "Camila Santos assinou plano Creator",         time: "Há 5h"     },
  { type: "warn", text: "Saldo de créditos de André Oliveira zerado",  time: "Há 8h"     },
];

// ── Componentes auxiliares ────────────────────────────────────

function PlanBadge({ plan }: { plan: Plan }) {
  const styles: Record<Plan, string> = {
    starter: "bg-surface-3 text-text-3 border-border",
    pro:     "bg-purple-dim text-purple-light border-purple-border",
    creator: "bg-[rgba(124,109,245,0.18)] text-purple-light border-purple-border",
    agency:  "bg-amber-dim text-amber-400 border-amber-400/20",
  };
  const labels: Record<Plan, string> = {
    starter: "Starter", pro: "Pro", creator: "Creator", agency: "Agency",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${styles[plan]}`}>
      {labels[plan]}
    </span>
  );
}

function StatusDot({ status }: { status: UserStatus }) {
  const styles: Record<UserStatus, { dot: string; text: string; label: string }> = {
    active:  { dot: "bg-green",       text: "text-green",       label: "Ativo"  },
    trial:   { dot: "bg-amber-400",   text: "text-amber-400",   label: "Trial"  },
    churned: { dot: "bg-red-400",     text: "text-red-400",     label: "Churn"  },
  };
  const s = styles[status];
  return (
    <span className={`flex items-center gap-1.5 text-[11px] ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}

function MetricCard({ label, value, delta, up }: { label: string; value: string; delta: string; up?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-[10px] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-2">{label}</p>
      <p className="font-tight text-[24px] font-bold text-text tracking-tight leading-none mb-1">{value}</p>
      <p className={`text-[11px] ${up ? "text-green" : up === false ? "text-red-400" : "text-text-3"}`}>{delta}</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function AdminPage() {
  const [filter, setFilter] = useState<UserFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const filtered = users.filter((u) => {
    const matchFilter =
      filter === "all" ? true :
      filter === "churned" ? u.status === "churned" :
      u.plan === filter;
    const matchSearch =
      search === "" ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const totalMRR = users.filter((u) => u.status !== "churned").reduce((s, u) => s + u.mrr, 0);
  const activeUsers = users.filter((u) => u.status === "active").length;
  const totalVideos = users.reduce((s, u) => s + u.videos, 0);
  const totalApiCost = apiCosts.reduce((s, a) => s + a.cost, 0);

  return (
    <div className="flex min-h-screen bg-bg">

      {/* ── Sidebar admin ─────────────────────────────── */}
      <aside className="fixed top-0 left-0 bottom-0 w-[200px] bg-surface border-r border-border flex flex-col z-10">
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-border">
          <div className="w-7 h-7 rounded-[7px] bg-red-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 fill-white" viewBox="0 0 24 24">
              <path d="M12 1l3 6 6 .75-4.5 4.25L18 18l-6-3.25L6 18l1.5-6L3 7.75 9 7z"/>
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-text">ClipForge</p>
            <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Admin</p>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 flex flex-col gap-0.5">
          {[
            { label: "Dashboard",    active: true  },
            { label: "Usuários",     active: false },
            { label: "Receita",      active: false },
            { label: "APIs e custos",active: false },
            { label: "Fila de jobs", active: false },
            { label: "Créditos",     active: false },
            { label: "Feature flags",active: false },
            { label: "Alertas",      active: false },
          ].map((item) => (
            <button
              key={item.label}
              className={`flex items-center px-2.5 py-2 rounded-[6px] text-[12px] text-left transition-colors w-full
                ${item.active ? "bg-red-500/10 text-red-400" : "text-text-2 hover:bg-surface-2 hover:text-text"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-purple-dim border border-purple-border flex items-center justify-center text-[11px] font-semibold text-purple-light flex-shrink-0">
              DL
            </div>
            <div>
              <p className="text-[12px] font-medium text-text">Dirlei</p>
              <p className="text-[10px] text-text-3">Super admin</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────── */}
      <div className="ml-[200px] flex-1 flex flex-col">

        {/* Topbar */}
        <div className="h-12 bg-surface border-b border-border flex items-center px-6 gap-4 sticky top-0 z-5">
          <span className="text-[13px] font-semibold text-text flex-1">Dashboard</span>
          <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-[6px] px-3 py-1.5">
            <svg className="w-3.5 h-3.5 stroke-text-3 fill-none stroke-2" viewBox="0 0 24 24" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Buscar usuário ou email..."
              className="bg-transparent outline-none text-[12px] text-text placeholder:text-text-3 w-44"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="relative w-8 h-8 rounded-[6px] border border-border bg-surface-2 flex items-center justify-center text-text-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-400 border border-surface"/>
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* Métricas */}
          <div className="grid grid-cols-4 gap-3">
            <MetricCard label="Usuários ativos" value={String(activeUsers)} delta="↑ 12 esta semana" up={true} />
            <MetricCard label="MRR" value={`R$${totalMRR.toLocaleString("pt-BR")}`} delta="↑ 18% vs mês passado" up={true} />
            <MetricCard label="Vídeos gerados" value={String(totalVideos)} delta="↑ 87 hoje" up={true} />
            <MetricCard label="Custo de API" value={`R$${totalApiCost.toLocaleString("pt-BR")}`} delta="↑ 8% — monitorar" up={false} />
          </div>

          {/* Tabela de usuários */}
          <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
            <div className="flex items-center px-5 py-3 border-b border-border gap-3">
              <span className="text-[13px] font-semibold text-text flex-1">Usuários</span>
              <div className="flex gap-1.5">
                {(["all", "pro", "creator", "agency", "churned"] as UserFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`text-[11px] px-3 py-1 rounded-[5px] border transition-colors capitalize
                      ${filter === f
                        ? "bg-purple-dim text-purple-light border-purple-border"
                        : "border-border text-text-3 hover:border-border-strong hover:text-text-2"
                      }`}
                  >
                    {f === "all" ? "Todos" : f === "churned" ? "Churn" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  {["Nome", "Plano", "Créditos", "Vídeos", "Status", "Desde", "MRR", ""].map((h) => (
                    <th key={h} className="text-left text-[10px] font-semibold uppercase tracking-wider text-text-3 px-5 py-2.5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors cursor-pointer"
                    onClick={() => setSelectedUser(u)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-purple-dim border border-purple-border flex items-center justify-center text-[10px] font-semibold text-purple-light flex-shrink-0">
                          {u.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium text-text">{u.name}</p>
                          <p className="text-[10px] text-text-3">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3"><PlanBadge plan={u.plan} /></td>
                    <td className="px-5 py-3 text-text">{u.credits.toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-3 text-text">{u.videos}</td>
                    <td className="px-5 py-3"><StatusDot status={u.status} /></td>
                    <td className="px-5 py-3 text-text-3">{u.since}</td>
                    <td className="px-5 py-3">
                      <span className={u.mrr > 0 ? "text-green font-medium" : "text-text-3"}>
                        {u.mrr > 0 ? `R$${u.mrr}` : "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button className="text-[11px] text-purple-light hover:text-purple transition-colors">
                        Ver →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="text-center py-8 text-[12px] text-text-3">
                Nenhum usuário encontrado
              </div>
            )}
          </div>

          {/* Bottom grid */}
          <div className="grid grid-cols-2 gap-4">

            {/* Atividade recente */}
            <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <span className="text-[13px] font-semibold text-text">Atividade recente</span>
              </div>
              <div className="p-5 flex flex-col gap-0">
                {events.map((e, i) => (
                  <div key={i} className="flex gap-3 py-2.5 border-b border-border last:border-0">
                    <div className="flex flex-col items-center flex-shrink-0 pt-1">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0
                        ${e.type === "new" ? "bg-green" : e.type === "warn" ? "bg-amber-400" : "bg-border-strong"}`}
                      />
                      {i < events.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    <div>
                      <p className="text-[12px] text-text-2 leading-snug">{e.text}</p>
                      <p className="text-[10px] text-text-3 mt-0.5">{e.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custo por API */}
            <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center">
                <span className="text-[13px] font-semibold text-text flex-1">Custo por API — este mês</span>
                <span className="text-[11px] text-text-3">Total: R${totalApiCost.toLocaleString("pt-BR")}</span>
              </div>
              <div className="p-5 flex flex-col gap-3">
                {apiCosts.map((api) => (
                  <div key={api.name} className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-text-2 w-28 flex-shrink-0">{api.name}</span>
                    <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple rounded-full transition-all"
                        style={{ width: `${api.pct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-text-3 w-14 text-right flex-shrink-0">
                      R${api.cost}
                    </span>
                  </div>
                ))}
              </div>

              {/* Margem estimada */}
              <div className="mx-5 mb-5 p-3 bg-surface-2 border border-border rounded-[8px]">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-text-3">MRR</span>
                  <span className="text-text font-medium">R${totalMRR.toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-text-3">Custo APIs</span>
                  <span className="text-red-400 font-medium">− R${totalApiCost.toLocaleString("pt-BR")}</span>
                </div>
                <div className="h-px bg-border my-2" />
                <div className="flex justify-between text-[12px]">
                  <span className="text-text-3 font-semibold">Margem estimada</span>
                  <span className="text-green font-semibold">
                    R${(totalMRR - totalApiCost).toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Modal de usuário ──────────────────────────── */}
      {selectedUser && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="bg-surface border border-border rounded-[16px] w-full max-w-[420px] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-dim border border-purple-border flex items-center justify-center text-[13px] font-semibold text-purple-light">
                  {selectedUser.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-text">{selectedUser.name}</p>
                  <p className="text-[12px] text-text-3">{selectedUser.email}</p>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-text-3 hover:text-text transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                { label: "Plano", value: <PlanBadge plan={selectedUser.plan} /> },
                { label: "Status", value: <StatusDot status={selectedUser.status} /> },
                { label: "Créditos", value: selectedUser.credits.toLocaleString("pt-BR") },
                { label: "Vídeos", value: selectedUser.videos },
                { label: "MRR", value: selectedUser.mrr > 0 ? `R$${selectedUser.mrr}` : "—" },
                { label: "Desde", value: selectedUser.since },
              ].map((row) => (
                <div key={row.label} className="bg-surface-2 border border-border rounded-[8px] p-3">
                  <p className="text-[10px] text-text-3 uppercase tracking-wider mb-1">{row.label}</p>
                  <div className="text-[13px] font-medium text-text">{row.value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <button className="w-full py-2 rounded-[8px] bg-purple-dim border border-purple-border text-purple-light text-[12px] font-medium hover:bg-purple/20 transition-colors">
                Adicionar créditos manualmente
              </button>
              <button className="w-full py-2 rounded-[8px] bg-surface-2 border border-border text-text-2 text-[12px] font-medium hover:border-border-strong transition-colors">
                Alterar plano
              </button>
              <button className="w-full py-2 rounded-[8px] bg-red-500/10 border border-red-500/20 text-red-400 text-[12px] font-medium hover:bg-red-500/15 transition-colors">
                Suspender conta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
