"use client";

// ─────────────────────────────────────────────────────────────
// frontend/app/(dashboard)/page.tsx
// Home do usuário — acesso aos produtos + vídeos recentes
// ─────────────────────────────────────────────────────────────

import Link from "next/link";

// ── Tipos ────────────────────────────────────────────────────

type VideoType = "studio" | "tiktok" | "processing";

interface RecentVideo {
  id: string;
  title: string;
  type: VideoType;
  duration: string;
  date: string;
  emoji: string;
}

interface NewsItem {
  tag: string;
  tagColor: "purple" | "green" | "amber";
  title: string;
  desc: string;
  time: string;
}

// ── Dados mock (substituir por fetch real depois) ─────────────

const recentVideos: RecentVideo[] = [
  {
    id: "1",
    title: "Davi e Golias — documentário bíblico",
    type: "processing",
    duration: "8 min",
    date: "Hoje, 14h22",
    emoji: "🎬",
  },
  {
    id: "2",
    title: "Noé e o dilúvio — história completa",
    type: "studio",
    duration: "8 min",
    date: "Ontem",
    emoji: "📖",
  },
  {
    id: "3",
    title: "Tênis Nike Air Max — review unboxing",
    type: "tiktok",
    duration: "30s",
    date: "2 dias atrás",
    emoji: "🛍️",
  },
  {
    id: "4",
    title: "Propósito de vida — motivacional",
    type: "studio",
    duration: "5 min",
    date: "3 dias atrás",
    emoji: "💪",
  },
  {
    id: "5",
    title: "Kit de maquiagem — oferta relâmpago",
    type: "tiktok",
    duration: "15s",
    date: "5 dias atrás",
    emoji: "💄",
  },
];

const newsItems: NewsItem[] = [
  {
    tag: "Novo",
    tagColor: "purple",
    title: "Studio — Agente de música com Suno",
    desc: "Trilha sonora gerada automaticamente no estilo de cada vídeo.",
    time: "Hoje",
  },
  {
    tag: "TikTok",
    tagColor: "green",
    title: "Publicação direta no TikTok Shop",
    desc: "Conecte sua conta e publique sem sair do ClipForge.",
    time: "3 dias atrás",
  },
  {
    tag: "Melhoria",
    tagColor: "amber",
    title: "Velocidade de render 2× mais rápida",
    desc: "Migramos para Runway Gen-4 — qualidade e velocidade maiores.",
    time: "1 semana atrás",
  },
];

// ── Componentes auxiliares ────────────────────────────────────

function VideoBadge({ type }: { type: VideoType }) {
  const styles: Record<VideoType, string> = {
    studio:
      "bg-purple-dim text-purple-light border border-purple-border",
    tiktok:
      "bg-green-dim text-green border border-green-border",
    processing:
      "bg-amber-dim text-amber-400 border border-amber-400/20",
  };
  const labels: Record<VideoType, string> = {
    studio: "Studio",
    tiktok: "TikTok",
    processing: "Gerando...",
  };
  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${styles[type]}`}
    >
      {labels[type]}
    </span>
  );
}

function TagColor({
  color,
  children,
}: {
  color: "purple" | "green" | "amber";
  children: React.ReactNode;
}) {
  const styles = {
    purple: "text-purple-light",
    green: "text-green",
    amber: "text-amber-400",
  };
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wider ${styles[color]}`}
    >
      {children}
    </span>
  );
}

