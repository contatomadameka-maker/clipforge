"use client";

// ─────────────────────────────────────────────────────────────
// frontend/app/tiktok/canvas.tsx
// Canvas visual — arquitetura modular (Mídia / Gerador / Resultado)
// ─────────────────────────────────────────────────────────────
// Redesenho inspirado no fluxo do PipClip: em vez de 5 blocos fixos
// obrigatórios, o canvas agora tem 3 tipos de nó flexíveis:
//   - Mídia    → uma imagem (produto ou persona), reaproveitável
//   - Gerador  → painel único de configuração (tipo, cena, fala,
//                duração, formato) que consome as Mídias conectadas
//   - Resultado → aparece conectado automaticamente ao clicar em
//                 "Gerar", mostra progresso e o vídeo final

import { useState, useCallback, useRef, useEffect } from "react";
import { getSupabase } from "@/lib/supabase";
import { ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  Position,
  BackgroundVariant,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const API = "https://clipforge-6yzz.onrender.com";

// ── Tipos de bloco ────────────────────────────────────────────

type BlockType = "midia" | "gerador" | "resultado";
type MidiaRole = "produto" | "persona";

interface BlockData extends Record<string, unknown> {
  label: string;
  type: BlockType;
  // midia
  role?: MidiaRole;
  imageUrl?: string;
  productName?: string;
  category?: string;
  uploading?: boolean;
  // gerador
  tipo?: string; // por enquanto só "video_produto" (Seedance)
  personaDescription?: string;
  scenePrompt?: string;
  dialogue?: string;
  freePrompt?: string;
  motionPrompt?: string;
  duration?: string; // "5" | "10" | "15"
  aspectRatio?: string;
  resolution?: string;
  avatarStyle?: string;
  // resultado
  status?: "processing" | "done" | "error";
  progress?: number;
  videoUrl?: string;
  errorMsg?: string;
  // Rótulo amigável da etapa atual (ex: "Gerando vídeo...", "Dublando pra PT-BR...")
  // — pipelines de 2 fases (Kling + HeyGen) mostram qual das duas está rodando,
  // em vez de um "Gerando..." genérico que não dá pra saber se travou ou não.
  stageLabel?: string;
}

const ROLE_CONFIG: Record<MidiaRole, { color: string; icon: string; label: string }> = {
  produto:  { color: "#a99cf8", icon: "🛍️", label: "Produto" },
  persona:  { color: "#3ecf8e", icon: "🧑‍🎤", label: "Persona" },
};

const GERADOR_TIPOS: Record<string, { label: string; desc: string; icon: string }> = {
  video_produto:  { label: "Vídeo de Produto", desc: "Produto + persona (foto ou texto) + cena + fala, tudo em 1 geração", icon: "🛍️" },
  criacao_livre:  { label: "Criação Livre de Vídeo", desc: "Prompt livre, com ou sem imagem de referência conectada", icon: "🎥" },
  modo_cena:      { label: "Modo Cena", desc: "Cenário/ambiente em movimento, sem avatar, sem fala", icon: "🎬" },
  animar_imagem:  { label: "Animar Imagem", desc: "Anima 1 imagem conectada com um movimento simples, sem diálogo", icon: "✨" },
  persona_fixa:   { label: "Persona Fixa (Kling)", desc: "Mantém o MESMO rosto da sua influencer entre vídeos — motor diferente do Vídeo de Produto", icon: "👤" },
};

// Créditos por segundo, por resolução — 720p custa 2,25x mais na
// Replicate ($0,18/s vs $0,08/s em 480p), então a taxa de créditos
// segue essa mesma proporção pra manter a margem consistente.
// 1080p removido por ora — sem confirmação de preço real na Replicate
// pro Seedance 2.0 nessa resolução.
const RESOLUTION_RATE: Record<string, number> = { "480p": 12, "720p": 27 };
function computeCost(duration: string, resolution: string): number {
  const rate = RESOLUTION_RATE[resolution] ?? RESOLUTION_RATE["480p"];
  return parseInt(duration || "10") * rate;
}

const handleStyle = {
  width: 14, height: 14, background: "#7c6df5",
  border: "3px solid #131318", borderRadius: "50%", cursor: "crosshair",
};

// ── Nó: Mídia ──────────────────────────────────────────────────

function MidiaNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  const role = d.role || "produto";
  const cfg = ROLE_CONFIG[role];
  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <div
        className="relative rounded-2xl cursor-pointer transition-all duration-150"
        style={{
          width: 190,
          background: "rgba(14,14,20,0.98)",
          border: `1px solid ${selected ? cfg.color : "rgba(255,255,255,0.1)"}`,
          boxShadow: selected ? `0 0 0 2px ${cfg.color}33, 0 20px 40px rgba(0,0,0,0.5)` : "0 4px 20px rgba(0,0,0,0.4)",
        }}
        onDoubleClick={() => (data as any).onConfigure?.()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
            style={{ background: `${cfg.color}22`, border: `0.5px solid ${cfg.color}44` }}>
            {cfg.icon}
          </div>
          <p className="text-xs font-semibold flex-1" style={{ color: cfg.color }}>{cfg.label}</p>
          <button className="w-5 h-5 rounded-md flex items-center justify-center border-none cursor-pointer"
            style={{ background: "rgba(248,113,113,0.1)" }}
            onClick={e => { e.stopPropagation(); (data as any).onDelete?.(); }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-2.5">
          {d.imageUrl ? (
            <div className="relative rounded-lg overflow-hidden" style={{ height: "90px" }}>
              <img src={d.imageUrl} className="w-full h-full object-cover" alt="" />
            </div>
          ) : d.uploading ? (
            <div className="flex flex-col items-center justify-center py-4 gap-1.5">
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${cfg.color}33`, borderTopColor: cfg.color }} />
              <p className="text-[10px] text-[#9090a8]">Enviando...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 gap-1">
              <span className="text-xl">{cfg.icon}</span>
              <p className="text-[10px] text-[#55556a]">Duplo clique p/ enviar</p>
            </div>
          )}
          {d.productName && <p className="text-[10px] text-[#9090a8] mt-1.5 truncate">{d.productName}</p>}
          {d.personaDescription && !d.imageUrl && (
            <p className="text-[10px] text-[#9090a8] mt-1.5 line-clamp-2">{d.personaDescription}</p>
          )}
        </div>
      </div>
    </>
  );
}

// ── Nó: Gerador ─────────────────────────────────────────────────

function GeradorNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  const tipo = GERADOR_TIPOS[d.tipo || "video_produto"];
  const dur = d.duration || "10";
  const res = d.resolution || "480p";
  const cost = computeCost(dur, res);

  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <div
        className="relative rounded-2xl cursor-pointer transition-all duration-150"
        style={{
          width: 260,
          background: "rgba(14,14,20,0.98)",
          border: `1px solid ${selected ? "#7c6df5" : "rgba(255,255,255,0.1)"}`,
          boxShadow: selected ? "0 0 0 2px rgba(124,109,245,0.2), 0 20px 40px rgba(0,0,0,0.5)" : "0 4px 20px rgba(0,0,0,0.4)",
        }}
        onDoubleClick={() => (data as any).onConfigure?.()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
            style={{ background: "rgba(124,109,245,0.15)", border: "0.5px solid rgba(124,109,245,0.4)" }}>
            {tipo.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#a99cf8] leading-none mb-0.5">Gerador</p>
            <p className="text-[10px] text-[#55556a] truncate">{tipo.label}</p>
          </div>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
            {cost} cr
          </span>
          <button className="w-5 h-5 rounded-md flex items-center justify-center border-none cursor-pointer flex-shrink-0"
            style={{ background: "rgba(248,113,113,0.1)" }}
            onClick={e => { e.stopPropagation(); (data as any).onDelete?.(); }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="px-4 py-3 flex flex-col gap-2">
          {d.tipo === "criacao_livre" && (
            d.freePrompt
              ? <p className="text-[11px] text-[#9090a8] line-clamp-3">✍️ {d.freePrompt}</p>
              : <p className="text-[11px] text-[#55556a] italic">Duplo clique para escrever o prompt</p>
          )}
          {d.tipo === "modo_cena" && (
            d.scenePrompt
              ? <p className="text-[11px] text-[#9090a8] line-clamp-3">🎬 {d.scenePrompt}</p>
              : <p className="text-[11px] text-[#55556a] italic">Duplo clique para descrever a cena</p>
          )}
          {d.tipo === "animar_imagem" && (
            d.motionPrompt
              ? <p className="text-[11px] text-[#9090a8] line-clamp-3">✨ {d.motionPrompt}</p>
              : <p className="text-[11px] text-[#55556a] italic">Duplo clique para descrever o movimento</p>
          )}
          {(!d.tipo || d.tipo === "video_produto") && (
            <>
              {d.scenePrompt ? (
                <p className="text-[11px] text-[#9090a8] line-clamp-2">🎬 {d.scenePrompt}</p>
              ) : (
                <p className="text-[11px] text-[#55556a] italic">Duplo clique para configurar cena e fala</p>
              )}
              {d.dialogue && (
                <p className="text-[11px] text-[#9090a8] line-clamp-2">💬 "{d.dialogue}"</p>
              )}
            </>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "#9090a8" }}>{dur}s</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "#9090a8" }}>{d.aspectRatio || "9:16"}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "#9090a8" }}>{d.resolution || "480p"}</span>
          </div>
          <button type="button"
            onClick={e => { e.stopPropagation(); (data as any).onGenerate?.(); }}
            className="w-full h-9 rounded-[8px] text-xs font-semibold cursor-pointer border-none flex items-center justify-center gap-1.5 mt-1"
            style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            Gerar ({cost} cr)
          </button>
        </div>
      </div>
    </>
  );
}

// ── Download forçado via blob (contorna restrição cross-origin) ─
async function downloadVideoBlob(url: string, filename: string, onStart?: () => void, onEnd?: () => void) {
  onStart?.();
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback: se o fetch falhar (ex: CORS bloqueado na origem), abre em nova aba
    window.open(url, "_blank");
  } finally {
    onEnd?.();
  }
}

// ── Nó: Resultado ────────────────────────────────────────────────

function ResultadoNode({ data }: NodeProps) {
  const d = data as BlockData;
  const [downloading, setDownloading] = useState(false);
  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="relative rounded-2xl" style={{ width: 220, background: "rgba(14,14,20,0.98)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
            style={{ background: d.status === "done" ? "rgba(62,207,142,0.15)" : d.status === "error" ? "rgba(248,113,113,0.15)" : "rgba(96,165,250,0.15)" }}>
            {d.status === "done" ? "✅" : d.status === "error" ? "⚠️" : "⏳"}
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-[#f0f0f5]">Resultado</p>
            <p className="text-[10px] text-[#55556a]">
              {d.status === "done" ? "Pronto!" : d.status === "error" ? "Falhou" : "Gerando..."}
            </p>
          </div>
          <button className="w-5 h-5 rounded-md flex items-center justify-center border-none cursor-pointer flex-shrink-0"
            style={{ background: "rgba(248,113,113,0.1)" }}
            onClick={e => { e.stopPropagation(); (data as any).onDelete?.(); }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="px-4 py-3">
          {d.status === "processing" && (
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-[10px] text-[#9090a8]">{d.stageLabel || "Criando algo incrível..."}</span>
                <span className="text-[10px] text-[#60a5fa] font-medium">{d.progress || 0}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${d.progress || 0}%`, background: "linear-gradient(90deg,#7c6df5,#3ecf8e)" }} />
              </div>
            </div>
          )}
          {d.status === "done" && d.videoUrl && (
            <div className="flex flex-col gap-2">
              <video src={d.videoUrl} className="w-full rounded-lg" style={{ maxHeight: "160px" }} controls muted />
              {d.errorMsg && (
                <p className="text-[10px] text-[#f59e0b] leading-relaxed">⚠️ {d.errorMsg}</p>
              )}
              <button type="button" disabled={downloading}
                onClick={() => downloadVideoBlob(d.videoUrl as string, `video-${Date.now()}.mp4`, () => setDownloading(true), () => setDownloading(false))}
                className="flex items-center justify-center gap-1.5 py-1.5 rounded-[6px] text-[10px] font-medium border-none cursor-pointer disabled:opacity-50"
                style={{ background: "rgba(62,207,142,0.15)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.3)" }}>
                {downloading ? "⏳ Baixando..." : "⬇️ Baixar vídeo"}
              </button>
            </div>
          )}
          {d.status === "error" && (
            <p className="text-[11px] text-[#f87171]">{d.errorMsg || "Erro desconhecido"}</p>
          )}
        </div>
      </div>
    </>
  );
}

