"use client";

// ─────────────────────────────────────────────────────────────
// frontend/app/tiktok/page.tsx
// Canvas visual TikTok Shop — React Flow com blocos arrastáveis
// ─────────────────────────────────────────────────────────────

import { useState, useCallback, useRef, useEffect } from "react";
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

// ── Tipos de bloco ────────────────────────────────────────────

type BlockType = "produto" | "cenario" | "avatar" | "copy" | "gerar";

interface BlockData extends Record<string, unknown> {
  label: string;
  type: BlockType;
  // produto
  image?: string;
  productName?: string;
  category?: string;
  // cenario
  prompt?: string;
  bgColor?: string;
  // avatar
  avatarId?: string;
  avatarStyle?: string;
  language?: string;
  // copy
  script?: string;
  duration?: string;
  tone?: string;
  // gerar
  format?: string;
  quality?: string;
  status?: "idle" | "generating" | "done";
  progress?: number;
}

// ── Cores e ícones por tipo ───────────────────────────────────

const BLOCK_CONFIG: Record<BlockType, { color: string; bg: string; icon: string; label: string; desc: string }> = {
  produto:  { color: "#a99cf8", bg: "rgba(124,109,245,0.12)", icon: "🛍️", label: "Produto",  desc: "Imagem + nome" },
  cenario:  { color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  icon: "🎬", label: "Cenário",  desc: "Fundo gerado por IA" },
  avatar:   { color: "#3ecf8e", bg: "rgba(62,207,142,0.12)",  icon: "🧑‍🎤", label: "Avatar",   desc: "Apresentador virtual" },
  copy:     { color: "#f87171", bg: "rgba(248,113,113,0.12)", icon: "✍️", label: "Copy",     desc: "Script do vídeo" },
  gerar:    { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  icon: "⚡", label: "Gerar",    desc: "Renderizar vídeo" },
};

// ── Handle estilizado ─────────────────────────────────────────

const handleStyle = {
  width: 14,
  height: 14,
  background: "#7c6df5",
  border: "3px solid #131318",
  borderRadius: "50%",
  cursor: "crosshair",
};

// ── Bloco base ────────────────────────────────────────────────

function BaseBlock({ type, children, selected, onConfigure, onDelete }: {
  type: BlockType;
  children: React.ReactNode;
  selected: boolean;
  onConfigure: () => void;
  onDelete: () => void;
}) {
  const cfg = BLOCK_CONFIG[type];
  return (
    <div
      className="relative rounded-2xl cursor-pointer transition-all duration-150"
      style={{
        width: 220,
        background: "rgba(14,14,20,0.98)",
        border: `1px solid ${selected ? cfg.color : "rgba(255,255,255,0.1)"}`,
        boxShadow: selected
          ? `0 0 0 2px ${cfg.color}33, 0 20px 40px rgba(0,0,0,0.5)`
          : "0 4px 20px rgba(0,0,0,0.4)",
      }}
      onDoubleClick={onConfigure}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
          style={{ background: cfg.bg, border: `0.5px solid ${cfg.color}44` }}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold leading-none mb-0.5" style={{ color: cfg.color }}>{cfg.label}</p>
          <p className="text-[10px] leading-none" style={{ color: "#55556a" }}>{cfg.desc}</p>
        </div>
        <button
          className="w-6 h-6 rounded-md flex items-center justify-center border-none cursor-pointer transition-all hover:opacity-80"
          style={{ background: "rgba(255,255,255,0.06)" }}
          onClick={e => { e.stopPropagation(); onConfigure(); }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9090a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
        <button
          className="w-6 h-6 rounded-md flex items-center justify-center border-none cursor-pointer transition-all hover:opacity-80"
          style={{ background: "rgba(248,113,113,0.1)" }}
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Deletar bloco"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </button>
      </div>
      {/* Content */}
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

// ── Nó: Produto ───────────────────────────────────────────────

function ProdutoNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  return (
    <>
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <BaseBlock type="produto" selected={!!selected} onConfigure={() => (data as any).onConfigure?.()} onDelete={() => (data as any).onDelete?.()}>
        {d.image ? (
          <div className="flex items-center gap-2.5">
            <img src={d.image} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" alt="" />
            <div>
              <p className="text-xs font-medium text-[#f0f0f5] leading-tight">{d.productName || "Produto"}</p>
              <p className="text-[10px] text-[#55556a]">{d.category || "Sem categoria"}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-3 gap-1.5">
            <div className="text-2xl">📷</div>
            <p className="text-xs text-[#55556a]">Duplo clique para configurar</p>
          </div>
        )}
      </BaseBlock>
    </>
  );
}

// ── Nó: Cenário ───────────────────────────────────────────────

function CenarioNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <BaseBlock type="cenario" selected={!!selected} onConfigure={() => (data as any).onConfigure?.()} onDelete={() => (data as any).onDelete?.()}>
        {d.prompt ? (
          <div>
            <p className="text-xs text-[#9090a8] leading-relaxed line-clamp-2">{d.prompt}</p>
            {d.bgColor && (
              <div className="flex items-center gap-1.5 mt-2">
                <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: d.bgColor }} />
                <span className="text-[10px] text-[#55556a]">Cor de fundo</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center py-3 gap-1.5">
            <div className="text-2xl">🎬</div>
            <p className="text-xs text-[#55556a]">Duplo clique para configurar</p>
          </div>
        )}
      </BaseBlock>
    </>
  );
}