function DotColor({ color }: { color: "purple" | "green" | "amber" }) {
  const styles = {
    purple: "bg-purple",
    green: "bg-green",
    amber: "bg-amber-400",
  };
  return (
    <div
      className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${styles[color]}`}
    />
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="p-7 flex flex-col gap-6 max-w-[1080px]">

      {/* ── Criar novo vídeo ─────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-text-3 mb-3">
          Criar novo vídeo
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          {/* Studio card */}
          <Link
            href="/studio"
            className="group relative bg-surface border border-purple-border rounded-[14px] p-6 flex flex-col gap-4 hover:border-purple hover:bg-purple-dim transition-all duration-150 overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-purple" />
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-[11px] bg-purple-dim flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 stroke-purple fill-none stroke-[1.75]" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-purple mb-1">
                  Studio — YouTube
                </p>
                <h2 className="font-tight text-[17px] font-bold text-text tracking-tight mb-1">
                  Documentário com IA
                </h2>
                <p className="text-[12px] text-text-2 leading-relaxed">
                  Digite um tema e receba um vídeo completo — pesquisa, roteiro, narração, cenas e SEO prontos.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Pesquisa", "Roteiro", "Narração", "Cenas", "Edição", "SEO"].map((s) => (
                <span
                  key={s}
                  className="text-[11px] px-2.5 py-0.5 rounded-full border border-border bg-surface-2 text-text-3"
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-3">5 a 15 min · 40–80 créditos</span>
              <button className="flex items-center gap-1.5 bg-purple text-white text-[12px] font-medium px-4 py-2 rounded-[6px] hover:opacity-90 transition-opacity">
                <svg className="w-3.5 h-3.5 stroke-white fill-none stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Criar vídeo
              </button>
            </div>
          </Link>

          {/* Criativo de Produto card */}
          <Link
            href="/tiktok"
            className="group relative bg-surface border border-green-border rounded-[14px] p-6 flex flex-col gap-4 hover:border-green hover:bg-green-dim transition-all duration-150 overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-green" />
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-[11px] bg-green-dim flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 stroke-green fill-none stroke-[1.75]" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <path d="M8 21h8M12 17v4"/>
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-green mb-1">
                  Criativo de Produto
                </p>
                <h2 className="font-tight text-[17px] font-bold text-text tracking-tight mb-1">
                  Vídeo com avatar falante
                </h2>
                <p className="text-[12px] text-text-2 leading-relaxed">
                  Foto do produto → avatar → script → vídeo pronto. Para TikTok, Kwai, Reels e TikTok Shop.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Produto", "Avatar", "Script", "Gerar"].map((s) => (
                <span
                  key={s}
                  className="text-[11px] px-2.5 py-0.5 rounded-full border border-border bg-surface-2 text-text-3"
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-3">5 a 15s · 60–270 créditos</span>
              <button className="flex items-center gap-1.5 bg-green text-[#0c1a13] text-[12px] font-medium px-4 py-2 rounded-[6px] hover:opacity-90 transition-opacity">
                <svg className="w-3.5 h-3.5 stroke-current fill-none stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Criar vídeo
              </button>
            </div>
          </Link>

          {/* Instagram Dark card */}
          <Link
            href="/instagram-dark"
            className="group relative bg-surface rounded-[14px] p-6 flex flex-col gap-4 overflow-hidden transition-all duration-150"
            style={{ border: "1px solid rgba(245,158,11,0.25)" }}
          >
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: "#f59e0b" }} />
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-[11px] flex items-center justify-center flex-shrink-0 text-xl"
                style={{ background: "rgba(245,158,11,0.12)" }}>
                🌙
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#f59e0b" }}>
                  Instagram Dark
                </p>
                <h2 className="font-tight text-[17px] font-bold text-text tracking-tight mb-1">
                  Reels com capa nova
                </h2>
                <p className="text-[12px] text-text-2 leading-relaxed">
                  Cole o link de um perfil, escolha os Reels, crie uma capa nova — o sistema aplica em todos os vídeos baixados automaticamente.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Baixar Reels", "Capa nova", "Aplicar em lote"].map((s) => (
                <span
                  key={s}
                  className="text-[11px] px-2.5 py-0.5 rounded-full border border-border bg-surface-2 text-text-3"
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-3">Beta — em teste</span>
              <button
                className="flex items-center gap-1.5 text-[12px] font-medium px-4 py-2 rounded-[6px] hover:opacity-90 transition-opacity"
                style={{ background: "#f59e0b", color: "#1a1305" }}>
                Abrir ferramenta
              </button>
            </div>
          </Link>

        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2.5">
        {[
          { label: "Vídeos gerados", value: "23", delta: "↑ 3 esta semana", up: true },
          { label: "Créditos usados", value: "1.160", delta: "este mês", up: false },
          { label: "Tempo economizado", value: "31h", delta: "vs produção manual", up: true },
          { label: "Plano atual", value: "Pro", delta: "Renova em 14 dias", up: false },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-surface border border-border rounded-[10px] p-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-3 mb-1.5">
              {s.label}
            </p>
            <p className="font-tight text-2xl font-bold text-text tracking-tight leading-none mb-1">
              {s.value}
            </p>
            <p className={`text-[11px] ${s.up ? "text-green" : "text-text-3"}`}>
              {s.delta}
            </p>
          </div>
        ))}
      </div>

      {/* ── Bottom grid ───────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_340px] gap-3 items-start">

        {/* Vídeos recentes */}
        <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
          <div className="flex items-center px-5 py-3.5 border-b border-border">
            <span className="text-[13px] font-semibold text-text flex-1">
              Vídeos recentes
            </span>
            <Link href="/videos" className="text-[11px] text-text-3 hover:text-text-2 transition-colors">
              Ver todos →
            </Link>
          </div>

          {recentVideos.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3.5 px-5 py-3 border-b border-border last:border-0 hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <div className="w-11 h-11 rounded-[6px] bg-surface-3 border border-border flex items-center justify-center text-lg flex-shrink-0">
                {v.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-text truncate">{v.title}</p>
                <div className="flex gap-2.5 text-[11px] text-text-3 mt-0.5">
                  <span>{v.duration}</span>
                  <span>{v.date}</span>
                </div>
              </div>
              <VideoBadge type={v.type} />
              {v.type !== "processing" && (
                <div className="flex gap-1.5">
                  <button className="w-7 h-7 rounded-[6px] border border-border bg-surface-2 flex items-center justify-center hover:border-border-strong transition-colors">
                    <svg className="w-3.5 h-3.5 stroke-text-2 fill-none stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                  </button>
                  <button className="w-7 h-7 rounded-[6px] border border-border bg-surface-2 flex items-center justify-center hover:border-border-strong transition-colors">
                    <svg className="w-3.5 h-3.5 stroke-text-2 fill-none stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Coluna direita */}
        <div className="flex flex-col gap-3">

          {/* Em processamento */}
          <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
            <div className="flex items-center px-5 py-3.5 border-b border-border">
              <span className="text-[13px] font-semibold text-text flex-1">Em processamento</span>
              <span className="text-[11px] text-text-3 cursor-pointer hover:text-text-2">Ver fila</span>
            </div>
            <div className="px-5 py-3 flex items-center gap-2.5 border-b border-border">
              <div className="w-5 h-5 rounded-full border-2 border-purple-border border-t-purple animate-spin flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-text">Davi e Golias</p>
                <p className="text-[10px] text-text-3">Storyboard · etapa 3 de 9</p>
              </div>
              <span className="text-[11px] text-text-3">~9 min</span>
            </div>
            <div className="px-5 py-3 flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-green-dim border border-green-border flex items-center justify-center flex-shrink-0">
                <svg className="w-2.5 h-2.5 stroke-green fill-none stroke-[2.5]" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-text">Moisés no Egito</p>
                <p className="text-[10px] text-text-3">Concluído · 12 min</p>
              </div>
              <span className="text-[11px] text-green">Pronto</span>
            </div>
          </div>

          {/* Novidades */}
          <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
            <div className="flex items-center px-5 py-3.5 border-b border-border">
              <span className="text-[13px] font-semibold text-text flex-1">Novidades</span>
              <span className="text-[11px] text-text-3 cursor-pointer hover:text-text-2">Ver changelog</span>
            </div>
            {newsItems.map((n, i) => (
              <div key={i} className="flex gap-3 px-5 py-3 border-b border-border last:border-0">
                <div className="flex flex-col items-center flex-shrink-0">
                  <DotColor color={n.tagColor} />
                  {i < newsItems.length - 1 && (
                    <div className="w-px flex-1 bg-border mt-1" />
                  )}
                </div>
                <div className="pb-1">
                  <TagColor color={n.tagColor}>{n.tag}</TagColor>
                  <p className="text-[12px] font-medium text-text mt-0.5 mb-0.5">{n.title}</p>
                  <p className="text-[11px] text-text-2 leading-snug">{n.desc}</p>
                  <p className="text-[10px] text-text-3 mt-1">{n.time}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
