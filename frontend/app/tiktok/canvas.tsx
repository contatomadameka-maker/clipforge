"use client";

// frontend/app/tiktok/canvas.tsx
// Canvas v2 — Modal UX, toolbar compacta, canvas aberto

import { useState, useCallback, useRef, useEffect } from "react";
import { ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, type Connection, type Edge,
  type Node, type NodeProps, Handle, Position,
  BackgroundVariant, Panel } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ── Tipos ─────────────────────────────────────────────────────

type BlockType = "produto" | "cenario" | "avatar" | "copy" | "gerar";

interface BlockData extends Record<string, unknown> {
  type: BlockType;
  label: string;
  image?: string;
  productName?: string;
  category?: string;
  prompt?: string;
  bgColor?: string;
  cenarioImageUrl?: string;
  cenarioStatus?: string;
  avatarId?: string;
  avatarName?: string;
  avatarStyle?: string;
  language?: string;
  voiceId?: string;
  voiceName?: string;
  script?: string;
  duration?: string;
  tone?: string;
  format?: string;
  quality?: string;
  status?: string;
  progress?: number;
  videoUrl?: string;
  videoId?: string;
}

const API = "https://clipforge-6yzz.onrender.com";

const BLOCK_CONFIG: Record<BlockType, { color: string; bg: string; icon: string; label: string; desc: string }> = {
  produto:  { color: "#a99cf8", bg: "rgba(124,109,245,0.15)", icon: "🛍️", label: "Produto",   desc: "Imagem + nome" },
  cenario:  { color: "#f59e0b", bg: "rgba(245,158,11,0.15)",  icon: "🎬", label: "Cenário",   desc: "Fundo gerado por IA" },
  avatar:   { color: "#3ecf8e", bg: "rgba(62,207,142,0.15)",  icon: "🧑‍🎤", label: "Avatar",    desc: "Apresentador virtual" },
  copy:     { color: "#f87171", bg: "rgba(248,113,113,0.15)", icon: "✍️", label: "Copy",      desc: "Script do vídeo" },
  gerar:    { color: "#60a5fa", bg: "rgba(96,165,250,0.15)",  icon: "⚡", label: "Gerar",     desc: "Renderizar vídeo" },
};

const NEXT_BLOCK: Record<BlockType, BlockType[]> = {
  produto: ["cenario", "avatar", "copy"],
  cenario: ["avatar", "copy", "gerar"],
  avatar:  ["copy", "gerar"],
  copy:    ["gerar"],
  gerar:   [],
};

const CREDIT_COST: Record<string, number> = {
  "15s": 8, "30s": 15, "45s": 20, "60s": 25,
};

const VOICE_IDS: Record<string, string> = {
  "pt-br": "6872a840c4194f42a7f8ce0aee47660c",
  "en": "en-US-JennyNeural",
  "es": "es-ES-ElviraNeural",
};

const handleStyle = {
  width: 14, height: 14,
  background: "#7c6df5",
  border: "3px solid #f5f5f7",
  borderRadius: "50%",
  cursor: "crosshair",
};

// ── Bloco base ─────────────────────────────────────────────────