// ── Nó: Avatar ────────────────────────────────────────────────

const AVATAR_EMOJIS: Record<string, string> = {
  av1: "👩🏽", av2: "👨🏻", av3: "👩🏻‍🦱", av4: "👨🏽‍🦰", av5: "👩🏼", av6: "👨🏾",
};

function AvatarNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <BaseBlock type="avatar" selected={!!selected} onConfigure={() => (data as any).onConfigure?.()} onDelete={() => (data as any).onDelete?.()}>
        {d.avatarId ? (
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
              style={{ background: "rgba(62,207,142,0.15)", border: "0.5px solid rgba(62,207,142,0.3)" }}>
              {AVATAR_EMOJIS[d.avatarId] || "🧑"}
            </div>
            <div>
              <p className="text-xs font-medium text-[#f0f0f5]">{d.avatarStyle || "Avatar"}</p>
              <p className="text-[10px] text-[#55556a]">{(d as any).voiceName || d.language?.toUpperCase() || "PT-BR"}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-3 gap-1.5">
            <div className="text-2xl">🧑‍🎤</div>
            <p className="text-xs text-[#55556a]">Duplo clique para configurar</p>
          </div>
        )}
      </BaseBlock>
    </>
  );
}

// ── Nó: Copy ─────────────────────────────────────────────────

function CopyNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <BaseBlock type="copy" selected={!!selected} onConfigure={() => (data as any).onConfigure?.()} onDelete={() => (data as any).onDelete?.()}>
        {d.script ? (
          <div>
            <p className="text-xs text-[#9090a8] leading-relaxed line-clamp-2">{d.script}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: "rgba(248,113,113,0.1)", color: "#f87171" }}>
                {d.duration || "30s"}
              </span>
              <span className="text-[10px] text-[#55556a]">{d.tone || "Animado"}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-3 gap-1.5">
            <div className="text-2xl">✍️</div>
            <p className="text-xs text-[#55556a]">Duplo clique para configurar</p>
          </div>
        )}
      </BaseBlock>
    </>
  );
}

// ── Nó: Gerar ────────────────────────────────────────────────

function GerarNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <BaseBlock type="gerar" selected={!!selected} onConfigure={() => (data as any).onConfigure?.()} onDelete={() => (data as any).onDelete?.()}>
        {d.status === "generating" ? (
          <div>
            <div className="flex justify-between mb-1.5">
              <span className="text-xs text-[#9090a8]">Gerando...</span>
              <span className="text-xs text-[#60a5fa] font-medium">{d.progress || 0}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${d.progress || 0}%`, background: "linear-gradient(90deg,#7c6df5,#3ecf8e)" }} />
            </div>
          </div>
        ) : d.status === "done" ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(62,207,142,0.15)" }}>✅</div>
              <div>
                <p className="text-xs font-medium text-[#3ecf8e]">Pronto!</p>
                <p className="text-[10px] text-[#55556a]">Vídeo gerado</p>
              </div>
            </div>
            {(d as any).videoUrl && (
              <a href={(d as any).videoUrl as string} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-1.5 rounded-[6px] text-[10px] font-medium no-underline"
                style={{ background: "rgba(62,207,142,0.15)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.3)" }}>
                ⬇️ Baixar vídeo
              </a>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center py-3 gap-1.5">
            <div className="text-2xl">⚡</div>
            <p className="text-xs text-[#55556a]">{d.format || "9:16"} · {d.quality?.toUpperCase() || "HD"}</p>
          </div>
        )}
      </BaseBlock>
    </>
  );
}

const nodeTypes = {
  produto: ProdutoNode,
  cenario: CenarioNode,
  avatar: AvatarNode,
  copy: CopyNode,
  gerar: GerarNode,
};

// ── Avatar Picker com avatares reais do HeyGen ───────────────

interface HeyGenAvatar {
  avatar_id: string;
  avatar_name: string;
  gender: string;
  preview_image_url: string;
}

function AvatarPicker({ node, update }: { node: Node<BlockData>; update: (patch: Partial<BlockData>) => void }) {
  const [avatars, setAvatars] = useState<HeyGenAvatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("https://api.heygen.com/v2/avatars", {
      headers: { "X-Api-Key": process.env.NEXT_PUBLIC_HEYGEN_API_KEY || "" },
    })
      .then(r => r.json())
      .then(d => {
        const list = (d?.data?.avatars || []).filter((av: any) => !av.premium);
        setAvatars(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = avatars.filter(av =>
    av.avatar_name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 18);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-2">Apresentador</label>
        <input
          type="text"
          placeholder="Buscar avatar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-8 px-3 rounded-[8px] text-xs outline-none mb-2 placeholder-[#3a3a4a]"
          style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }}
        />
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <div className="w-4 h-4 border-2 border-[#3ecf8e]/30 border-t-[#3ecf8e] rounded-full animate-spin" />
            <span className="text-xs text-[#55556a]">Carregando avatares...</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {filtered.map(av => (
              <button key={av.avatar_id} type="button"
                onClick={() => update({ avatarId: av.avatar_id, avatarName: av.avatar_name } as any)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl cursor-pointer border-none transition-all hover:scale-[1.02]"
                style={node.data.avatarId === av.avatar_id
                  ? { background: "rgba(62,207,142,0.15)", border: "0.5px solid rgba(62,207,142,0.4)" }
                  : { background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                <img
                  src={av.preview_image_url}
                  alt={av.avatar_name}
                  className="w-14 h-14 rounded-lg object-cover"
                  onError={e => { (e.target as HTMLImageElement).src = "https://placehold.co/56x56/1a1a22/9090a8?text=Avatar"; }}
                />
                <span className="text-[9px] text-center leading-tight" style={{ color: node.data.avatarId === av.avatar_id ? "#3ecf8e" : "#9090a8" }}>
                  {av.avatar_name.split(" ").slice(0, 2).join(" ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Voz</label>
        <div className="flex flex-col gap-1.5">
          {[
            { id: "6872a840c4194f42a7f8ce0aee47660c", name: "Pedro Lima", gender: "♂", style: "Friendly" },
            { id: "22cd399317428a8151293305deceba", name: "Ana Carvalho", gender: "♀", style: "Friendly" },
            { id: "94ec497104a04c87904a08a138d6e46c", name: "Sofia Brazil", gender: "♀", style: "Excited" },
            { id: "6d282a9f296746568da9d65586935dba", name: "Sofia Brazil", gender: "♀", style: "Friendly" },
            { id: "c8ac31e97555494fb8502599e6bc5461", name: "Adriano", gender: "♂", style: "Natural" },
            { id: "3ba59d6edb54e79a40b29726a12d1c3", name: "Calm Carlos", gender: "♂", style: "Calm" },
            { id: "4bd875d510f5461a9e228e1cbde2d545", name: "Camila", gender: "♀", style: "Friendly" },
            { id: "dbf999472fe147be9de01004103c21ea", name: "Adriana", gender: "♀", style: "Natural" },
          ].map(v => (
            <button key={v.id} type="button"
              onClick={() => update({ voiceId: v.id, voiceName: v.name } as any)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-xs cursor-pointer border-none text-left"
              style={(node.data as any).voiceId === v.id
                ? { background: "rgba(62,207,142,0.1)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.3)" }
                : { background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
              <span className="text-base">{v.gender}</span>
              <div>
                <p className="font-medium leading-none mb-0.5">{v.name}</p>
                <p className="text-[10px] opacity-60">{v.style}</p>
              </div>
              {(node.data as any).voiceId === v.id && (
                <span className="ml-auto text-[10px]">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Estilo</label>
        <div className="flex flex-col gap-1.5">
          {["UGC unboxing", "Review", "Tutorial", "Oferta relâmpago"].map(s => (
            <button key={s} type="button" onClick={() => update({ avatarStyle: s })}
              className="flex items-center gap-2 px-3 py-2 rounded-[8px] text-xs cursor-pointer border-none text-left"
              style={node.data.avatarStyle === s
                ? { background: "rgba(62,207,142,0.1)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.3)" }
                : { background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: node.data.avatarStyle === s ? "#3ecf8e" : "#55556a" }} />
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
              className="flex-1 py-2 rounded-[8px] text-xs font-medium cursor-pointer border-none"
              style={node.data.language === l.id
                ? { background: "rgba(62,207,142,0.15)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.3)" }
                : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Painel lateral — configuração do bloco ────────────────────

function ConfigPanel({ node, onUpdate, onClose }: {
  node: Node<BlockData>;
  onUpdate: (id: string, data: Partial<BlockData>) => void;
  onClose: () => void;
}) {
  const type = node.data.type;
  const cfg = BLOCK_CONFIG[type];
  const fileRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);

  async function uploadImage(file: File) {
    onUpdate(node.id, { uploading: true } as any);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`https://clipforge-6yzz.onrender.com/storage/upload/product-image`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Erro no upload");
      const data = await res.json();
      onUpdate(node.id, { image: data.url, imageKey: data.key, uploading: false } as any);
    } catch {
      // Fallback: preview local
      const reader = new FileReader();
      reader.onload = ev => onUpdate(node.id, { image: ev.target?.result as string, uploading: false } as any);
      reader.readAsDataURL(file);
    }
  }

  function update(patch: Partial<BlockData>) {
    onUpdate(node.id, patch);
  }

  async function generateScript() {
    setGenerating(true);
    try {
      const res = await fetch(`https://clipforge-6yzz.onrender.com/copy/generate-script`, {
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
      if (!res.ok) throw new Error("Erro na API");
      const data = await res.json();
      update({ script: data.script });
    } catch (e) {
      // Fallback local se backend não responder
      const fallbacks: Record<string, string> = {
        "UGC unboxing": `Gente, esse ${node.data.productName || "produto"} chegou e eu precisei mostrar pra vocês! Qualidade incrível — aprovado! Corre no link da bio! 🔥`,
        "Review": `Testei o ${node.data.productName || "produto"} por uma semana. Qualidade 10/10, entrega rápida. Altamente recomendo! Link na bio.`,
        "Tutorial": `Vou te mostrar como usar o ${node.data.productName || "produto"} em 3 passos simples. Pegue o seu no link da bio! ✨`,
        "Oferta relâmpago": `⚡ Só até hoje! ${node.data.productName || "Produto"} com desconto especial. Estoque limitado — link na bio!`,
      };
      update({ script: fallbacks[node.data.avatarStyle || ""] || `Confira o incrível ${node.data.productName || "produto"}! Link na bio! 🛍️` });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="absolute top-0 right-0 h-full w-80 flex flex-col z-50 overflow-hidden"
      style={{ background: "rgba(11,11,17,0.99)", borderLeft: "0.5px solid rgba(255,255,255,0.08)" }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
        style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
          style={{ background: cfg.bg, border: `0.5px solid ${cfg.color}44` }}>
          {cfg.icon}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#f0f0f5]">Configurar {cfg.label}</p>
          <p className="text-[10px] text-[#55556a]">Duplo clique no bloco para editar</p>
        </div>
        <button onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer text-[#55556a] hover:text-[#f0f0f5] transition-colors"
          style={{ background: "rgba(255,255,255,0.05)" }}>✕</button>
      </div>

      {/* Conteúdo por tipo */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

        {/* ── PRODUTO ── */}
        {type === "produto" && (
          <>
            <div>
              <label className="text-xs font-medium text-[#9090a8] block mb-2">Foto do produto</label>
              <div
                onClick={() => fileRef.current?.click()}
                onDrop={e => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (!file) return;
                  uploadImage(file);
                }}
                onDragOver={e => e.preventDefault()}
                className="flex flex-col items-center justify-center rounded-xl cursor-pointer transition-all hover:border-[#7c6df5]"
                style={{
                  height: node.data.image ? "180px" : "120px",
                  border: "1.5px dashed rgba(124,109,245,0.3)",
                  background: "rgba(124,109,245,0.04)",
                  position: "relative",
                }}>
                {node.data.image ? (
                  <img src={node.data.image} className="w-full h-full object-contain rounded-xl" alt="" />
                ) : (node.data as any).uploading ? (
                  <>
                    <div className="w-6 h-6 border-2 border-[#7c6df5]/30 border-t-[#7c6df5] rounded-full animate-spin mb-2" />
                    <p className="text-xs text-[#9090a8]">Enviando...</p>
                  </>
                ) : (
                  <>
                    <span className="text-2xl mb-1.5">📷</span>
                    <p className="text-xs text-[#9090a8]">Arraste ou clique para enviar</p>
                    <p className="text-[10px] text-[#55556a]">JPG, PNG até 10MB</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]; if (!file) return;
                  uploadImage(file);
                }} />
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
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer border-none transition-all"
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

        {/* ── CENÁRIO ── */}
        {type === "cenario" && (
          <>
            <div>
              <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Prompt do cenário</label>
              <textarea value={node.data.prompt || ""} onChange={e => update({ prompt: e.target.value })}
                placeholder="Descreva o cenário que a IA vai gerar. Ex: Estúdio moderno com luz natural, fundo branco clean, atmosfera profissional..."
                rows={5}
                className="w-full px-3 py-2.5 rounded-[8px] text-sm resize-none outline-none placeholder-[#3a3a4a]"
                style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
            </div>
            <div>
              <label className="text-xs font-medium text-[#9090a8] block mb-2">Sugestões rápidas</label>
              <div className="flex flex-col gap-1.5">
                {[
                  "Estúdio minimalista com fundo branco e luz suave",
                  "Ambiente lifestyle urbano, rua movimentada de dia",
                  "Cenário de praia ao pôr do sol, clima tropical",
                  "Escritório moderno, ambiente corporativo clean",
                  "Quarto estético aesthetic, tons pastéis",
                ].map(s => (
                  <button key={s} type="button" onClick={() => update({ prompt: s })}
                    className="text-left px-3 py-2 rounded-[8px] text-xs cursor-pointer border-none transition-all"
                    style={{ background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-[#9090a8] block mb-2">Cor de fundo</label>
              <div className="flex flex-wrap gap-2">
                {["#ffffff", "#f8f4f0", "#1a1a2e", "#0f3460", "#e8f5e9", "#fce4ec", "#e3f2fd", "#000000"].map(c => (
                  <button key={c} type="button" onClick={() => update({ bgColor: c })}
                    className="w-7 h-7 rounded-full cursor-pointer border-none transition-transform hover:scale-110"
                    style={{ background: c, outline: node.data.bgColor === c ? "2px solid #7c6df5" : "2px solid transparent", outlineOffset: "2px" }} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── AVATAR ── */}
        {type === "avatar" && (
          <AvatarPicker node={node} update={update} />
        )}

        {/* ── COPY ── */}
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
                rows={6}
                className="w-full px-3 py-2.5 rounded-[8px] text-sm resize-none outline-none placeholder-[#3a3a4a]"
                style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
            </div>
          </>
        )}

        {/* ── GERAR ── */}
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
                <span className="text-xs text-[#9090a8]">Créditos</span>
                <span className="text-sm font-bold text-[#60a5fa]">
                  {node.data.duration === "15s" ? 8 : node.data.duration === "30s" ? 15 : node.data.duration === "45s" ? 20 : 25} créditos
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: "0.5px solid rgba(255,255,255,0.07)" }}>
        <button type="button" onClick={onClose}
          className="w-full h-10 rounded-[8px] text-sm font-semibold cursor-pointer border-none transition-all hover:opacity-90"
          style={{ background: "#7c6df5", color: "#fff" }}>
          Aplicar
        </button>
      </div>
    </div>
  );
}

// ── Barra lateral de blocos ───────────────────────────────────

function BlockSidebar({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <div className="absolute top-0 left-0 h-full w-56 flex flex-col z-50"
      style={{ background: "rgba(11,11,17,0.99)", borderRight: "0.5px solid rgba(255,255,255,0.08)" }}>
      <div className="px-4 py-4" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
        <p className="text-xs font-bold text-[#f0f0f5]">Blocos</p>
        <p className="text-[10px] text-[#55556a] mt-0.5">Arraste para o canvas ou clique para adicionar</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
        {(Object.entries(BLOCK_CONFIG) as [BlockType, typeof BLOCK_CONFIG[BlockType]][]).map(([type, cfg]) => (
          <button
            key={type}
            type="button"
            onClick={() => onAdd(type)}
            className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer border-none text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: cfg.bg, border: `0.5px solid ${cfg.color}33` }}
            draggable
            onDragStart={e => e.dataTransfer.setData("blockType", type)}
          >
            <span className="text-xl flex-shrink-0">{cfg.icon}</span>
            <div>
              <p className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</p>
              <p className="text-[10px] text-[#55556a]">{cfg.desc}</p>
            </div>
          </button>
        ))}
      </div>
      <div className="px-3 py-3" style={{ borderTop: "0.5px solid rgba(255,255,255,0.07)" }}>
        <p className="text-[10px] text-[#55556a] text-center leading-relaxed">
          Conecte os blocos arrastando da alça direita para a esquerda do próximo bloco
        </p>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────

let nodeId = 10;
const nextId = () => `node_${nodeId++}`;

const initialNodes: Node[] = [
  {
    id: "node_1",
    type: "produto",
    position: { x: 80, y: 200 },
    data: { type: "produto", label: "Produto", category: "Moda", bgColor: "#ffffff" } as BlockData,
  },
];

export default function TikTokCanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [rfInstance, setRfInstance] = useState<any>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [userCredits, setUserCredits] = useState<number>(50);

  useEffect(() => {
    try {
      const sb = (window as any).__supabase;
      if (sb) {
        sb.auth.getUser().then(({ data }: any) => {
          if (data?.user) {
            fetch(`https://clipforge-6yzz.onrender.com/credits/${data.user.id}`)
              .then(r => r.json())
              .then(d => { if (d.balance !== undefined) setUserCredits(d.balance); })
              .catch(() => {});
          }
        });
      }
    } catch {}
  }, []);

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: "#7c6df5", strokeWidth: 2 } }, eds)),
    [setEdges]
  );

  function addNode(type: BlockType, position?: { x: number; y: number }) {
    const id = nextId();
    const pos = position || { x: 300 + Math.random() * 200, y: 100 + Math.random() * 300 };
    const newNode: Node = {
      id,
      type,
      position: pos,
      data: {
        type,
        label: BLOCK_CONFIG[type].label,
        duration: "30s",
        tone: "Animado",
        format: "9:16",
        quality: "HD 1080p",
        language: "pt-br",
        avatarStyle: "UGC unboxing",
        status: "idle",
      } as BlockData,
    };
    setNodes(nds => [...nds, newNode]);
    setSelectedNodeId(id);
  }

  function updateNodeData(id: string, patch: Partial<BlockData>) {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
  }

  // Injeta onConfigure em cada node
  const API = "https://clipforge-6yzz.onrender.com";

  const VOICE_IDS: Record<string, string> = {
    "pt-br": "6872a840c4194f42a7f8ce0aee47660c", // Pedro Lima - Friendly
    "en": "en-US-JennyNeural",
    "es": "es-ES-ElviraNeural",
  };

  async function handleGerarTodos() {
    // Encontra todos os blocos Gerar conectados
    const gerarNodes = nodes.filter(n => n.data.type === "gerar");
    if (gerarNodes.length === 0) {
      alert("Adicione pelo menos um bloco Gerar ao canvas!");
      return;
    }

    for (const gerarNode of gerarNodes) {
      // Busca os blocos conectados a este Gerar
      const connectedEdges = edges.filter(e => e.target === gerarNode.id);
      let avatarId = "";
      let script = "";
      let voiceId = VOICE_IDS["pt-br"];
      let bgColor = "#ffffff";

      for (const edge of connectedEdges) {
        const sourceNode = nodes.find(n => n.id === edge.source);
        if (!sourceNode) continue;
        if (sourceNode.data.type === "copy") {
          script = (sourceNode.data.script as string) || "";
        }
        if (sourceNode.data.type === "avatar") {
          avatarId = (sourceNode.data.avatarId as string) || "";
          const lang = (sourceNode.data.language as string) || "pt-br";
          // Usa a voz escolhida pelo usuário, ou o padrão por idioma
          voiceId = (sourceNode.data as any).voiceId || VOICE_IDS[lang] || VOICE_IDS["pt-br"];
        }
        if (sourceNode.data.type === "cenario") {
          bgColor = (sourceNode.data.bgColor as string) || "#ffffff";
        }
        // Busca indiretamente via avatar -> produto
        const indirectEdges = edges.filter(e => e.target === sourceNode.id);
        for (const ie of indirectEdges) {
          const upstreamNode = nodes.find(n => n.id === ie.source);
          if (!upstreamNode) continue;
          if (upstreamNode.data.type === "avatar") avatarId = (upstreamNode.data.avatarId as string) || "";
          if (upstreamNode.data.type === "copy") script = (upstreamNode.data.script as string) || "";
        }
      }

      if (!avatarId || !script) {
        alert(`Bloco Gerar precisa estar conectado a um Avatar e uma Copy com script!`);
        continue;
      }

      // Marca como gerando
      setNodes(nds => nds.map(n => n.id === gerarNode.id
        ? { ...n, data: { ...n.data, status: "generating", progress: 10 } }
        : n
      ));

      try {
        // Chama HeyGen para gerar vídeo
        const res = await fetch(`${API}/heygen/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            avatar_id: avatarId,
            script,
            voice_id: voiceId,
            background_color: bgColor,
            width: (gerarNode.data.format as string) === "16:9" ? 1920 : 1080,
            height: (gerarNode.data.format as string) === "16:9" ? 1080 : 1920,
          }),
        });

        if (!res.ok) throw new Error("Erro ao iniciar geração");
        const data = await res.json();
        const videoId = data.video_id;

        setNodes(nds => nds.map(n => n.id === gerarNode.id
          ? { ...n, data: { ...n.data, status: "generating", progress: 30, videoId } }
          : n
        ));

        // Polling do status
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await fetch(`${API}/heygen/status/${videoId}`);
            const statusData = await statusRes.json();

            const progress = Math.min(30 + attempts * 5, 90);
            setNodes(nds => nds.map(n => n.id === gerarNode.id
              ? { ...n, data: { ...n.data, progress } }
              : n
            ));

            if (statusData.status === "completed") {
              clearInterval(poll);
              setNodes(nds => nds.map(n => n.id === gerarNode.id
                ? { ...n, data: { ...n.data, status: "done", progress: 100, videoUrl: statusData.video_url } }
                : n
              ));
            } else if (statusData.status === "failed" || attempts > 60) {
              clearInterval(poll);
              setNodes(nds => nds.map(n => n.id === gerarNode.id
                ? { ...n, data: { ...n.data, status: "idle", progress: 0 } }
                : n
              ));
              alert("Falha na geração do vídeo. Tente novamente.");
            }
          } catch { clearInterval(poll); }
        }, 5000);

      } catch (e) {
        setNodes(nds => nds.map(n => n.id === gerarNode.id
          ? { ...n, data: { ...n.data, status: "idle", progress: 0 } }
          : n
        ));
        alert("Erro ao gerar vídeo. Verifique as conexões dos blocos.");
      }
    }
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
        .react-flow__handle { transition: transform 0.15s, box-shadow 0.15s; }
        .react-flow__handle:hover { transform: scale(1.6) !important; box-shadow: 0 0 0 4px rgba(124,109,245,0.3); }
        .react-flow__handle-right { right: -8px !important; }
        .react-flow__handle-left { left: -8px !important; }
        .react-flow__handle::after {
          content: '';
          position: absolute;
          inset: -8px;
          border-radius: 50%;
        }
        /* Remove scrollbar estranho */
        .react-flow__pane::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Topbar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 z-50"
        style={{ background: "rgba(11,11,17,0.99)", borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9090a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12a4 4 0 100 8 4 4 0 000-8zM15 2v10M15 2a4 4 0 004 4"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-[#f0f0f5]">Canvas TikTok Shop</p>
            <p className="text-[10px] text-[#55556a]">Arraste blocos e conecte para criar seus vídeos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-[#9090a8] px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span className="font-semibold text-[#f0f0f5]">{userCredits.toLocaleString()}</span> créditos
          </div>
          <button type="button"
            className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-semibold cursor-pointer border-none transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff", boxShadow: "0 4px 14px rgba(124,109,245,0.4)" }}
            onClick={handleGerarTodos}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            Gerar todos
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative overflow-hidden" ref={reactFlowWrapper}
        style={{ height: "calc(100vh - 112px)" }}
        onDrop={handleDrop} onDragOver={e => e.preventDefault()}>

        <BlockSidebar onAdd={addNode} />

        <div style={{ marginLeft: "224px", marginRight: selectedNode ? "320px" : "0", height: "100%" }}>
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
            onNodesDelete={() => {}}
            fitView
            style={{ background: "#0a0a10" }}
            defaultEdgeOptions={{ animated: true, style: { stroke: "#7c6df5", strokeWidth: 2 } }}
            proOptions={{ hideAttribution: true }}
          >
            <Background 
              variant={BackgroundVariant.Dots}
              gap={16}
              size={1}
              color="#c8c8d0"
              style={{ background: "#f5f5f7" }}
            />
            <Controls style={{ background: "rgba(14,14,20,0.95)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: "10px" }} />
            <MiniMap style={{ background: "rgba(14,14,20,0.95)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: "10px" }} nodeColor={() => "#7c6df5"} />
            <Panel position="top-right" style={{ marginRight: "12px", marginTop: "12px" }}>
              <div className="text-[10px] text-[#55556a] px-3 py-2 rounded-lg"
                style={{ background: "rgba(14,14,20,0.95)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                {nodes.length} bloco{nodes.length !== 1 ? "s" : ""} · {edges.length} conexõe{edges.length !== 1 ? "s" : ""}
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Painel de configuração */}
        {selectedNode && (
          <ConfigPanel
            node={selectedNode as Node<BlockData>}
            onUpdate={updateNodeData}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
}
