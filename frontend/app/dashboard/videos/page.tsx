"use client";

// frontend/app/dashboard/videos/page.tsx
// Página de vídeos gerados — agora com dados reais do backend

import { useState, useEffect } from "react";
import { getSupabase } from "@/lib/supabase";

const API = "https://clipforge-6yzz.onrender.com";

interface Video {
  id: string;
  title: string;
  type: "tiktok" | "studio";
  status: "done" | "generating" | "failed";
  video_url?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  credits_used?: number;
  created_at: string;
  progress?: number;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d atrás`;
  if (hours > 0) return `${hours}h atrás`;
  return "Agora";
}

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "tiktok" | "studio" | "generating">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      const sb = getSupabase();
      sb.auth.getUser().then(({ data }: any) => {
        if (data?.user) {
          fetch(`${API}/videos/${data.user.id}`)
            .then(r => r.json())
            .then(d => setVideos(d.videos || []))
            .catch(() => {})
            .finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      });
    } catch {
      setLoading(false);
    }
  }, []);

  const filtered = videos.filter(v => {
    if (filter === "tiktok" && v.type !== "tiktok") return false;
    if (filter === "studio" && v.type !== "studio") return false;
    if (filter === "generating" && v.status !== "generating") return false;
    if (search && !v.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ padding: "24px 28px" }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-bold text-[#f0f0f5] mb-1" style={{ letterSpacing: "-0.02em" }}>
            Meus vídeos
          </h1>
          <p className="text-[13px] text-[#55556a]">{videos.length} vídeos gerados</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/tiktok"
            className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-semibold no-underline"
            style={{ background: "rgba(255,255,255,0.07)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.1)" }}>
            + TikTok Shop
          </a>
          <a href="/studio"
            className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-semibold no-underline"
            style={{ background: "#7c6df5", color: "#fff" }}>
            + Studio YouTube
          </a>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#55556a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Buscar vídeos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-[8px] text-sm outline-none placeholder-[#3a3a4a]"
            style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.08)" }}
          />
        </div>
        <div className="flex items-center gap-1.5 p-1 rounded-[8px]" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
          {[
            { id: "all", label: "Todos" },
            { id: "tiktok", label: "TikTok" },
            { id: "studio", label: "YouTube" },
            { id: "generating", label: "Gerando" },
          ].map(f => (
            <button key={f.id} type="button"
              onClick={() => setFilter(f.id as any)}
              className="px-3 py-1.5 rounded-[6px] text-xs font-medium cursor-pointer border-none transition-all"
              style={filter === f.id
                ? { background: "#7c6df5", color: "#fff" }
                : { background: "transparent", color: "#55556a" }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de vídeos */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-6 h-6 border-2 border-[#7c6df5]/30 border-t-[#7c6df5] rounded-full animate-spin" />
          <p className="text-[#55556a] text-sm">Carregando seus vídeos...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="text-4xl">🎬</div>
          <p className="text-[#55556a] text-sm">Nenhum vídeo encontrado</p>
          <a href="/tiktok" className="text-xs text-[#7c6df5] no-underline hover:underline">Criar primeiro vídeo →</a>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {filtered.map(video => (
            <div key={video.id} className="rounded-2xl overflow-hidden group"
              style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>

              {/* Thumbnail / preview */}
              <div className="relative" style={{ aspectRatio: video.type === "tiktok" ? "9/16" : "16/9", maxHeight: "200px", background: "#0c0c14" }}>
                {video.status === "done" && video.video_url ? (
                  <video src={video.video_url} className="w-full h-full object-cover" muted />
                ) : video.thumbnail_url ? (
                  <img src={video.thumbnail_url} className="w-full h-full object-cover" alt={video.title} />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                    <span className="text-3xl">{video.type === "tiktok" ? "📱" : "🎬"}</span>
                    <span className="text-xs text-[#55556a]">{video.type === "tiktok" ? "TikTok Shop" : "Studio"}</span>
                  </div>
                )}

                {/* Status overlay */}
                {video.status === "generating" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                    style={{ background: "rgba(0,0,0,0.7)" }}>
                    <div className="w-6 h-6 border-2 border-[#7c6df5]/30 border-t-[#7c6df5] rounded-full animate-spin" />
                    <span className="text-xs text-[#9090a8]">Gerando... {video.progress || 0}%</span>
                  </div>
                )}

                {video.status === "failed" && (
                  <div className="absolute inset-0 flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.7)" }}>
                    <span className="text-xs text-[#f87171]">❌ Falhou</span>
                  </div>
                )}

                {video.status === "done" && video.video_url && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "rgba(0,0,0,0.5)" }}>
                    <a href={video.video_url} target="_blank" rel="noopener noreferrer"
                      className="w-12 h-12 rounded-full flex items-center justify-center no-underline"
                      style={{ background: "#7c6df5" }}>
                      <svg className="w-5 h-5 fill-white ml-0.5" viewBox="0 0 24 24">
                        <path d="M5 3l14 9-14 9V3z"/>
                      </svg>
                    </a>
                  </div>
                )}

                {/* Badge tipo */}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={video.type === "tiktok"
                    ? { background: "rgba(0,0,0,0.7)", color: "#f0f0f5" }
                    : { background: "rgba(124,109,245,0.8)", color: "#fff" }}>
                  {video.type === "tiktok" ? "TikTok" : "YouTube"}
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <p className="text-sm font-medium text-[#f0f0f5] mb-1 truncate">{video.title}</p>
                <div className="flex items-center gap-2 text-[11px] text-[#55556a]">
                  {video.duration_seconds && <span>⏱ {video.duration_seconds}s</span>}
                  {video.credits_used !== undefined && <span>· {video.credits_used} créditos</span>}
                  <span>· {timeAgo(video.created_at)}</span>
                </div>

                {/* Ações */}
                {video.status === "done" && video.video_url && (
                  <div className="flex gap-2 mt-3">
                    <a href={video.video_url} download
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[8px] text-xs font-medium no-underline"
                      style={{ background: "rgba(124,109,245,0.15)", color: "#a99cf8", border: "0.5px solid rgba(124,109,245,0.25)" }}>
                      ⬇️ Baixar
                    </a>
                    <button type="button"
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-[8px] text-xs font-medium cursor-pointer border-none"
                      style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>
                      ↗ Publicar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