function BaseBlock({ type, children, selected, onConfigure, onDelete, onAddNext }: {
  type: BlockType;
  children: React.ReactNode;
  selected: boolean;
  onConfigure: () => void;
  onDelete: () => void;
  onAddNext?: (t: BlockType) => void;
}) {
  const cfg = BLOCK_CONFIG[type];
  const nextTypes = NEXT_BLOCK[type];
  const [showNextMenu, setShowNextMenu] = useState(false);

  return (
    <div
      className="relative rounded-2xl transition-all duration-150 group"
      style={{
        width: 200,
        background: "rgba(14,14,20,0.97)",
        border: `1.5px solid ${selected ? cfg.color : "rgba(255,255,255,0.12)"}`,
        boxShadow: selected
          ? `0 0 0 3px ${cfg.color}25, 0 16px 32px rgba(0,0,0,0.5)`
          : "0 4px 16px rgba(0,0,0,0.4)",
      }}
      onDoubleClick={onConfigure}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
          style={{ background: cfg.bg }}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold leading-none" style={{ color: cfg.color }}>{cfg.label}</p>
          <p className="text-[9px] text-[#55556a] mt-0.5">{cfg.desc}</p>
        </div>
        <button onClick={e => { e.stopPropagation(); onConfigure(); }}
          className="w-5 h-5 rounded flex items-center justify-center border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "rgba(255,255,255,0.06)" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9090a8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          className="w-5 h-5 rounded flex items-center justify-center border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "rgba(248,113,113,0.1)" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="px-3 py-2.5">{children}</div>

      {/* Botão "+" para próximo bloco */}
      {nextTypes.length > 0 && onAddNext && (
        <div className="absolute -right-4 top-1/2 -translate-y-1/2" style={{ zIndex: 10 }}>
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setShowNextMenu(!showNextMenu); }}
              className="w-7 h-7 rounded-full flex items-center justify-center border-none cursor-pointer shadow-lg transition-all hover:scale-110"
              style={{ background: cfg.color, color: "#fff", fontSize: "16px", fontWeight: "bold" }}>
              +
            </button>
            {showNextMenu && (
              <div className="absolute left-8 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 p-2 rounded-xl"
                style={{ background: "rgba(14,14,20,0.98)", border: "0.5px solid rgba(255,255,255,0.12)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", minWidth: "160px" }}>
                <p className="text-[9px] text-[#55556a] px-2 pb-1 font-semibold uppercase tracking-wider">Adicionar próximo</p>
                {nextTypes.map(t => {
                  const c = BLOCK_CONFIG[t];
                  return (
                    <button key={t} type="button"
                      onClick={e => { e.stopPropagation(); onAddNext(t); setShowNextMenu(false); }}
                      className="flex items-center gap-2 px-2 py-2 rounded-lg text-xs cursor-pointer border-none text-left transition-all hover:opacity-80"
                      style={{ background: c.bg, color: c.color }}>
                      <span>{c.icon}</span>
                      <div>
                        <p className="font-semibold leading-none">{c.label}</p>
                        <p className="text-[9px] opacity-70 mt-0.5">{c.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Nodes ──────────────────────────────────────────────────────

function ProdutoNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  return (
    <>
      <Handle type="source" position={Position.Right} style={handleStyle} id="right" />
      <BaseBlock type="produto" selected={!!selected}
        onConfigure={() => (data as any).onConfigure?.()}
        onDelete={() => (data as any).onDelete?.()}
        onAddNext={(t) => (data as any).onAddNext?.(t)}>
        {d.image ? (
          <div className="flex items-center gap-2">
            <img src={d.image} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" alt="" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[#f0f0f5] truncate">{d.productName || "Produto"}</p>
              <p className="text-[9px] text-[#55556a]">{d.category || "Sem categoria"}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-2 gap-1">
            <span className="text-xl">📷</span>
            <p className="text-[10px] text-[#55556a]">Duplo clique para configurar</p>
          </div>
        )}
      </BaseBlock>
    </>
  );
}

function CenarioNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <BaseBlock type="cenario" selected={!!selected}
        onConfigure={() => (data as any).onConfigure?.()}
        onDelete={() => (data as any).onDelete?.()}
        onAddNext={(t) => (data as any).onAddNext?.(t)}>
        {(d as any).cenarioImageUrl ? (
          <div className="relative rounded-lg overflow-hidden" style={{ height: "60px" }}>
            <img src={(d as any).cenarioImageUrl} className="w-full h-full object-cover" alt="Cenário" />
            <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded text-[8px] font-bold"
              style={{ background: "rgba(62,207,142,0.9)", color: "#fff" }}>✓</div>
          </div>
        ) : (d as any).cenarioStatus === "generating" ? (
          <div className="flex items-center gap-2 py-2">
            <div className="w-4 h-4 border-2 border-[#f59e0b]/30 border-t-[#f59e0b] rounded-full animate-spin flex-shrink-0" />
            <p className="text-[10px] text-[#9090a8]">Gerando...</p>
          </div>
        ) : d.prompt ? (
          <p className="text-[10px] text-[#9090a8] line-clamp-2 leading-relaxed">{d.prompt}</p>
        ) : (
          <div className="flex flex-col items-center py-2 gap-1">
            <span className="text-xl">🎬</span>
            <p className="text-[10px] text-[#55556a]">Duplo clique para configurar</p>
          </div>
        )}
      </BaseBlock>
    </>
  );
}

function AvatarNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <BaseBlock type="avatar" selected={!!selected}
        onConfigure={() => (data as any).onConfigure?.()}
        onDelete={() => (data as any).onDelete?.()}
        onAddNext={(t) => (data as any).onAddNext?.(t)}>
        {d.avatarId ? (
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: "rgba(62,207,142,0.15)", border: "0.5px solid rgba(62,207,142,0.3)" }}>
              🧑‍🎤
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[#f0f0f5] truncate">{d.avatarStyle || "Avatar"}</p>
              <p className="text-[9px] text-[#55556a]">{(d as any).voiceName || d.language?.toUpperCase() || "PT-BR"}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-2 gap-1">
            <span className="text-xl">🧑‍🎤</span>
            <p className="text-[10px] text-[#55556a]">Duplo clique para configurar</p>
          </div>
        )}
      </BaseBlock>
    </>
  );
}

function CopyNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <BaseBlock type="copy" selected={!!selected}
        onConfigure={() => (data as any).onConfigure?.()}
        onDelete={() => (data as any).onDelete?.()}
        onAddNext={(t) => (data as any).onAddNext?.(t)}>
        {d.script ? (
          <div>
            <p className="text-[10px] text-[#9090a8] line-clamp-2 leading-relaxed">{d.script}</p>
            <div className="flex gap-1.5 mt-1.5">
              {d.duration && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}>{d.duration}</span>}
              {d.tone && <span className="text-[9px] text-[#55556a]">{d.tone}</span>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-2 gap-1">
            <span className="text-xl">✍️</span>
            <p className="text-[10px] text-[#55556a]">Duplo clique para configurar</p>
          </div>
        )}
      </BaseBlock>
    </>
  );
}

function GerarNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <BaseBlock type="gerar" selected={!!selected}
        onConfigure={() => (data as any).onConfigure?.()}
        onDelete={() => (data as any).onDelete?.()}>
        {d.status === "generating" ? (
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-[#9090a8]">Gerando...</span>
              <span className="text-[10px] text-[#60a5fa]">{d.progress || 0}%</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div className="h-full rounded-full" style={{ width: `${d.progress || 0}%`, background: "linear-gradient(90deg,#7c6df5,#3ecf8e)" }} />
            </div>
          </div>
        ) : d.status === "done" ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">✅</span>
              <p className="text-[11px] font-medium text-[#3ecf8e]">Pronto!</p>
            </div>
            {(d as any).videoUrl && (
              <a href={(d as any).videoUrl as string} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 py-1 rounded-[6px] text-[10px] font-medium no-underline"
                style={{ background: "rgba(62,207,142,0.15)", color: "#3ecf8e" }}>
                ⬇️ Baixar
              </a>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center py-2 gap-1">
            <span className="text-xl">⚡</span>
            <p className="text-[9px] text-[#55556a]">{d.format || "9:16"} · {d.quality?.toUpperCase() || "HD"}</p>
          </div>
        )}
      </BaseBlock>
    </>
  );
}

const nodeTypes = { produto: ProdutoNode, cenario: CenarioNode, avatar: AvatarNode, copy: CopyNode, gerar: GerarNode };

// ── Modal de configuração ──────────────────────────────────────

function ConfigModal({ node, onUpdate, onClose }: {
  node: Node<BlockData>;
  onUpdate: (id: string, data: Partial<BlockData>) => void;
  onClose: () => void;
}) {
  const type = node.data.type;
  const cfg = BLOCK_CONFIG[type];
  const fileRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingCenario, setGeneratingCenario] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function update(patch: Partial<BlockData>) {
    onUpdate(node.id, patch);
  }

  async function uploadImage(file: File) {
    onUpdate(node.id, { uploading: true } as any);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API}/storage/upload/product-image`, { method: "POST", body: formData });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onUpdate(node.id, { image: data.url, uploading: false } as any);
    } catch {
      const reader = new FileReader();
      reader.onload = ev => onUpdate(node.id, { image: ev.target?.result as string, uploading: false } as any);
      reader.readAsDataURL(file);
    }
  }

  async function generateScript() {
    setGenerating(true);
    try {
      const res = await fetch(`${API}/copy/generate-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: node.data.productName || "produto",
          category: node.data.category || "Geral",
          style: node.data.avatarStyle || "UGC unboxing",
          tone: node.data.tone || "Animado",
          duration: node.data.duration || "30s",
          language: node.data.language || "pt-br",
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      update({ script: data.script });
    } catch {
      update({ script: `Olha esse ${node.data.productName || "produto"} incrível! Qualidade top, entrega rápida. Corre no link da bio! 🔥` });
    } finally {
      setGenerating(false);
    }
  }

  async function generateCenario() {
    if (!node.data.prompt) { alert("Digite um prompt primeiro!"); return; }
    setGeneratingCenario(true);
    onUpdate(node.id, { cenarioStatus: "generating" } as any);
    try {
      const res = await fetch(`${API}/cenario/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: node.data.prompt, aspect_ratio: "9:16" }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      const data = await res.json();
      onUpdate(node.id, { cenarioImageUrl: data.image_url, cenarioStatus: "done" } as any);
    } catch (e: any) {
      onUpdate(node.id, { cenarioStatus: "error" } as any);
      alert(`Erro: ${e.message}`);
    } finally {
      setGeneratingCenario(false);
    }
  }

  function playPreview(voiceId: string, previewUrl: string) {
    if (playingVoice === voiceId) { audioRef.current?.pause(); setPlayingVoice(null); return; }
    audioRef.current?.pause();
    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    audio.play().catch(() => {});
    audio.onended = () => setPlayingVoice(null);
    setPlayingVoice(voiceId);
  }

  const VOICES = [
    { id: "6872a840c4194f42a7f8ce0aee47660c", name: "Pedro Lima", gender: "♂", style: "Friendly", preview: "https://resource.heygen.ai/text_to_speech/tr6HZYtX9AGBdhd2EL9Un.mp3" },
    { id: "94ec497104a04c87904a08a138d6e46c", name: "Sofia Brazil", gender: "♀", style: "Excited", preview: "https://resource.heygen.ai/text_to_speech/ZS5fa8Hoy3vNvwMyE47P99.mp3" },
    { id: "c8ac31e97555494fb8502599e6bc5461", name: "Adriano", gender: "♂", style: "Natural", preview: "https://resource2.heygen.ai/text_to_speech/21e28514b7994f46b907b74914a3ca6e/c8ac31e97555494fb8502599e6bc5461/id=edbd73ae-984b-4ac5-bb44-e8c3741b795f.wav" },
    { id: "4bd875d510f5461a9e228e1cbde2d545", name: "Camila", gender: "♀", style: "Friendly", preview: "https://static.heygen.ai/voice_preview/a0fbec40f1844a78801f5577b2730fb0.wav" },
    { id: "dbf999472fe147be9de01004103c21ea", name: "Adriana", gender: "♀", style: "Natural", preview: "https://static.heygen.ai/voice_preview/56f9ef0f038c4bc28a21ffc254bec715.wav" },
    { id: "3ba59d6edb54e79a40b29726a12d1c3", name: "Carlos", gender: "♂", style: "Calm", preview: "https://resource.heygen.ai/text_to_speech/GgYMC4u6kghazVTJuJJFjB.mp3" },
  ];

  const CENARIO_TEMPLATES = [
    { label: "🏢 Estúdio clean", prompt: "Professional photography studio, clean white background, soft natural lighting, minimalist" },
    { label: "🌆 Lifestyle urbano", prompt: "Modern urban lifestyle, city street golden hour, bokeh effect, no people" },
    { label: "🏖️ Praia tropical", prompt: "Tropical beach sunset, golden hour, palm trees, serene, no people" },
    { label: "💼 Corporativo", prompt: "Modern corporate office, clean desk, professional environment, no people" },
    { label: "🌸 Aesthetic", prompt: "Aesthetic pastel room, soft pink beige tones, minimalist decor, cozy" },
    { label: "🌿 Natureza", prompt: "Lush green forest, soft sunlight through leaves, serene nature, no people" },
  ];

  const [heygenAvatars, setHeygenAvatars] = useState<any[]>([]);
  const [loadingAvatars, setLoadingAvatars] = useState(false);
  const [avatarSearch, setAvatarSearch] = useState("");

  useEffect(() => {
    if (type === "avatar" && heygenAvatars.length === 0) {
      setLoadingAvatars(true);
      fetch("https://api.heygen.com/v2/avatars", {
        headers: { "X-Api-Key": process.env.NEXT_PUBLIC_HEYGEN_API_KEY || "" },
      })
        .then(r => r.json())
        .then(d => { setHeygenAvatars((d?.data?.avatars || []).filter((av: any) => !av.premium)); })
        .catch(() => {})
        .finally(() => setLoadingAvatars(false));
    }
  }, [type]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl flex flex-col overflow-hidden"
        style={{
          width: "480px",
          maxHeight: "85vh",
          background: "rgba(12,12,18,0.99)",
          border: `1px solid ${cfg.color}33`,
          boxShadow: `0 0 0 1px ${cfg.color}15, 0 40px 80px rgba(0,0,0,0.7)`,
        }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: cfg.bg }}>
            {cfg.icon}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-[#f0f0f5]">Configurar {cfg.label}</p>
            <p className="text-[11px] text-[#55556a]">{cfg.desc}</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer text-[#55556a] hover:text-[#f0f0f5] transition-colors"
            style={{ background: "rgba(255,255,255,0.06)" }}>✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

          {/* PRODUTO */}
          {type === "produto" && (
            <>
              <div>
                <label className="text-xs font-medium text-[#9090a8] block mb-2">Foto do produto</label>
                <div onClick={() => fileRef.current?.click()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) uploadImage(f); }}
                  onDragOver={e => e.preventDefault()}
                  className="relative rounded-xl cursor-pointer overflow-hidden flex items-center justify-center"
                  style={{ height: node.data.image ? "160px" : "100px", border: "1.5px dashed rgba(124,109,245,0.35)", background: "rgba(124,109,245,0.04)" }}>
                  {node.data.image ? (
                    <img src={node.data.image} className="w-full h-full object-contain" alt="" />
                  ) : (node.data as any).uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-[#7c6df5]/30 border-t-[#7c6df5] rounded-full animate-spin" />
                      <p className="text-xs text-[#9090a8]">Enviando...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-2xl">📷</span>
                      <p className="text-xs text-[#9090a8]">Arraste ou clique para enviar</p>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
              </div>
              <div>
                <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Nome do produto</label>
                <input type="text" value={node.data.productName || ""} onChange={e => update({ productName: e.target.value })}
                  placeholder="Ex: Tênis Nike Air Max"
                  className="w-full h-10 px-3 rounded-[8px] text-sm outline-none placeholder-[#3a3a4a]"
                  style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
              </div>
              <div>
                <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Categoria</label>
                <div className="flex flex-wrap gap-1.5">
                  {["Moda", "Beleza", "Tech", "Alimentos", "Outros"].map(cat => (
                    <button key={cat} type="button" onClick={() => update({ category: cat })}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border-none"
                      style={node.data.category === cat
                        ? { background: "rgba(124,109,245,0.2)", color: "#a99cf8", border: "0.5px solid rgba(124,109,245,0.4)" }
                        : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* CENÁRIO */}
          {type === "cenario" && (
            <>
              {(node.data as any).cenarioImageUrl && (
                <div>
                  <label className="text-xs font-medium text-[#9090a8] block mb-2">Cenário gerado ✓</label>
                  <div className="relative rounded-xl overflow-hidden" style={{ height: "120px" }}>
                    <img src={(node.data as any).cenarioImageUrl} className="w-full h-full object-cover" alt="" />
                    <button type="button" onClick={() => onUpdate(node.id, { cenarioImageUrl: "", cenarioStatus: "idle" } as any)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center border-none cursor-pointer text-xs"
                      style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}>✕</button>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-[#9090a8] block mb-2">Templates</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {CENARIO_TEMPLATES.map(t => (
                    <button key={t.label} type="button" onClick={() => update({ prompt: t.prompt })}
                      className="text-left px-2.5 py-2 rounded-[8px] text-[11px] cursor-pointer border-none"
                      style={node.data.prompt === t.prompt
                        ? { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "0.5px solid rgba(245,158,11,0.4)" }
                        : { background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Prompt personalizado</label>
                <textarea value={node.data.prompt || ""} onChange={e => update({ prompt: e.target.value })}
                  placeholder="Descreva o cenário em inglês..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-[8px] text-sm resize-none outline-none placeholder-[#3a3a4a]"
                  style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
              </div>
              <button type="button" onClick={generateCenario} disabled={generatingCenario || !node.data.prompt}
                className="h-11 rounded-[10px] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer border-none disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff" }}>
                {generatingCenario ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Gerando (~30s)</> : "🎬 Gerar cenário com IA"}
              </button>
            </>
          )}

          {/* AVATAR */}
          {type === "avatar" && (
            <>
              <div>
                <label className="text-xs font-medium text-[#9090a8] block mb-2">Apresentador</label>
                <input type="text" placeholder="Buscar avatar..." value={avatarSearch} onChange={e => setAvatarSearch(e.target.value)}
                  className="w-full h-8 px-3 rounded-[8px] text-xs outline-none mb-2 placeholder-[#3a3a4a]"
                  style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
                {loadingAvatars ? (
                  <div className="flex items-center justify-center py-6 gap-2">
                    <div className="w-4 h-4 border-2 border-[#3ecf8e]/30 border-t-[#3ecf8e] rounded-full animate-spin" />
                    <span className="text-xs text-[#55556a]">Carregando avatares...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto">
                    {heygenAvatars.filter(av => av.avatar_name.toLowerCase().includes(avatarSearch.toLowerCase())).slice(0, 20).map(av => (
                      <button key={av.avatar_id} type="button"
                        onClick={() => update({ avatarId: av.avatar_id, avatarName: av.avatar_name } as any)}
                        className="flex flex-col items-center gap-1 p-1.5 rounded-xl cursor-pointer border-none"
                        style={node.data.avatarId === av.avatar_id
                          ? { background: "rgba(62,207,142,0.15)", border: "0.5px solid rgba(62,207,142,0.4)" }
                          : { background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                        <img src={av.preview_image_url} alt={av.avatar_name}
                          className="w-12 h-12 rounded-lg object-cover"
                          onError={e => { (e.target as HTMLImageElement).src = "https://placehold.co/48/1a1a22/9090a8?text=AV"; }} />
                        <span className="text-[8px] text-center leading-tight" style={{ color: node.data.avatarId === av.avatar_id ? "#3ecf8e" : "#9090a8" }}>
                          {av.avatar_name.split(" ")[0]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Voz <span className="text-[10px] text-[#55556a]">— ▶ para ouvir</span></label>
                <div className="flex flex-col gap-1.5">
                  {VOICES.map(v => (
                    <div key={v.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-[8px] cursor-pointer"
                      style={(node.data as any).voiceId === v.id
                        ? { background: "rgba(62,207,142,0.1)", border: "0.5px solid rgba(62,207,142,0.3)" }
                        : { background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)" }}
                      onClick={() => update({ voiceId: v.id, voiceName: v.name } as any)}>
                      <span className="text-sm">{v.gender}</span>
                      <div className="flex-1">
                        <p className="text-[11px] font-medium" style={{ color: (node.data as any).voiceId === v.id ? "#3ecf8e" : "#f0f0f5" }}>{v.name}</p>
                        <p className="text-[9px] text-[#55556a]">{v.style}</p>
                      </div>
                      {(node.data as any).voiceId === v.id && <span className="text-[10px] text-[#3ecf8e]">✓</span>}
                      <button type="button" onClick={e => { e.stopPropagation(); playPreview(v.id, v.preview); }}
                        className="w-6 h-6 rounded-full flex items-center justify-center border-none cursor-pointer"
                        style={{ background: playingVoice === v.id ? "rgba(62,207,142,0.2)" : "rgba(124,109,245,0.15)" }}>
                        {playingVoice === v.id
                          ? <svg width="8" height="8" viewBox="0 0 24 24" fill="#3ecf8e"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                          : <svg width="8" height="8" viewBox="0 0 24 24" fill="#a99cf8"><path d="M5 3l14 9-14 9V3z"/></svg>}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Estilo</label>
                <div className="flex flex-wrap gap-1.5">
                  {["UGC unboxing", "Review", "Tutorial", "Oferta relâmpago"].map(s => (
                    <button key={s} type="button" onClick={() => update({ avatarStyle: s })}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border-none"
                      style={node.data.avatarStyle === s
                        ? { background: "rgba(62,207,142,0.15)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.35)" }
                        : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Idioma</label>
                <div className="flex gap-2">
                  {[{ id: "pt-br", label: "🇧🇷 PT-BR" }, { id: "en", label: "🇺🇸 EN" }, { id: "es", label: "🇪🇸 ES" }].map(l => (
                    <button key={l.id} type="button" onClick={() => update({ language: l.id })}
                      className="flex-1 py-1.5 rounded-[8px] text-xs font-medium cursor-pointer border-none"
                      style={node.data.language === l.id
                        ? { background: "rgba(62,207,142,0.15)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.3)" }
                        : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* COPY */}
          {type === "copy" && (
            <>
              <div>
                <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Duração</label>
                <div className="flex gap-2">
                  {["15s", "30s", "45s", "60s"].map(d => (
                    <button key={d} type="button" onClick={() => update({ duration: d })}
                      className="flex-1 py-2 rounded-[8px] text-xs font-bold cursor-pointer border-none"
                      style={node.data.duration === d
                        ? { background: "rgba(248,113,113,0.2)", color: "#f87171", border: "0.5px solid rgba(248,113,113,0.4)" }
                        : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Tom de voz</label>
                <div className="flex flex-wrap gap-1.5">
                  {["Animado", "Natural", "Profissional", "Divertido"].map(t => (
                    <button key={t} type="button" onClick={() => update({ tone: t })}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer border-none"
                      style={node.data.tone === t
                        ? { background: "rgba(248,113,113,0.2)", color: "#f87171", border: "0.5px solid rgba(248,113,113,0.4)" }
                        : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-[#9090a8]">Script</label>
                  <button type="button" onClick={generateScript} disabled={generating}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer border-none disabled:opacity-40"
                    style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", border: "0.5px solid rgba(248,113,113,0.2)" }}>
                    {generating ? "Gerando..." : "✨ Gerar com IA"}
                  </button>
                </div>
                <textarea value={node.data.script || ""} onChange={e => update({ script: e.target.value })}
                  placeholder="Digite o script ou gere com IA..."
                  rows={5}
                  className="w-full px-3 py-2.5 rounded-[8px] text-sm resize-none outline-none placeholder-[#3a3a4a]"
                  style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
              </div>
            </>
          )}

          {/* GERAR */}
          {type === "gerar" && (
            <>
              <div>
                <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Formato</label>
                <div className="flex gap-2">
                  {[{ id: "9:16", label: "9:16 📱" }, { id: "1:1", label: "1:1 ⬜" }, { id: "16:9", label: "16:9 🖥️" }].map(f => (
                    <button key={f.id} type="button" onClick={() => update({ format: f.id })}
                      className="flex-1 py-2 rounded-[8px] text-xs font-semibold cursor-pointer border-none"
                      style={node.data.format === f.id
                        ? { background: "rgba(96,165,250,0.2)", color: "#60a5fa", border: "0.5px solid rgba(96,165,250,0.4)" }
                        : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Qualidade</label>
                <div className="flex gap-2">
                  {["HD 1080p", "4K"].map(q => (
                    <button key={q} type="button" onClick={() => update({ quality: q })}
                      className="flex-1 py-2 rounded-[8px] text-xs font-semibold cursor-pointer border-none"
                      style={node.data.quality === q
                        ? { background: "rgba(96,165,250,0.2)", color: "#60a5fa", border: "0.5px solid rgba(96,165,250,0.4)" }
                        : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-[10px] px-4 py-3"
                style={{ background: "rgba(96,165,250,0.08)", border: "0.5px solid rgba(96,165,250,0.2)" }}>
                <div className="flex justify-between">
                  <span className="text-xs text-[#9090a8]">Créditos necessários</span>
                  <span className="text-sm font-bold text-[#60a5fa]">
                    {CREDIT_COST[node.data.duration as string || "30s"] || 15} créditos
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: "0.5px solid rgba(255,255,255,0.07)" }}>
          <button type="button" onClick={onClose}
            className="w-full h-10 rounded-[8px] text-sm font-semibold cursor-pointer border-none hover:opacity-90"
            style={{ background: cfg.color, color: "#fff" }}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────

let nodeId = 10;
const nextId = () => `node_${nodeId++}`;

const initialNodes: Node[] = [{
  id: "node_1",
  type: "produto",
  position: { x: 100, y: 200 },
  data: { type: "produto", label: "Produto", category: "Moda" } as BlockData,
}];

export default function TikTokCanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [rfInstance, setRfInstance] = useState<any>(null);
  const [userCredits, setUserCredits] = useState<number>(50);
  const [creditModal, setCreditModal] = useState<{ needed: number; have: number } | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const { getSupabase } = require("@/lib/supabase");
      const sb = getSupabase();
      sb.auth.getUser().then(({ data }: any) => {
        if (data?.user) {
          fetch(`${API}/credits/${data.user.id}`)
            .then(r => r.json())
            .then(d => { if (d.balance !== undefined) setUserCredits(d.balance); })
            .catch(() => {});
        }
      });
    } catch {}
  }, []);

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge({
      ...params, animated: true,
      style: { stroke: "#7c6df5", strokeWidth: 2 }
    }, eds)),
    [setEdges]
  );

  function addNode(type: BlockType, position?: { x: number; y: number }, sourceId?: string) {
    const id = nextId();
    const pos = position || { x: 300 + Math.random() * 200, y: 100 + Math.random() * 300 };
    const newNode: Node = {
      id,
      type,
      position: pos,
      data: {
        type, label: BLOCK_CONFIG[type].label,
        duration: "30s", tone: "Animado",
        format: "9:16", quality: "HD 1080p",
        language: "pt-br", avatarStyle: "UGC unboxing",
        status: "idle",
      } as BlockData,
    };
    setNodes(nds => [...nds, newNode]);

    // Auto-conecta ao bloco fonte
    if (sourceId) {
      setEdges(eds => addEdge({
        id: `e_${sourceId}_${id}`,
        source: sourceId,
        target: id,
        animated: true,
        style: { stroke: "#7c6df5", strokeWidth: 2 },
      }, eds));
    }
    setSelectedNodeId(id);
  }

  function updateNodeData(id: string, patch: Partial<BlockData>) {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
  }

  const nodesWithConfig = nodes.map(n => ({
    ...n,
    data: {
      ...n.data,
      onConfigure: () => setSelectedNodeId(n.id),
      onDelete: () => {
        setNodes(nds => nds.filter(node => node.id !== n.id));
        setEdges(eds => eds.filter(e => e.source !== n.id && e.target !== n.id));
        if (selectedNodeId === n.id) setSelectedNodeId(null);
      },
      onAddNext: (type: BlockType) => {
        const currentNode = nodes.find(nd => nd.id === n.id);
        const pos = currentNode ? {
          x: currentNode.position.x + 260,
          y: currentNode.position.y,
        } : undefined;
        addNode(type, pos, n.id);
      },
    },
  }));

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer.getData("blockType") as BlockType;
    if (!type || !rfInstance || !reactFlowWrapper.current) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const pos = rfInstance.screenToFlowPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
    addNode(type, pos);
  }

  async function handleGerarTodos() {
    const gerarNodes = nodes.filter(n => n.data.type === "gerar");
    if (gerarNodes.length === 0) { alert("Adicione pelo menos um bloco Gerar!"); return; }

    let totalCredits = 0;
    for (const gn of gerarNodes) {
      const connectedEdges = edges.filter(e => e.target === gn.id);
      let duration = "30s";
      for (const edge of connectedEdges) {
        const src = nodes.find(n => n.id === edge.source);
        if (src?.data.type === "copy" && src.data.duration) duration = src.data.duration as string;
        const indirect = edges.filter(e => e.target === src?.id);
        for (const ie of indirect) {
          const up = nodes.find(n => n.id === ie.source);
          if (up?.data.type === "copy" && up.data.duration) duration = up.data.duration as string;
        }
      }
      totalCredits += CREDIT_COST[duration] || 15;
    }

    if (totalCredits > userCredits) { setCreditModal({ needed: totalCredits, have: userCredits }); return; }

    const confirmed = window.confirm(
      `Gerar ${gerarNodes.length} vídeo${gerarNodes.length > 1 ? "s" : ""}?\n\nCusto: ${totalCredits} créditos\nSaldo após: ${userCredits - totalCredits} créditos`
    );
    if (!confirmed) return;

    for (const gerarNode of gerarNodes) {
      const connectedEdges = edges.filter(e => e.target === gerarNode.id);
      let avatarId = "", script = "", voiceId = VOICE_IDS["pt-br"], bgColor = "#ffffff", cenarioImageUrl = "";

      for (const edge of connectedEdges) {
        const src = nodes.find(n => n.id === edge.source);
        if (!src) continue;
        if (src.data.type === "copy") { script = (src.data.script as string) || ""; }
        if (src.data.type === "avatar") {
          avatarId = (src.data.avatarId as string) || "";
          voiceId = (src.data as any).voiceId || VOICE_IDS[(src.data.language as string) || "pt-br"];
        }
        if (src.data.type === "cenario") {
          bgColor = (src.data.bgColor as string) || "#ffffff";
          cenarioImageUrl = (src.data as any).cenarioImageUrl || "";
        }
        const indirect = edges.filter(e => e.target === src.id);
        for (const ie of indirect) {
          const up = nodes.find(n => n.id === ie.source);
          if (!up) continue;
          if (up.data.type === "avatar") { avatarId = (up.data.avatarId as string) || ""; voiceId = (up.data as any).voiceId || voiceId; }
          if (up.data.type === "copy") { script = (up.data.script as string) || ""; }
          if (up.data.type === "cenario") { cenarioImageUrl = (up.data as any).cenarioImageUrl || ""; }
        }
      }

      if (!avatarId || !script) { alert("Conecte um Avatar e uma Copy ao bloco Gerar!"); continue; }

      setNodes(nds => nds.map(n => n.id === gerarNode.id ? { ...n, data: { ...n.data, status: "generating", progress: 10 } } : n));

      try {
        const res = await fetch(`${API}/heygen/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            avatar_id: avatarId, script, voice_id: voiceId,
            background_image_url: cenarioImageUrl || null,
            background_color: bgColor,
            width: (gerarNode.data.format as string) === "16:9" ? 1920 : 1080,
            height: (gerarNode.data.format as string) === "16:9" ? 1080 : 1920,
          }),
        });
        if (!res.ok) throw new Error("Erro ao iniciar geração");
        const data = await res.json();
        const videoId = data.video_id;

        setNodes(nds => nds.map(n => n.id === gerarNode.id ? { ...n, data: { ...n.data, progress: 30, videoId } } : n));

        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          try {
            const sr = await fetch(`${API}/heygen/status/${videoId}`);
            const sd = await sr.json();
            const progress = Math.min(30 + attempts * 5, 90);
            setNodes(nds => nds.map(n => n.id === gerarNode.id ? { ...n, data: { ...n.data, progress } } : n));
            if (sd.status === "completed") {
              clearInterval(poll);
              setNodes(nds => nds.map(n => n.id === gerarNode.id ? { ...n, data: { ...n.data, status: "done", progress: 100, videoUrl: sd.video_url } } : n));
              setUserCredits(prev => prev - (CREDIT_COST[(gerarNode.data.duration as string) || "30s"] || 15));
            } else if (sd.status === "failed" || attempts > 60) {
              clearInterval(poll);
              setNodes(nds => nds.map(n => n.id === gerarNode.id ? { ...n, data: { ...n.data, status: "idle", progress: 0 } } : n));
            }
          } catch { clearInterval(poll); }
        }, 5000);
      } catch {
        setNodes(nds => nds.map(n => n.id === gerarNode.id ? { ...n, data: { ...n.data, status: "idle", progress: 0 } } : n));
      }
    }
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)", background: "#07070d" }}>
      <style>{`
        .react-flow__handle { transition: transform 0.15s, box-shadow 0.15s; }
        .react-flow__handle:hover { transform: scale(1.5) !important; box-shadow: 0 0 0 4px rgba(124,109,245,0.3); }
        .react-flow__edge:hover .react-flow__edge-path { stroke: #a99cf8 !important; stroke-width: 3 !important; cursor: pointer; }
        .react-flow__controls { border-radius: 12px !important; overflow: hidden; }
        .react-flow__controls-button { background: rgba(14,14,20,0.95) !important; border-color: rgba(255,255,255,0.1) !important; }
        .react-flow__controls-button svg { fill: #9090a8 !important; }
        .react-flow__minimap { border-radius: 12px !important; overflow: hidden; }
      `}</style>

      {/* Topbar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: "rgba(11,11,17,0.99)", borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-3">
          <a href="/dashboard"
            className="w-7 h-7 rounded-lg flex items-center justify-center no-underline"
            style={{ background: "rgba(255,255,255,0.06)", border: "0.5px solid rgba(255,255,255,0.1)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9090a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </a>
          <div>
            <p className="text-sm font-bold text-[#f0f0f5]">Criativo de Produto</p>
            <p className="text-[10px] text-[#55556a]">TikTok Shop · Facebook Ads · Kwai · Instagram</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-[#9090a8] px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span className="font-semibold text-[#f0f0f5]">{userCredits.toLocaleString()}</span> créditos
          </div>
          <button type="button" onClick={handleGerarTodos}
            className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-semibold cursor-pointer border-none hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff", boxShadow: "0 4px 14px rgba(124,109,245,0.4)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            Gerar todos
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative" ref={reactFlowWrapper}
        onDrop={handleDrop} onDragOver={e => e.preventDefault()}>

        {/* Toolbar lateral compacta */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
          {(Object.entries(BLOCK_CONFIG) as [BlockType, typeof BLOCK_CONFIG[BlockType]][]).map(([type, cfg]) => (
            <button key={type} type="button" onClick={() => addNode(type)}
              draggable onDragStart={e => e.dataTransfer.setData("blockType", type)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg cursor-pointer border-none transition-all hover:scale-110 active:scale-95"
              style={{ background: cfg.bg, border: `0.5px solid ${cfg.color}44` }}
              title={`Adicionar ${cfg.label}`}>
              {cfg.icon}
            </button>
          ))}
        </div>

        <ReactFlow
          nodes={nodesWithConfig}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onInit={setRfInstance}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          onEdgeClick={(_, edge) => setEdges(eds => eds.filter(e => e.id !== edge.id))}
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
          style={{ background: "#f5f5f7" }}
          defaultEdgeOptions={{ animated: true, style: { stroke: "#7c6df5", strokeWidth: 2 } }}
          proOptions={{ hideAttribution: true }}>
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#c8c8d0" style={{ background: "#f5f5f7" }} />
          <Controls style={{ left: "64px" }} />
          <MiniMap style={{ background: "rgba(14,14,20,0.95)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: "12px" }} nodeColor={() => "#7c6df5"} />
          <Panel position="top-right" style={{ marginRight: "12px", marginTop: "8px" }}>
            <div className="text-[10px] text-[#55556a] px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(14,14,20,0.9)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
              {nodes.length} bloco{nodes.length !== 1 ? "s" : ""} · {edges.length} conexão{edges.length !== 1 ? "ões" : ""}
            </div>
          </Panel>
        </ReactFlow>

        {/* Modal de configuração */}
        {selectedNode && (
          <ConfigModal
            node={selectedNode as Node<BlockData>}
            onUpdate={updateNodeData}
            onClose={() => setSelectedNodeId(null)}
          />
        )}

        {/* Modal créditos insuficientes */}
        {creditModal && (
          <div className="absolute inset-0 flex items-center justify-center z-50"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
            <div className="rounded-2xl p-7 max-w-sm w-full mx-4"
              style={{ background: "#131318", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 40px 80px rgba(0,0,0,0.6)" }}>
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h3 className="text-[17px] font-bold text-[#f0f0f5] text-center mb-2">Créditos insuficientes</h3>
              <p className="text-[13px] text-[#9090a8] text-center leading-relaxed mb-5">
                Seus vídeos precisam de <strong className="text-[#f87171]">{creditModal.needed} créditos</strong> mas você tem apenas <strong className="text-[#f0f0f5]">{creditModal.have}</strong>.
              </p>
              <div className="rounded-[10px] p-4 mb-5" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                <div className="flex justify-between text-[12px] mb-2">
                  <span className="text-[#55556a]">Necessário</span>
                  <span className="text-[#f87171] font-semibold">{creditModal.needed} créditos</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-[#55556a]">Faltam</span>
                  <span className="text-[#f87171] font-bold">{creditModal.needed - creditModal.have} créditos</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <a href="/dashboard/settings" className="w-full h-11 rounded-[10px] text-sm font-semibold flex items-center justify-center no-underline"
                  style={{ background: "#7c6df5", color: "#fff" }}>
                  ⚡ Ver planos
                </a>
                <button type="button" onClick={() => setCreditModal(null)}
                  className="w-full h-10 rounded-[10px] text-sm cursor-pointer border-none"
                  style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