const nodeTypes = { midia: MidiaNode, gerador: GeradorNode, resultado: ResultadoNode };

// ── Painel de configuração — Mídia ──────────────────────────────

// ── Galeria de mídia já enviada (localStorage) ──────────────────
// Guarda as últimas imagens enviadas pra reaproveitar sem precisar
// subir do zero toda vez — igual ao comportamento visto no PipClip.
interface GalleryItem { url: string; label: string; uploadedAt: number }
const GALLERY_KEY = "clipforge_gallery";

function getGallery(): GalleryItem[] {
  try { return JSON.parse(localStorage.getItem(GALLERY_KEY) || "[]"); } catch { return []; }
}
function addToGallery(url: string, label: string) {
  try {
    const gallery = getGallery().filter(g => g.url !== url);
    gallery.unshift({ url, label, uploadedAt: Date.now() });
    localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery.slice(0, 60)));
  } catch {}
}

function GalleryPickerModal({ onSelect, onUploadNew, onClose }: {
  onSelect: (url: string) => void;
  onUploadNew: () => void;
  onClose: () => void;
}) {
  const items = getGallery();
  return (
    <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ background: "#131318", border: "1px solid rgba(255,255,255,0.1)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
          <div>
            <p className="text-sm font-bold text-[#f0f0f5]">Escolher imagem</p>
            <p className="text-[10px] text-[#55556a]">Já enviadas antes, ou envie uma nova</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer text-[#55556a]" style={{ background: "rgba(255,255,255,0.05)" }}>✕</button>
        </div>
        <div className="p-4">
          <button type="button" onClick={onUploadNew}
            className="w-full h-11 rounded-[10px] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer border-none mb-3"
            style={{ background: "rgba(124,109,245,0.15)", color: "#a99cf8", border: "0.5px dashed rgba(124,109,245,0.4)" }}>
            📷 Enviar novo do computador
          </button>
          {items.length === 0 ? (
            <p className="text-[11px] text-[#55556a] text-center py-6">Nenhuma imagem enviada ainda — envie a primeira acima.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {items.map(item => (
                <button key={item.url} type="button" onClick={() => onSelect(item.url)}
                  className="rounded-lg overflow-hidden cursor-pointer border-none" style={{ height: "80px", background: "rgba(255,255,255,0.04)" }}>
                  <img src={item.url} className="w-full h-full object-cover" alt={item.label} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MidiaPanel({ node, update, onUpdate }: { node: Node<BlockData>; update: (p: Partial<BlockData>) => void; onUpdate: (id: string, p: Partial<BlockData>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showGallery, setShowGallery] = useState(false);
  const role = node.data.role || "produto";
  const cfg = ROLE_CONFIG[role];

  async function upload(file: File) {
    onUpdate(node.id, { uploading: true } as any);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/storage/upload/product-image`, { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onUpdate(node.id, { imageUrl: data.url, uploading: false } as any);
      addToGallery(data.url, cfg.label);
    } catch {
      const reader = new FileReader();
      reader.onload = ev => onUpdate(node.id, { imageUrl: ev.target?.result as string, uploading: false } as any);
      reader.readAsDataURL(file);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-2">Tipo</label>
        <div className="flex gap-2">
          {(Object.entries(ROLE_CONFIG) as [MidiaRole, typeof ROLE_CONFIG[MidiaRole]][]).map(([r, c]) => (
            <button key={r} type="button" onClick={() => update({ role: r })}
              className="flex-1 py-2 rounded-[8px] text-xs font-semibold cursor-pointer border-none flex items-center justify-center gap-1.5"
              style={role === r ? { background: `${c.color}22`, color: c.color, border: `0.5px solid ${c.color}66` } : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-2">Foto {role === "persona" ? "(opcional)" : ""}</label>
        <div onClick={() => setShowGallery(true)}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
          onDragOver={e => e.preventDefault()}
          className="flex flex-col items-center justify-center rounded-xl cursor-pointer transition-all"
          style={{ height: node.data.imageUrl ? "180px" : "120px", border: `1.5px dashed ${cfg.color}44`, background: `${cfg.color}0a` }}>
          {node.data.imageUrl ? (
            <img src={node.data.imageUrl} className="w-full h-full object-contain rounded-xl" alt="" />
          ) : node.data.uploading ? (
            <>
              <div className="w-6 h-6 border-2 rounded-full animate-spin mb-2" style={{ borderColor: `${cfg.color}33`, borderTopColor: cfg.color }} />
              <p className="text-xs text-[#9090a8]">Enviando...</p>
            </>
          ) : (
            <>
              <span className="text-2xl mb-1.5">{cfg.icon}</span>
              <p className="text-xs text-[#9090a8]">Clique para escolher ou enviar</p>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        {showGallery && (
          <GalleryPickerModal
            onSelect={url => { onUpdate(node.id, { imageUrl: url } as any); setShowGallery(false); }}
            onUploadNew={() => { setShowGallery(false); fileRef.current?.click(); }}
            onClose={() => setShowGallery(false)}
          />
        )}
        {node.data.imageUrl && (
          <button type="button" onClick={() => onUpdate(node.id, { imageUrl: "" } as any)}
            className="w-full mt-1.5 py-1.5 rounded-[6px] text-[10px] cursor-pointer border-none" style={{ background: "rgba(248,113,113,0.1)", color: "#f87171" }}>
            Remover foto
          </button>
        )}
      </div>

      {role === "produto" && (
        <>
          <div>
            <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Nome do produto</label>
            <input type="text" value={node.data.productName || ""} onChange={e => update({ productName: e.target.value })}
              placeholder="Ex: Fit Green"
              className="w-full h-10 px-3 rounded-[8px] text-sm outline-none placeholder-[#3a3a4a]"
              style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
          </div>
          <div>
            <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Categoria</label>
            <div className="flex flex-wrap gap-1.5">
              {["Moda", "Beleza", "Tech", "Alimentos", "Outros"].map(cat => (
                <button key={cat} type="button" onClick={() => update({ category: cat })}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer border-none"
                  style={node.data.category === cat ? { background: "rgba(124,109,245,0.2)", color: "#a99cf8", border: "0.5px solid rgba(124,109,245,0.4)" } : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {role === "persona" && (
        <div className="rounded-[10px] px-3 py-2.5" style={{ background: "rgba(62,207,142,0.08)", border: "0.5px solid rgba(62,207,142,0.2)" }}>
          <p className="text-[11px] text-[#3ecf8e] leading-relaxed">
            ✨ Não precisa de foto — se preferir, descreva a persona em texto direto no bloco Gerador (idade, cabelo, corpo, roupa). Testado e funcionando sem imagem de rosto.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Painel de configuração — Gerador ────────────────────────────

function GeradorPanel({ node, update }: { node: Node<BlockData>; update: (p: Partial<BlockData>) => void }) {
  const [generating, setGenerating] = useState(false);
  const [showTipoPicker, setShowTipoPicker] = useState(false);
  const tipo = node.data.tipo || "video_produto";

  const SCENE_TEMPLATES = [
    { label: "🏋️ Academia lotada", text: "dentro de uma academia lotada, câmera na altura do peito, iluminação quente" },
    { label: "🏢 Estúdio clean", text: "em um estúdio de fotografia com fundo branco, iluminação suave e profissional" },
    { label: "🌆 Rua urbana", text: "em uma rua movimentada da cidade durante o entardecer" },
    { label: "🏠 Sala de estar", text: "em uma sala de estar aconchegante, luz natural pela janela" },
  ];

  const PERSONA_TEMPLATES = [
    { label: "👩 Mulher, 30-40, fitness", text: "mulher com seus 38 anos, cabelo amarrado, corpo atlético, roupa de academia" },
    { label: "👨 Homem, 25-35, casual", text: "homem com seus 28 anos, barba curta, estilo casual" },
    { label: "👩 Mulher, 20-30, aesthetic", text: "mulher com seus 24 anos, cabelo solto, estilo aesthetic" },
  ];

  const MOTION_TEMPLATES = [
    { label: "🌬️ Movimento sutil", text: "movimento sutil e natural nos elementos da imagem, câmera parada, sem adicionar objetos ou pessoas que não estão na imagem original" },
    { label: "🎥 Zoom lento", text: "zoom lento e suave se aproximando do centro da imagem, sem alterar o conteúdo da cena" },
    { label: "☀️ Luz mudando", text: "iluminação mudando gradualmente, sensação de passagem de tempo, câmera parada" },
  ];

  async function generateScript() {
    setGenerating(true);
    try {
      const res = await fetch(`${API}/copy/generate-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: "produto", category: "Geral", style: node.data.avatarStyle || "UGC unboxing",
          tone: "Animado", duration: `${node.data.duration || "10"}s`, language: "pt-br",
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      update({ dialogue: data.script });
    } catch {
      update({ dialogue: "Gente, esse produto mudou minha rotina! Resultado real em poucas semanas. Corre no link da bio!" });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Tipo</label>
        <button type="button" onClick={() => setShowTipoPicker(v => !v)}
          className="w-full rounded-[8px] px-3 py-2.5 flex items-center justify-between cursor-pointer border-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }}>
          <span className="text-sm text-[#f0f0f5] flex items-center gap-2">{GERADOR_TIPOS[tipo].icon} {GERADOR_TIPOS[tipo].label}</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>{computeCost(node.data.duration || "10", node.data.resolution || "480p")} cr</span>
        </button>

        {showTipoPicker && (
          <div className="mt-1.5 rounded-[8px] overflow-hidden" style={{ border: "0.5px solid rgba(255,255,255,0.1)" }}>
            {Object.entries(GERADOR_TIPOS).map(([key, t]) => (
              <button key={key} type="button"
                onClick={() => { update({ tipo: key }); setShowTipoPicker(false); }}
                className="w-full text-left px-3 py-2.5 cursor-pointer border-none flex flex-col gap-0.5"
                style={tipo === key ? { background: "rgba(124,109,245,0.15)" } : { background: "rgba(255,255,255,0.03)" }}>
                <span className="text-xs font-medium text-[#f0f0f5]">{t.icon} {t.label}</span>
                <span className="text-[10px] text-[#55556a]">{t.desc}</span>
              </button>
            ))}
          </div>
        )}

        <p className="text-[10px] text-[#55556a] mt-1">
          {tipo === "video_produto" && "Conecte um bloco Mídia (Produto) ao Gerador. Persona é opcional — se não conectar foto, descreva em texto abaixo."}
          {tipo === "criacao_livre" && "Conecte qualquer bloco Mídia como referência (opcional) e descreva livremente o que quer gerar."}
          {tipo === "modo_cena" && "Não precisa de foto — descreva o ambiente/cenário. Vídeo mudo, sem avatar."}
          {tipo === "animar_imagem" && "Conecte 1 bloco Mídia ao Gerador — é a imagem que vai ganhar movimento."}
          {tipo === "persona_fixa" && "Conecte a foto da persona (obrigatória) e, se quiser, a foto do produto também."}
        </p>
      </div>

      <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

      {/* ── Vídeo de Produto ── */}
      {tipo === "video_produto" && (
        <>
          <div>
            <label className="text-xs font-medium text-[#9090a8] block mb-2">Persona (se não conectou foto)</label>
            <div className="grid grid-cols-1 gap-1.5 mb-2">
              {PERSONA_TEMPLATES.map(t => (
                <button key={t.label} type="button" onClick={() => update({ personaDescription: t.text })}
                  className="text-left px-2.5 py-2 rounded-[8px] text-[11px] cursor-pointer border-none"
                  style={node.data.personaDescription === t.text ? { background: "rgba(62,207,142,0.15)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.4)" } : { background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                  {t.label}
                </button>
              ))}
            </div>
            <textarea value={node.data.personaDescription || ""} onChange={e => update({ personaDescription: e.target.value })}
              placeholder="Ex: mulher com seus 38 anos, cabelo amarrado, corpo atlético, roupa de academia"
              rows={3}
              className="w-full px-3 py-2.5 rounded-[8px] text-xs resize-none outline-none placeholder-[#3a3a4a]"
              style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
          </div>

          <div>
            <label className="text-xs font-medium text-[#9090a8] block mb-2">Cena</label>
            <div className="grid grid-cols-1 gap-1.5 mb-2">
              {SCENE_TEMPLATES.map(t => (
                <button key={t.label} type="button" onClick={() => update({ scenePrompt: t.text })}
                  className="text-left px-2.5 py-2 rounded-[8px] text-[11px] cursor-pointer border-none"
                  style={node.data.scenePrompt === t.text ? { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "0.5px solid rgba(245,158,11,0.4)" } : { background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                  {t.label}
                </button>
              ))}
            </div>
            <textarea value={node.data.scenePrompt || ""} onChange={e => update({ scenePrompt: e.target.value })}
              placeholder="Descreva a cena..." rows={3}
              className="w-full px-3 py-2.5 rounded-[8px] text-xs resize-none outline-none placeholder-[#3a3a4a]"
              style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#9090a8]">Fala do avatar</label>
              <button type="button" onClick={generateScript} disabled={generating}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer border-none disabled:opacity-40"
                style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", border: "0.5px solid rgba(248,113,113,0.2)" }}>
                {generating ? "Gerando..." : "✨ Gerar com IA"}
              </button>
            </div>
            <textarea value={node.data.dialogue || ""} onChange={e => update({ dialogue: e.target.value })}
              placeholder='Ex: "Esse produto mudou minha vida, perdi 10kg em 30 dias..."' rows={4}
              className="w-full px-3 py-2.5 rounded-[8px] text-sm resize-none outline-none placeholder-[#3a3a4a]"
              style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
          </div>
        </>
      )}

      {/* ── Persona Fixa (Kling) ── */}
      {tipo === "persona_fixa" && (
        <>
          <div className="rounded-[8px] px-3 py-2.5" style={{ background: "rgba(96,165,250,0.08)", border: "0.5px solid rgba(96,165,250,0.2)" }}>
            <p className="text-[11px] text-[#60a5fa]">👤 Conecte uma foto de verdade da sua influencer/persona no bloco Mídia (Persona) — esse modo <strong>exige foto</strong>, não aceita só descrição em texto.</p>
          </div>

          <div>
            <label className="text-xs font-medium text-[#9090a8] block mb-2">Cena</label>
            <div className="grid grid-cols-1 gap-1.5 mb-2">
              {SCENE_TEMPLATES.map(t => (
                <button key={t.label} type="button" onClick={() => update({ scenePrompt: t.text })}
                  className="text-left px-2.5 py-2 rounded-[8px] text-[11px] cursor-pointer border-none"
                  style={node.data.scenePrompt === t.text ? { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "0.5px solid rgba(245,158,11,0.4)" } : { background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                  {t.label}
                </button>
              ))}
            </div>
            <textarea value={node.data.scenePrompt || ""} onChange={e => update({ scenePrompt: e.target.value })}
              placeholder="Descreva a cena..." rows={3}
              className="w-full px-3 py-2.5 rounded-[8px] text-xs resize-none outline-none placeholder-[#3a3a4a]"
              style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#9090a8]">Fala</label>
              <button type="button" onClick={generateScript} disabled={generating}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer border-none disabled:opacity-40"
                style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", border: "0.5px solid rgba(248,113,113,0.2)" }}>
                {generating ? "Gerando..." : "✨ Gerar com IA"}
              </button>
            </div>
            <textarea value={node.data.dialogue || ""} onChange={e => update({ dialogue: e.target.value })}
              placeholder='Ex: "Gente, olha esse vestido que eu tô usando..."' rows={4}
              className="w-full px-3 py-2.5 rounded-[8px] text-sm resize-none outline-none placeholder-[#3a3a4a]"
              style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
          </div>
        </>
      )}

      {/* ── Criação Livre ── */}
      {tipo === "criacao_livre" && (
        <div>
          <label className="text-xs font-medium text-[#9090a8] block mb-2">Prompt</label>
          <textarea value={node.data.freePrompt || ""} onChange={e => update({ freePrompt: e.target.value })}
            placeholder="Descreva livremente o vídeo que quer gerar. Se conectou uma imagem, ela é usada como referência visual."
            rows={8}
            className="w-full px-3 py-2.5 rounded-[8px] text-sm resize-none outline-none placeholder-[#3a3a4a]"
            style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
        </div>
      )}

      {/* ── Modo Cena ── */}
      {tipo === "modo_cena" && (
        <div>
          <label className="text-xs font-medium text-[#9090a8] block mb-2">Cena</label>
          <div className="grid grid-cols-1 gap-1.5 mb-2">
            {SCENE_TEMPLATES.map(t => (
              <button key={t.label} type="button" onClick={() => update({ scenePrompt: t.text })}
                className="text-left px-2.5 py-2 rounded-[8px] text-[11px] cursor-pointer border-none"
                style={node.data.scenePrompt === t.text ? { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "0.5px solid rgba(245,158,11,0.4)" } : { background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                {t.label}
              </button>
            ))}
          </div>
          <textarea value={node.data.scenePrompt || ""} onChange={e => update({ scenePrompt: e.target.value })}
            placeholder="Descreva o ambiente/cenário..." rows={6}
            className="w-full px-3 py-2.5 rounded-[8px] text-xs resize-none outline-none placeholder-[#3a3a4a]"
            style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
        </div>
      )}

      {/* ── Animar Imagem ── */}
      {tipo === "animar_imagem" && (
        <div>
          <label className="text-xs font-medium text-[#9090a8] block mb-2">Movimento</label>
          <div className="grid grid-cols-1 gap-1.5 mb-2">
            {MOTION_TEMPLATES.map(t => (
              <button key={t.label} type="button" onClick={() => update({ motionPrompt: t.text })}
                className="text-left px-2.5 py-2 rounded-[8px] text-[11px] cursor-pointer border-none"
                style={node.data.motionPrompt === t.text ? { background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "0.5px solid rgba(96,165,250,0.4)" } : { background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                {t.label}
              </button>
            ))}
          </div>
          <textarea value={node.data.motionPrompt || ""} onChange={e => update({ motionPrompt: e.target.value })}
            placeholder="Descreva o movimento que a imagem deve ganhar..." rows={6}
            className="w-full px-3 py-2.5 rounded-[8px] text-xs resize-none outline-none placeholder-[#3a3a4a]"
            style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
        </div>
      )}

      <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Duração: {node.data.duration || "10"}s ({computeCost(node.data.duration || "10", node.data.resolution || "480p")} cr)</label>
        <input type="range" min={5} max={15} step={5} value={parseInt(node.data.duration || "10")}
          onChange={e => update({ duration: e.target.value })}
          className="w-full" />
        <div className="flex justify-between text-[10px] text-[#55556a] mt-1"><span>5s</span><span>10s</span><span>15s</span></div>
      </div>

      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Formato</label>
        <div className="flex gap-2">
          {[{ id: "9:16", l: "9:16 📱" }, { id: "1:1", l: "1:1 ⬜" }, { id: "16:9", l: "16:9 🖥️" }].map(f => (
            <button key={f.id} type="button" onClick={() => update({ aspectRatio: f.id })}
              className="flex-1 py-2 rounded-[8px] text-xs font-semibold cursor-pointer border-none"
              style={node.data.aspectRatio === f.id ? { background: "rgba(96,165,250,0.2)", color: "#60a5fa", border: "0.5px solid rgba(96,165,250,0.4)" } : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Resolução</label>
        <div className="flex gap-2">
          {["480p", "720p"].map(q => {
            const rate = RESOLUTION_RATE[q];
            const selected = (node.data.resolution || "480p") === q;
            return (
              <button key={q} type="button" onClick={() => update({ resolution: q })}
                className="flex-1 py-2 rounded-[8px] text-xs font-semibold cursor-pointer border-none flex flex-col items-center gap-0.5"
                style={selected ? { background: "rgba(96,165,250,0.2)", color: "#60a5fa", border: "0.5px solid rgba(96,165,250,0.4)" } : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                <span>{q}</span>
                <span className="text-[9px] opacity-70">{rate} cr/s</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-[#55556a] mt-1">480p já fica ótimo pra TikTok/Reels (compressão do app disfarça a diferença). 720p custa mais porque processa mais dado de verdade.</p>
      </div>
    </div>
  );
}

// ── Painel lateral genérico ──────────────────────────────────

function ConfigPanel({ node, onUpdate, onClose }: { node: Node<BlockData>; onUpdate: (id: string, p: Partial<BlockData>) => void; onClose: () => void }) {
  const type = node.data.type;
  const titles: Record<BlockType, { icon: string; label: string }> = {
    midia: { icon: ROLE_CONFIG[node.data.role || "produto"].icon, label: "Mídia" },
    gerador: { icon: "✨", label: "Gerador" },
    resultado: { icon: "✅", label: "Resultado" },
  };
  const t = titles[type];

  function update(patch: Partial<BlockData>) { onUpdate(node.id, patch); }

  return (
    <div className="absolute top-0 right-0 h-full w-80 flex flex-col z-50 overflow-hidden"
      style={{ background: "rgba(11,11,17,0.99)", borderLeft: "0.5px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: "rgba(124,109,245,0.15)" }}>{t.icon}</div>
        <div className="flex-1"><p className="text-sm font-semibold text-[#f0f0f5]">Configurar {t.label}</p></div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer text-[#55556a] hover:text-[#f0f0f5]" style={{ background: "rgba(255,255,255,0.05)" }}>✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {type === "midia" && <MidiaPanel node={node} update={update} onUpdate={onUpdate} />}
        {type === "gerador" && <GeradorPanel node={node} update={update} />}
        {type === "resultado" && (
          <p className="text-xs text-[#9090a8]">Esse bloco é só de visualização — ele aparece automaticamente quando você clica em "Gerar" no bloco Gerador.</p>
        )}
      </div>
      <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: "0.5px solid rgba(255,255,255,0.07)" }}>
        <button type="button" onClick={onClose} className="w-full h-10 rounded-[8px] text-sm font-semibold cursor-pointer border-none" style={{ background: "#7c6df5", color: "#fff" }}>Aplicar</button>
      </div>
    </div>
  );
}

// ── Modal de confirmação antes de gerar (substitui window.confirm) ──

function ConfirmGenerateModal({ cost, duration, resolution, haveCredits, onConfirm, onCancel }: {
  cost: number; duration: string; resolution: string; haveCredits: number;
  onConfirm: () => void; onCancel: () => void;
}) {
  const rate = RESOLUTION_RATE[resolution] ?? RESOLUTION_RATE["480p"];
  return (
    <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }} onClick={onCancel}>
      <div className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden" style={{ background: "#131318", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 40px 80px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-5 flex flex-col items-center text-center" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-3" style={{ background: "linear-gradient(135deg,rgba(139,124,248,0.2),rgba(124,109,245,0.2))", border: "0.5px solid rgba(124,109,245,0.3)" }}>
            ✨
          </div>
          <p className="text-base font-bold text-[#f0f0f5]">Gerar vídeo agora?</p>
          <p className="text-[11px] text-[#55556a] mt-1">Confirme os detalhes antes de consumir créditos</p>
        </div>

        <div className="px-6 py-5 flex flex-col gap-3">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#9090a8]">Duração</span>
            <span className="text-[#f0f0f5] font-medium">{duration}s</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#9090a8]">Resolução</span>
            <span className="text-[#f0f0f5] font-medium">{resolution} ({rate} cr/s)</span>
          </div>
          <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[#9090a8]">Custo total</span>
            <span className="font-bold" style={{ color: "#f59e0b" }}>{cost} créditos</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#9090a8]">Saldo atual</span>
            <span className="text-[#f0f0f5]">{haveCredits.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[#9090a8]">Saldo após gerar</span>
            <span className="text-[#3ecf8e] font-medium">{(haveCredits - cost).toLocaleString()}</span>
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-2">
          <button type="button" onClick={onConfirm}
            className="w-full h-11 rounded-[10px] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer border-none"
            style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff", boxShadow: "0 4px 14px rgba(124,109,245,0.4)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            Gerar vídeo ({cost} cr)
          </button>
          <button type="button" onClick={onCancel}
            className="w-full h-10 rounded-[10px] text-sm cursor-pointer border-none"
            style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal "Adicionar Componente" ────────────────────────────────

function AddComponentModal({ onAdd, onClose }: { onAdd: (type: BlockType, role?: MidiaRole, geradorTipo?: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"midia" | "gerador">("midia");
  return (
    <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-lg mx-4 overflow-hidden" style={{ background: "#131318", border: "1px solid rgba(255,255,255,0.1)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
          <div>
            <p className="text-base font-bold text-[#f0f0f5]">+ Adicionar Componente</p>
            <p className="text-[11px] text-[#55556a]">Escolha o tipo de bloco para o seu workflow</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer text-[#55556a]" style={{ background: "rgba(255,255,255,0.05)" }}>✕</button>
        </div>
        <div className="flex" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
          {[{ id: "midia" as const, l: "🖼️ Mídia" }, { id: "gerador" as const, l: "✨ Gerador" }].map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)}
              className="flex-1 py-3 text-sm font-medium cursor-pointer border-none"
              style={tab === tb.id ? { background: "rgba(124,109,245,0.1)", color: "#a99cf8", borderBottom: "2px solid #7c6df5" } : { background: "transparent", color: "#9090a8" }}>
              {tb.l}
            </button>
          ))}
        </div>
        <div className="p-4 flex flex-col gap-2 max-h-96 overflow-y-auto">
          {tab === "midia" && (
            <>
              <button onClick={() => onAdd("midia", "produto")} className="text-left px-4 py-3 rounded-[10px] cursor-pointer border-none flex items-center justify-between" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                <div><p className="text-sm font-medium text-[#f0f0f5]">🛍️ Produto</p><p className="text-[11px] text-[#55556a]">Foto do produto que aparece no vídeo</p></div>
              </button>
              <button onClick={() => onAdd("midia", "persona")} className="text-left px-4 py-3 rounded-[10px] cursor-pointer border-none flex items-center justify-between" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                <div><p className="text-sm font-medium text-[#f0f0f5]">🧑‍🎤 Persona</p><p className="text-[11px] text-[#55556a]">Foto do avatar (opcional — pode descrever em texto)</p></div>
              </button>
            </>
          )}
          {tab === "gerador" && (
            <>
              {Object.entries(GERADOR_TIPOS).map(([key, t]) => (
                <button key={key} onClick={() => onAdd("gerador", undefined, key)}
                  className="text-left px-4 py-3 rounded-[10px] cursor-pointer border-none flex items-center justify-between"
                  style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                  <div><p className="text-sm font-medium text-[#f0f0f5]">{t.icon} {t.label}</p><p className="text-[11px] text-[#55556a]">{t.desc}</p></div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>{computeCost("10", "480p")} cr</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Biblioteca de Mídia ─────────────────────────────────────────

function MediaLibrary({ nodes, onClose }: { nodes: Node<BlockData>[]; onClose: () => void }) {
  const items = nodes.filter(n => (n.data.type === "midia" && n.data.imageUrl) || (n.data.type === "resultado" && n.data.videoUrl));
  return (
    <div className="absolute top-0 right-0 h-full w-72 flex flex-col z-40" style={{ background: "rgba(11,11,17,0.99)", borderLeft: "0.5px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
        <div><p className="text-sm font-semibold text-[#f0f0f5]">Biblioteca de Mídia</p><p className="text-[10px] text-[#55556a]">{items.length} item{items.length !== 1 ? "s" : ""}</p></div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer text-[#55556a]" style={{ background: "rgba(255,255,255,0.05)" }}>✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2">
        {items.length === 0 && <p className="text-[11px] text-[#55556a] col-span-2 text-center py-8">Nada por aqui ainda.</p>}
        {items.map(n => (
          <div key={n.id} className="rounded-lg overflow-hidden" style={{ height: "80px", background: "rgba(255,255,255,0.04)" }}>
            {n.data.type === "midia" ? <img src={n.data.imageUrl} className="w-full h-full object-cover" alt="" /> : <video src={n.data.videoUrl} className="w-full h-full object-cover" muted />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────

let nodeId = 10;
const nextId = () => `node_${nodeId++}`;

export default function TikTokCanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<BlockData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [rfInstance, setRfInstance] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<{ sourceId: string; position: { x: number; y: number } } | null>(null);
  const connectingNodeId = useRef<string | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [userCredits, setUserCredits] = useState<number>(50);
  const [userId, setUserId] = useState<string | null>(null);
  const [creditModal, setCreditModal] = useState<{ needed: number; have: number } | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState<{ geradorId: string; cost: number; duration: string; resolution: string } | null>(null);

  useEffect(() => {
    try {
      const sb = getSupabase();
      sb.auth.getUser().then(({ data }: any) => {
        if (data?.user) {
          setUserId(data.user.id);
          fetch(`${API}/credits/${data.user.id}`).then(r => r.json()).then(d => { if (d.balance !== undefined) setUserCredits(d.balance); }).catch(() => {});
        }
      });
    } catch {}
  }, []);

  const onConnect = useCallback((params: Connection) => setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: "#7c6df5", strokeWidth: 2 } }, eds)), [setEdges]);

  const onConnectStart = useCallback((_: any, { nodeId }: { nodeId: string | null }) => {
    connectingNodeId.current = nodeId;
  }, []);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const sourceId = connectingNodeId.current;
    connectingNodeId.current = null;
    if (!sourceId || !rfInstance || !reactFlowWrapper.current) return;

    const targetIsPane = (event.target as HTMLElement)?.classList?.contains("react-flow__pane");
    if (!targetIsPane) return; // soltou em cima de um nó existente — deixa o onConnect normal cuidar

    const clientX = "touches" in event ? event.touches[0]?.clientX : (event as MouseEvent).clientX;
    const clientY = "touches" in event ? event.touches[0]?.clientY : (event as MouseEvent).clientY;
    const flowPos = rfInstance.screenToFlowPosition({ x: clientX, y: clientY });

    setPendingConnection({ sourceId, position: flowPos });
    setShowAddModal(true);
  }, [rfInstance]);

  function addNode(type: BlockType, role?: MidiaRole, position?: { x: number; y: number }, geradorTipo?: string) {
    const id = nextId();
    const pos = position || { x: 300 + Math.random() * 200, y: 100 + Math.random() * 300 };
    const base: BlockData = { type, label: type };
    if (type === "midia") { base.role = role; }
    if (type === "gerador") { base.tipo = geradorTipo || "video_produto"; base.duration = "10"; base.aspectRatio = "9:16"; base.resolution = "480p"; }
    setNodes(nds => [...nds, { id, type, position: pos, data: base }]);
    setSelectedNodeId(id);
    setShowAddModal(false);

    if (pendingConnection) {
      setEdges(eds => addEdge({ id: `e-${pendingConnection.sourceId}-${id}`, source: pendingConnection.sourceId, target: id, animated: true, style: { stroke: "#7c6df5", strokeWidth: 2 } }, eds));
      setPendingConnection(null);
    }
  }

  function updateNodeData(id: string, patch: Partial<BlockData>) {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
  }

  function collectConnectedImages(geradorId: string): string[] {
    const connectedEdges = edges.filter(e => e.target === geradorId);
    const urls: string[] = [];
    for (const edge of connectedEdges) {
      const source = nodes.find(n => n.id === edge.source);
      if (!source || source.data.type !== "midia") continue;
      const url = (source.data.imageUrl as string) || "";
      if (url) urls.push(url);
    }
    return urls;
  }

  function handleGenerate(geradorId: string) {
    const geradorNode = nodes.find(n => n.id === geradorId);
    if (!geradorNode) return;

    const tipo = (geradorNode.data.tipo as string) || "video_produto";
    const duration = (geradorNode.data.duration as string) || "10";
    const resolution = (geradorNode.data.resolution as string) || "480p";
    const cost = computeCost(duration, resolution);

    if (tipo === "video_produto") {
      const connectedEdges = edges.filter(e => e.target === geradorId);
      let productImageUrl = "";
      let personaImageUrl = "";
      for (const edge of connectedEdges) {
        const source = nodes.find(n => n.id === edge.source);
        if (!source || source.data.type !== "midia") continue;
        if (source.data.role === "produto") productImageUrl = (source.data.imageUrl as string) || "";
        if (source.data.role === "persona") personaImageUrl = (source.data.imageUrl as string) || "";
      }
      const personaDescription = (geradorNode.data.personaDescription as string) || "";
      const dialogue = (geradorNode.data.dialogue as string) || "";
      if (!productImageUrl) { alert("Conecte um bloco Mídia (Produto) ao Gerador!"); return; }
      if (!dialogue) { alert("Preencha a fala do avatar no Gerador!"); return; }
      if (!personaImageUrl && !personaDescription) { alert("Conecte uma foto de Persona OU descreva a persona em texto no Gerador!"); return; }
    } else if (tipo === "criacao_livre") {
      if (!geradorNode.data.freePrompt) { alert("Escreva o prompt no Gerador!"); return; }
    } else if (tipo === "modo_cena") {
      if (!geradorNode.data.scenePrompt) { alert("Descreva a cena no Gerador!"); return; }
    } else if (tipo === "animar_imagem") {
      if (collectConnectedImages(geradorId).length === 0) { alert("Conecte 1 bloco Mídia ao Gerador — é a imagem que vai animar!"); return; }
      if (!geradorNode.data.motionPrompt) { alert("Descreva o movimento no Gerador!"); return; }
    } else if (tipo === "persona_fixa") {
      const connectedEdges = edges.filter(e => e.target === geradorId);
      let personaImageUrl = "";
      for (const edge of connectedEdges) {
        const source = nodes.find(n => n.id === edge.source);
        if (source?.data.type === "midia" && source.data.role === "persona") personaImageUrl = (source.data.imageUrl as string) || "";
      }
      if (!personaImageUrl) { alert("Conecte uma foto de verdade no bloco Persona — esse modo exige foto, não aceita só texto!"); return; }
      if (!geradorNode.data.scenePrompt) { alert("Descreva a cena no Gerador!"); return; }
      if (!geradorNode.data.dialogue) { alert("Preencha a fala no Gerador!"); return; }
    }

    if (cost > userCredits) { setCreditModal({ needed: cost, have: userCredits }); return; }

    // Abre o modal de confirmação bonito em vez do window.confirm nativo
    setConfirmGenerate({ geradorId, cost, duration, resolution });
  }

  async function executeGenerate(geradorId: string, cost: number) {
    setConfirmGenerate(null);
    const geradorNode = nodes.find(n => n.id === geradorId);
    if (!geradorNode) return;

    const tipo = (geradorNode.data.tipo as string) || "video_produto";
    const connectedEdges = edges.filter(e => e.target === geradorId);
    let productImageUrl = "";
    let productName = "";
    let personaImageUrl = "";
    for (const edge of connectedEdges) {
      const source = nodes.find(n => n.id === edge.source);
      if (!source || source.data.type !== "midia") continue;
      if (source.data.role === "produto") {
        productImageUrl = (source.data.imageUrl as string) || "";
        productName = (source.data.productName as string) || "";
      }
      if (source.data.role === "persona") personaImageUrl = (source.data.imageUrl as string) || "";
    }
    const connectedImages = collectConnectedImages(geradorId);

    const personaDescription = (geradorNode.data.personaDescription as string) || "";
    const scenePrompt = (geradorNode.data.scenePrompt as string) || "";
    const dialogue = (geradorNode.data.dialogue as string) || "";
    const freePrompt = (geradorNode.data.freePrompt as string) || "";
    const motionPrompt = (geradorNode.data.motionPrompt as string) || "";
    const duration = (geradorNode.data.duration as string) || "10";
    const resolution = (geradorNode.data.resolution as string) || "480p";

    if (!userId) { alert("Não foi possível identificar seu usuário. Faça login novamente."); return; }

    // 1) DÉBITO — acontece ANTES de chamar a API de geração, igual definido no Brief
    let debitOk = false;
    try {
      const debitRes = await fetch(`${API}/credits/debit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          amount: cost,
          description: `${GERADOR_TIPOS[tipo].label} — ${duration}s ${resolution}`,
        }),
      });
      if (!debitRes.ok) {
        const err = await debitRes.json().catch(() => ({}));
        if (debitRes.status === 402) {
          setCreditModal({ needed: cost, have: userCredits });
        } else {
          alert(`Erro ao debitar créditos: ${err.detail || "erro desconhecido"}`);
        }
        return;
      }
      const debitData = await debitRes.json();
      setUserCredits(debitData.balance);
      debitOk = true;
    } catch (e: any) {
      alert(`Erro ao debitar créditos: ${e.message}`);
      return;
    }

    // Cria o nó Resultado conectado
    const resultId = nextId();
    const resultPos = { x: geradorNode.position.x + 320, y: geradorNode.position.y };
    setNodes(nds => [...nds, { id: resultId, type: "resultado", position: resultPos, data: { type: "resultado", label: "Resultado", status: "processing", progress: 10 } }]);
    setEdges(eds => addEdge({ id: `e-${geradorId}-${resultId}`, source: geradorId, target: resultId, animated: true, style: { stroke: "#7c6df5", strokeWidth: 2 } }, eds));

    async function refund(motivo: string) {
      try {
        const refundRes = await fetch(`${API}/credits/refund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, amount: cost, description: `Estorno — ${motivo}` }),
        });
        const refundData = await refundRes.json().catch(() => null);
        if (refundData?.balance !== undefined) setUserCredits(refundData.balance);
      } catch {}
    }

    // Monta o payload de acordo com o tipo selecionado no Gerador
    let seedanceBody: Record<string, any> | null = null;
    let klingBody: Record<string, any> | null = null;

    if (tipo === "persona_fixa") {
      klingBody = {
        persona_image_url: personaImageUrl,
        product_image_url: productImageUrl || null,
        scene_prompt: scenePrompt,
        dialogue,
        aspect_ratio: (geradorNode.data.aspectRatio as string) || "9:16",
        duration,
      };
    } else if (tipo === "video_produto") {
      seedanceBody = {
        product_image_url: productImageUrl,
        persona_image_url: personaImageUrl || null,
        persona_description: personaDescription || null,
        scene_prompt: scenePrompt || "fundo neutro, iluminação profissional",
        dialogue,
        aspect_ratio: (geradorNode.data.aspectRatio as string) || "9:16",
        duration,
        resolution,
      };
    } else if (tipo === "criacao_livre") {
      seedanceBody = {
        prompt: freePrompt,
        reference_images: connectedImages,
        aspect_ratio: (geradorNode.data.aspectRatio as string) || "9:16",
        duration,
        resolution,
      };
    } else if (tipo === "modo_cena") {
      seedanceBody = {
        prompt: `${scenePrompt}, câmera estática ou com leve movimento, sem pessoas, sem texto na tela.`,
        reference_images: connectedImages,
        aspect_ratio: (geradorNode.data.aspectRatio as string) || "9:16",
        duration,
        resolution,
      };
    } else {
      // animar_imagem
      seedanceBody = {
        prompt: `Anime a imagem [Image1] com o seguinte movimento: ${motionPrompt}`,
        reference_images: connectedImages,
        aspect_ratio: (geradorNode.data.aspectRatio as string) || "9:16",
        duration,
        resolution,
      };
    }

    // Persona Fixa usa o Kling (fal.ai) — endpoint e payload diferentes
    // do Seedance/Replicate usado por todos os outros tipos
    const generateUrl = tipo === "persona_fixa" ? `${API}/kling/generate` : `${API}/seedance/generate`;
    const statusUrlBase = tipo === "persona_fixa" ? `${API}/kling/status` : `${API}/seedance/status`;
    const bodyToSend = tipo === "persona_fixa" ? klingBody : seedanceBody;

    // Pipeline de 2 fases (persona_fixa: Kling → dublagem HeyGen) demora bem
    // mais que uma geração de 1 fase só. O modo "precision" do HeyGen Video
    // Translation, em especial, é explicitamente mais lento (a doc recomenda
    // polling a cada 30-60s pra vídeos mais longos). Por isso persona_fixa
    // recebe um timeout bem mais generoso do que os outros tipos, que
    // continuam com o valor original.
    const isTwoStagePipeline = tipo === "persona_fixa";
    const pollIntervalMs = isTwoStagePipeline ? 8000 : 5000;
    const maxAttempts = isTwoStagePipeline ? 150 : 60; // 150×8s ≈ 20min | 60×5s = 5min

    const STAGE_LABELS: Record<string, string> = {
      gerando_video: "Gerando vídeo (Kling)...",
      dublando_pt_br: "Dublando pra PT-BR (HeyGen)...",
    };

    try {
      const res = await fetch(generateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyToSend),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || "Erro ao iniciar geração"); }
      const data = await res.json();
      const taskId = data.task_id;

      updateNodeData(resultId, { progress: 25 });

      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await fetch(`${statusUrlBase}/${taskId}`);
          const statusData = await statusRes.json();
          updateNodeData(resultId, {
            progress: Math.min(25 + attempts * (70 / maxAttempts), 95),
            stageLabel: statusData.stage ? STAGE_LABELS[statusData.stage] || statusData.stage : undefined,
          });

          if (statusData.status === "done") {
            clearInterval(poll);
            updateNodeData(resultId, {
              status: "done",
              progress: 100,
              videoUrl: statusData.video_url,
              // Se o backend devolveu um "warning" (ex: dublagem falhou mas o
              // vídeo original ainda está disponível), mostra pro usuário em
              // vez de esconder — assim ele sabe que recebeu o fallback.
              errorMsg: statusData.warning || undefined,
            });
            // Grava no histórico real (Meus vídeos) — silencioso, não
            // bloqueia a UI se falhar, o vídeo já está pronto de qualquer forma
            fetch(`${API}/videos/save`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                user_id: userId,
                title: productName || GERADOR_TIPOS[tipo].label,
                type: "tiktok",
                video_url: statusData.video_url,
                duration_seconds: parseInt(duration),
                format: (geradorNode.data.aspectRatio as string) || "9:16",
                credits_used: cost,
                status: "done",
              }),
            }).catch(() => {});
          } else if (statusData.status === "error" || attempts > maxAttempts) {
            clearInterval(poll);
            updateNodeData(resultId, { status: "error", errorMsg: statusData.error || "Timeout aguardando geração" });
            // 2) ESTORNO — geração falhou depois de já ter debitado
            await refund(statusData.error || "timeout na geração");
          }
        } catch { clearInterval(poll); }
      }, pollIntervalMs);
    } catch (e: any) {
      updateNodeData(resultId, { status: "error", errorMsg: e.message });
      // 2) ESTORNO — falha ao sequer iniciar a geração
      await refund(e.message);
    }
  }

  const nodesWithConfig = nodes.map(n => ({
    ...n,
    data: {
      ...n.data,
      onConfigure: () => setSelectedNodeId(n.id),
      onGenerate: () => handleGenerate(n.id),
      onDelete: () => {
        setNodes(nds => nds.filter(node => node.id !== n.id));
        setEdges(eds => eds.filter(e => e.source !== n.id && e.target !== n.id));
        if (selectedNodeId === n.id) setSelectedNodeId(null);
      },
    },
  }));

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer.getData("blockType") as BlockType;
    const role = e.dataTransfer.getData("role") as MidiaRole | undefined;
    if (!type || !rfInstance || !reactFlowWrapper.current) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const pos = rfInstance.screenToFlowPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
    addNode(type, role, pos);
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)", background: "#0a0a10" }}>
      <style>{`
        .react-flow__minimap { border-radius: 10px; overflow: hidden; }
        .react-flow__controls { border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
        .react-flow__controls-button { background: rgba(14,14,20,0.95) !important; border-color: rgba(255,255,255,0.1) !important; color: #9090a8 !important; }
        .react-flow__controls-button:hover { background: rgba(30,30,40,0.95) !important; }
        .react-flow__controls-button svg { fill: #9090a8 !important; }
        .react-flow__edge-path { stroke-width: 2 !important; }
        .react-flow__edge:hover .react-flow__edge-path { stroke: #a99cf8 !important; stroke-width: 3 !important; cursor: pointer; }
        .react-flow__handle:hover { transform: scale(1.6) !important; box-shadow: 0 0 0 4px rgba(124,109,245,0.3); }
        .react-flow__handle-right { right: -8px !important; }
        .react-flow__handle-left { left: -8px !important; }
        .react-flow__pane::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Topbar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 z-40" style={{ background: "rgba(11,11,17,0.99)", borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="w-7 h-7 rounded-lg flex items-center justify-center no-underline" style={{ background: "rgba(255,255,255,0.08)", border: "0.5px solid rgba(255,255,255,0.1)" }} title="Voltar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9090a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </a>
          <div><p className="text-sm font-bold text-[#f0f0f5]">Criativo de Produto</p><p className="text-[10px] text-[#55556a]">TikTok Shop · Facebook Ads · Kwai · Instagram · <a href="/tiktok/criar" className="text-[#a99cf8] no-underline">Prefere o modo guiado?</a></p></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-[#9090a8] px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
            <span className="font-semibold text-[#f0f0f5]">{userCredits.toLocaleString()}</span> créditos
          </div>
        </div>
      </div>

      {creditModal && (
        <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl p-7 max-w-sm w-full mx-4" style={{ background: "#131318", border: "1px solid rgba(255,255,255,0.1)" }}>
            <h3 className="text-[17px] font-bold text-[#f0f0f5] text-center mb-2">Créditos insuficientes</h3>
            <p className="text-[13px] text-[#9090a8] text-center leading-relaxed mb-5">
              Precisa de <strong className="text-[#f87171]">{creditModal.needed} créditos</strong>, você tem <strong className="text-[#f0f0f5]">{creditModal.have}</strong>.
            </p>
            <div className="flex flex-col gap-2">
              <a href="/dashboard/settings" className="w-full h-11 rounded-[10px] text-sm font-semibold flex items-center justify-center gap-2 no-underline" style={{ background: "#7c6df5", color: "#fff" }}>⚡ Ver planos</a>
              <button type="button" onClick={() => setCreditModal(null)} className="w-full h-10 rounded-[10px] text-sm cursor-pointer border-none" style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {confirmGenerate && (
        <ConfirmGenerateModal
          cost={confirmGenerate.cost}
          duration={confirmGenerate.duration}
          resolution={confirmGenerate.resolution}
          haveCredits={userCredits}
          onConfirm={() => executeGenerate(confirmGenerate.geradorId, confirmGenerate.cost)}
          onCancel={() => setConfirmGenerate(null)}
        />
      )}

      {showAddModal && <AddComponentModal onAdd={(type, role, geradorTipo) => addNode(type, role, pendingConnection?.position, geradorTipo)} onClose={() => { setShowAddModal(false); setPendingConnection(null); }} />}

      <div className="flex-1 relative overflow-hidden" ref={reactFlowWrapper} style={{ height: "calc(100vh - 112px)" }} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>

        {/* Barra lateral persistente — sempre visível, igual ao PipClip */}
        <div className="absolute top-1/2 left-3 -translate-y-1/2 flex flex-col gap-2 z-40">
          <button type="button" onClick={() => setShowLibrary(v => !v)} title="Biblioteca de Mídia"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-base cursor-pointer border-none transition-all hover:scale-110"
            style={{ background: showLibrary ? "rgba(124,109,245,0.25)" : "rgba(255,255,255,0.06)", border: `0.5px solid ${showLibrary ? "#7c6df5" : "rgba(255,255,255,0.1)"}`, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
            📁
          </button>
          <label title="Upload rápido de produto"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-base cursor-pointer border-none transition-all hover:scale-110"
            style={{ background: "rgba(255,255,255,0.06)", border: "0.5px solid rgba(255,255,255,0.1)", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
            ⬆️
            <input type="file" accept="image/*" className="hidden" onChange={async e => {
              const file = e.target.files?.[0]; if (!file) return;
              const id = nextId();
              setNodes(nds => [...nds, { id, type: "midia", position: { x: 300 + Math.random() * 200, y: 150 + Math.random() * 200 }, data: { type: "midia", role: "produto", label: "midia", uploading: true } }]);
              try {
                const fd = new FormData(); fd.append("file", file);
                const res = await fetch(`${API}/storage/upload/product-image`, { method: "POST", body: fd });
                const data = await res.json();
                updateNodeData(id, { imageUrl: data.url, uploading: false });
              } catch {
                const reader = new FileReader();
                reader.onload = ev => updateNodeData(id, { imageUrl: ev.target?.result as string, uploading: false });
                reader.readAsDataURL(file);
              }
            }} />
          </label>
          <button type="button" onClick={() => { setPendingConnection(null); setShowAddModal(true); }} title="Adicionar componente"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg cursor-pointer border-none transition-all hover:scale-110"
            style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", boxShadow: "0 2px 8px rgba(124,109,245,0.4)" }}>
            +
          </button>
        </div>

        <div style={{ marginLeft: "64px", marginRight: (selectedNode || showLibrary) ? "288px" : "0", height: "100%" }}>
          <ReactFlow
            nodes={nodesWithConfig}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            nodeTypes={nodeTypes}
            onInit={setRfInstance}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            onEdgeClick={(_, edge) => setEdges(eds => eds.filter(e => e.id !== edge.id))}
            deleteKeyCode={["Backspace", "Delete"]}
            onNodesDelete={() => {}}
            fitView
            style={{ background: "#0a0a10" }}
            defaultEdgeOptions={{ animated: true, style: { stroke: "#7c6df5", strokeWidth: 2 } }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#c8c8d0" style={{ background: "#f5f5f7" }} />
            <Controls style={{ background: "rgba(14,14,20,0.95)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: "10px" }} />
            <MiniMap style={{ background: "rgba(14,14,20,0.95)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: "10px" }} nodeColor={() => "#7c6df5"} />

            {nodes.length === 0 && (
              <Panel position="top-center" style={{ marginTop: "160px" }}>
                <div className="rounded-2xl px-8 py-10 flex flex-col items-center gap-3" style={{ background: "rgba(14,14,20,0.98)", border: "0.5px solid rgba(255,255,255,0.1)", width: "320px" }}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background: "rgba(124,109,245,0.12)" }}>🗂️</div>
                  <p className="text-base font-bold text-[#f0f0f5]">Seu workflow está vazio</p>
                  <p className="text-xs text-[#55556a] text-center">Comece adicionando um componente ao seu workflow.</p>
                  <button type="button" onClick={() => setShowAddModal(true)}
                    className="mt-2 px-5 py-2.5 rounded-[8px] text-sm font-semibold cursor-pointer border-none"
                    style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff" }}>
                    + Adicionar Componente
                  </button>
                </div>
              </Panel>
            )}

            <Panel position="top-right" style={{ marginRight: "12px", marginTop: "12px" }}>
              <div className="text-[10px] text-[#55556a] px-3 py-2 rounded-lg" style={{ background: "rgba(14,14,20,0.95)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                {nodes.length} bloco{nodes.length !== 1 ? "s" : ""} · {edges.length} conexõe{edges.length !== 1 ? "s" : ""}
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {selectedNode && !showLibrary && (
          <ConfigPanel node={selectedNode as Node<BlockData>} onUpdate={updateNodeData} onClose={() => setSelectedNodeId(null)} />
        )}
        {showLibrary && (
          <MediaLibrary nodes={nodes as Node<BlockData>[]} onClose={() => setShowLibrary(false)} />
        )}
      </div>
    </div>
  );
}
