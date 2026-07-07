"use client";

// ─────────────────────────────────────────────────────────────
// frontend/app/tiktok/canvas.tsx
// Canvas visual TikTok Shop — React Flow com blocos arrastáveis
// ─────────────────────────────────────────────────────────────
// ARQUITETURA NOVA (Seedance 2.0 via Replicate):
// Produto (foto) + Avatar (foto da persona) + Cenário (texto da cena)
// + Copy (script/fala) → tudo isso vira UM prompt só, mandado pro
// /seedance/generate. Não tem mais Kling (vídeo de fundo separado)
// nem HeyGen (avatar falando separado) — o Seedance gera cena +
// produto na mão + avatar falando com lip-sync, tudo numa chamada.

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
  // cenario — agora é só descrição de texto da cena (Seedance gera tudo)
  scenePrompt?: string;
  // avatar — foto de persona é OPCIONAL (Seedance gera a pessoa
  // inteira a partir da descrição em texto, testado e confirmado
  // funcionando sem nenhuma imagem de rosto)
  personaImageUrl?: string;
  personaDescription?: string;
  personaName?: string;
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
  videoUrl?: string;
}

// ── Cores e ícones por tipo ───────────────────────────────────

const BLOCK_CONFIG: Record<BlockType, { color: string; bg: string; icon: string; label: string; desc: string }> = {
  produto:  { color: "#a99cf8", bg: "rgba(124,109,245,0.12)", icon: "🛍️", label: "Produto",  desc: "Imagem + nome" },
  cenario:  { color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  icon: "🎬", label: "Cenário",  desc: "Descreva a cena" },
  avatar:   { color: "#3ecf8e", bg: "rgba(62,207,142,0.12)",  icon: "🧑‍🎤", label: "Avatar",   desc: "Foto da persona" },
  copy:     { color: "#f87171", bg: "rgba(248,113,113,0.12)", icon: "✍️", label: "Copy",     desc: "O que falar" },
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

// ── Nó: Cenário (agora é só texto — Seedance gera a cena) ──────

function CenarioNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <BaseBlock type="cenario" selected={!!selected} onConfigure={() => (data as any).onConfigure?.()} onDelete={() => (data as any).onDelete?.()}>
        {d.scenePrompt ? (
          <div>
            <p className="text-xs text-[#9090a8] leading-relaxed line-clamp-3">{d.scenePrompt}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-3 gap-1.5">
            <div className="text-2xl">🎬</div>
            <p className="text-xs text-[#55556a]">Duplo clique para descrever a cena</p>
          </div>
        )}
      </BaseBlock>
    </>
  );
}

// ── Nó: Avatar (foto de persona, não mais HeyGen) ──────────────

function AvatarNode({ data, selected }: NodeProps) {
  const d = data as BlockData;
  return (
    <>
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <BaseBlock type="avatar" selected={!!selected} onConfigure={() => (data as any).onConfigure?.()} onDelete={() => (data as any).onDelete?.()}>
        {d.personaImageUrl ? (
          <div className="flex items-center gap-2.5">
            <img src={d.personaImageUrl} className="w-10 h-10 rounded-full object-cover flex-shrink-0"
              style={{ border: "0.5px solid rgba(62,207,142,0.3)" }} alt="" />
            <div>
              <p className="text-xs font-medium text-[#f0f0f5]">{d.personaName || "Persona"}</p>
              <p className="text-[10px] text-[#55556a]">{d.avatarStyle || "Estilo não definido"}</p>
            </div>
          </div>
        ) : d.personaDescription ? (
          <div>
            <p className="text-xs text-[#9090a8] leading-relaxed line-clamp-3">{d.personaDescription}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-3 gap-1.5">
            <div className="text-2xl">🧑‍🎤</div>
            <p className="text-xs text-[#55556a]">Duplo clique para descrever a persona</p>
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
                {d.duration || "10s"}
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
            {d.videoUrl && (
              <video src={d.videoUrl} className="w-full rounded-lg" style={{ maxHeight: "140px" }} controls muted />
            )}
            {d.videoUrl && (
              <a href={d.videoUrl} target="_blank" rel="noopener noreferrer" download
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

// ── Painel de Cenário (agora só texto) ─────────────────────────

function CenarioPicker({ node, update }: { node: Node<BlockData>; update: (patch: Partial<BlockData>) => void }) {
  const TEMPLATES = [
    { label: "🏋️ Academia lotada", prompt: "dentro de uma academia lotada, equipamentos ao fundo, iluminação quente, câmera na altura do peito" },
    { label: "🏢 Estúdio clean", prompt: "em um estúdio de fotografia com fundo branco, iluminação suave e profissional" },
    { label: "🌆 Rua urbana", prompt: "em uma rua movimentada da cidade durante o entardecer, luzes de fundo desfocadas" },
    { label: "🏖️ Praia", prompt: "em uma praia ao pôr do sol, tons quentes, atmosfera serena" },
    { label: "🏠 Sala de estar", prompt: "em uma sala de estar aconchegante, decoração moderna, luz natural pela janela" },
    { label: "🍳 Cozinha", prompt: "em uma cozinha moderna e iluminada, bancada em destaque" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-2">Templates rápidos</label>
        <div className="grid grid-cols-1 gap-1.5">
          {TEMPLATES.map(t => (
            <button key={t.label} type="button"
              onClick={() => update({ scenePrompt: t.prompt })}
              className="text-left px-2.5 py-2 rounded-[8px] text-[11px] cursor-pointer border-none transition-all"
              style={node.data.scenePrompt === t.prompt
                ? { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "0.5px solid rgba(245,158,11,0.4)" }
                : { background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Descreva a cena</label>
        <textarea
          value={node.data.scenePrompt || ""}
          onChange={e => update({ scenePrompt: e.target.value })}
          placeholder="Ex: dentro de uma academia lotada, câmera na altura do peito, iluminação quente..."
          rows={5}
          className="w-full px-3 py-2.5 rounded-[8px] text-xs resize-none outline-none placeholder-[#3a3a4a]"
          style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }}
        />
        <p className="text-[10px] text-[#55556a] mt-1">O Seedance 2.0 vai gerar essa cena inteira com o avatar segurando o produto e falando — não precisa gerar nada aqui antes, isso acontece tudo no bloco Gerar.</p>
      </div>
    </div>
  );
}

// ── Painel de Avatar (upload de foto de persona) ───────────────

function AvatarPicker({ node, update, onUpdate }: {
  node: Node<BlockData>;
  update: (patch: Partial<BlockData>) => void;
  onUpdate: (id: string, data: Partial<BlockData>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadPersona(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`https://clipforge-6yzz.onrender.com/storage/upload/product-image`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Erro no upload");
      const data = await res.json();
      onUpdate(node.id, { personaImageUrl: data.url } as any);
    } catch {
      const reader = new FileReader();
      reader.onload = ev => onUpdate(node.id, { personaImageUrl: ev.target?.result as string } as any);
      reader.readAsDataURL(file);
    } finally {
      setUploading(false);
    }
  }

  const PERSONA_TEMPLATES = [
    { label: "👩 Mulher, 30-40, fitness", text: "mulher com seus 38 anos, cabelo amarrado, corpo atlético, roupa de academia" },
    { label: "👨 Homem, 25-35, casual", text: "homem com seus 28 anos, barba curta, estilo casual, camiseta e jeans" },
    { label: "👩 Mulher, 20-30, aesthetic", text: "mulher com seus 24 anos, cabelo solto, estilo aesthetic, roupa casual elegante" },
    { label: "👨 Homem, 35-45, profissional", text: "homem com seus 40 anos, aparência profissional, camisa social" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[10px] px-3 py-2.5" style={{ background: "rgba(62,207,142,0.08)", border: "0.5px solid rgba(62,207,142,0.2)" }}>
        <p className="text-[11px] text-[#3ecf8e] leading-relaxed">
          ✨ Não precisa de foto — descreva a persona em texto (idade, cabelo, corpo, roupa) e o Seedance gera a pessoa inteira. Testado e funcionando sem imagem de rosto.
        </p>
      </div>

      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-2">Modelos rápidos</label>
        <div className="grid grid-cols-1 gap-1.5">
          {PERSONA_TEMPLATES.map(t => (
            <button key={t.label} type="button"
              onClick={() => update({ personaDescription: t.text })}
              className="text-left px-2.5 py-2 rounded-[8px] text-[11px] cursor-pointer border-none transition-all"
              style={node.data.personaDescription === t.text
                ? { background: "rgba(62,207,142,0.15)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.4)" }
                : { background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Descrição da persona</label>
        <textarea
          value={node.data.personaDescription || ""}
          onChange={e => update({ personaDescription: e.target.value })}
          placeholder="Ex: mulher com seus 38 anos, cabelo amarrado, corpo atlético, roupa de academia"
          rows={4}
          className="w-full px-3 py-2.5 rounded-[8px] text-xs resize-none outline-none placeholder-[#3a3a4a]"
          style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }}
        />
      </div>

      <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-2">Foto de referência (opcional)</label>
        <div
          onClick={() => fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) uploadPersona(file); }}
          onDragOver={e => e.preventDefault()}
          className="flex flex-col items-center justify-center rounded-xl cursor-pointer transition-all hover:border-[#3ecf8e]"
          style={{
            height: node.data.personaImageUrl ? "160px" : "90px",
            border: "1.5px dashed rgba(62,207,142,0.3)",
            background: "rgba(62,207,142,0.04)",
          }}>
          {node.data.personaImageUrl ? (
            <img src={node.data.personaImageUrl} className="w-full h-full object-contain rounded-xl" alt="" />
          ) : uploading ? (
            <>
              <div className="w-5 h-5 border-2 border-[#3ecf8e]/30 border-t-[#3ecf8e] rounded-full animate-spin mb-1.5" />
              <p className="text-xs text-[#9090a8]">Enviando...</p>
            </>
          ) : (
            <>
              <span className="text-xl mb-1">📷</span>
              <p className="text-[11px] text-[#9090a8]">Só se quiser preservar um rosto específico</p>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const file = e.target.files?.[0]; if (file) uploadPersona(file); }} />
        {node.data.personaImageUrl && (
          <button type="button" onClick={() => onUpdate(node.id, { personaImageUrl: "" } as any)}
            className="w-full mt-1.5 py-1.5 rounded-[6px] text-[10px] cursor-pointer border-none"
            style={{ background: "rgba(248,113,113,0.1)", color: "#f87171" }}>
            Remover foto (usar só descrição)
          </button>
        )}
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
          duration: node.data.duration || "10s",
          language: node.data.language || "pt-br",
        }),
      });
      if (!res.ok) throw new Error("Erro na API");
      const data = await res.json();
      update({ script: data.script });
    } catch (e) {
      const fallbacks: Record<string, string> = {
        "UGC unboxing": `Gente, esse ${node.data.productName || "produto"} chegou e eu precisei mostrar pra vocês! Qualidade incrível — aprovado! Corre no link da bio!`,
        "Review": `Testei o ${node.data.productName || "produto"} por uma semana. Qualidade 10/10, entrega rápida. Altamente recomendo! Link na bio.`,
        "Tutorial": `Vou te mostrar como usar o ${node.data.productName || "produto"} em 3 passos simples. Pegue o seu no link da bio!`,
        "Oferta relâmpago": `Só até hoje! ${node.data.productName || "Produto"} com desconto especial. Estoque limitado — link na bio!`,
      };
      update({ script: fallbacks[node.data.avatarStyle || ""] || `Confira o incrível ${node.data.productName || "produto"}! Link na bio!` });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="absolute top-0 right-0 h-full w-80 flex flex-col z-50 overflow-hidden"
      style={{ background: "rgba(11,11,17,0.99)", borderLeft: "0.5px solid rgba(255,255,255,0.08)" }}>

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

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

        {type === "produto" && (
          <>
            <div>
              <label className="text-xs font-medium text-[#9090a8] block mb-2">Foto do produto</label>
              <div
                onClick={() => fileRef.current?.click()}
                onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) uploadImage(file); }}
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
                onChange={e => { const file = e.target.files?.[0]; if (file) uploadImage(file); }} />
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

        {type === "cenario" && (
          <CenarioPicker node={node} update={update} />
        )}

        {type === "avatar" && (
          <AvatarPicker node={node} update={update} onUpdate={onUpdate} />
        )}

        {type === "copy" && (
          <>
            <div>
              <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Duração</label>
              <div className="flex gap-2">
                {["5s", "10s", "15s"].map(d => (
                  <button key={d} type="button" onClick={() => update({ duration: d })}
                    className="flex-1 py-2 rounded-[8px] text-xs font-bold cursor-pointer border-none"
                    style={node.data.duration === d
                      ? { background: "rgba(248,113,113,0.2)", color: "#f87171", border: "0.5px solid rgba(248,113,113,0.4)" }
                      : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                    {d}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[#55556a] mt-1">O Seedance 2.0 aceita de 4 a 15 segundos por geração.</p>
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
                <label className="text-xs font-medium text-[#9090a8]">Script (o que o avatar vai falar)</label>
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
              <p className="text-[10px] text-[#55556a] mt-1">Esse texto vai entrar entre aspas no prompt do Seedance — é literalmente a fala do avatar no vídeo.</p>
            </div>
          </>
        )}

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
                {["720p", "1080p"].map(q => (
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
          </>
        )}
      </div>

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
    <div className="absolute top-1/2 left-3 -translate-y-1/2 flex flex-col gap-2 z-50">
      {(Object.entries(BLOCK_CONFIG) as [BlockType, typeof BLOCK_CONFIG[BlockType]][]).map(([type, cfg]) => (
        <button
          key={type}
          type="button"
          onClick={() => onAdd(type)}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg cursor-pointer border-none transition-all hover:scale-110 active:scale-95"
          style={{ background: cfg.bg, border: `0.5px solid ${cfg.color}44`, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
          title={`Adicionar ${cfg.label} — ${cfg.desc}`}
          draggable
          onDragStart={e => e.dataTransfer.setData("blockType", type)}
        >
          {cfg.icon}
        </button>
      ))}
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
    data: { type: "produto", label: "Produto", category: "Moda" } as BlockData,
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
        duration: "10s",
        tone: "Animado",
        format: "9:16",
        quality: "720p",
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

  const API = "https://clipforge-6yzz.onrender.com";

  const [creditModal, setCreditModal] = useState<{ needed: number; have: number } | null>(null);

  const CREDIT_COST: Record<string, number> = {
    "5s": 8, "10s": 15, "15s": 20,
  };

  async function handleGerarTodos() {
    const gerarNodes = nodes.filter(n => n.data.type === "gerar");
    if (gerarNodes.length === 0) {
      alert("Adicione pelo menos um bloco Gerar ao canvas!");
      return;
    }

    let totalCredits = 0;
    for (const gerarNode of gerarNodes) {
      const connectedEdges = edges.filter(e => e.target === gerarNode.id);
      let duration = "10s";
      for (const edge of connectedEdges) {
        const source = nodes.find(n => n.id === edge.source);
        if (source?.data.type === "copy" && source.data.duration) duration = source.data.duration as string;
        const indirect = edges.filter(e => e.target === source?.id);
        for (const ie of indirect) {
          const up = nodes.find(n => n.id === ie.source);
          if (up?.data.type === "copy" && up.data.duration) duration = up.data.duration as string;
        }
      }
      totalCredits += CREDIT_COST[duration] || 15;
    }

    if (totalCredits > userCredits) {
      setCreditModal({ needed: totalCredits, have: userCredits });
      return;
    }

    const confirmed = window.confirm(
      `Gerar ${gerarNodes.length} vídeo${gerarNodes.length > 1 ? "s" : ""}?\n\nCusto: ${totalCredits} créditos\nSaldo atual: ${userCredits} créditos\nSaldo após: ${userCredits - totalCredits} créditos`
    );
    if (!confirmed) return;

    for (const gerarNode of gerarNodes) {
      const connectedEdges = edges.filter(e => e.target === gerarNode.id);
      let productImageUrl = "";
      let personaImageUrl = "";
      let personaDescription = "";
      let scenePrompt = "";
      let dialogue = "";
      let duration = "10";

      for (const edge of connectedEdges) {
        const sourceNode = nodes.find(n => n.id === edge.source);
        if (!sourceNode) continue;
        if (sourceNode.data.type === "copy") {
          dialogue = (sourceNode.data.script as string) || "";
          duration = ((sourceNode.data.duration as string) || "10s").replace("s", "");
        }
        if (sourceNode.data.type === "avatar") {
          personaImageUrl = (sourceNode.data as any).personaImageUrl || "";
          personaDescription = (sourceNode.data as any).personaDescription || "";
        }
        if (sourceNode.data.type === "cenario") {
          scenePrompt = (sourceNode.data as any).scenePrompt || "";
        }
        // Busca indiretamente (produto -> avatar -> copy -> cenario encadeados)
        const indirectEdges = edges.filter(e => e.target === sourceNode.id);
        for (const ie of indirectEdges) {
          const upstreamNode = nodes.find(n => n.id === ie.source);
          if (!upstreamNode) continue;
          if (upstreamNode.data.type === "produto") productImageUrl = (upstreamNode.data.image as string) || "";
          if (upstreamNode.data.type === "avatar") {
            personaImageUrl = (upstreamNode.data as any).personaImageUrl || "";
            personaDescription = (upstreamNode.data as any).personaDescription || "";
          }
          if (upstreamNode.data.type === "cenario") scenePrompt = (upstreamNode.data as any).scenePrompt || "";
          if (upstreamNode.data.type === "copy") dialogue = (upstreamNode.data.script as string) || "";

          // mais um nível pra trás (produto conectado no avatar, avatar no cenario, etc)
          const deeperEdges = edges.filter(e => e.target === upstreamNode.id);
          for (const de of deeperEdges) {
            const deepNode = nodes.find(n => n.id === de.source);
            if (!deepNode) continue;
            if (deepNode.data.type === "produto") productImageUrl = (deepNode.data.image as string) || "";
          }
        }
      }

      if (!productImageUrl || !dialogue) {
        alert("Bloco Gerar precisa estar conectado (direta ou indiretamente) a um Produto com foto e uma Copy com script!");
        continue;
      }
      if (!personaImageUrl && !personaDescription) {
        alert("Bloco Avatar precisa ter uma foto OU uma descrição da persona preenchida!");
        continue;
      }

      setNodes(nds => nds.map(n => n.id === gerarNode.id
        ? { ...n, data: { ...n.data, status: "generating", progress: 10 } }
        : n
      ));

      try {
        const res = await fetch(`${API}/seedance/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_image_url: productImageUrl,
            persona_image_url: personaImageUrl || null,
            persona_description: personaDescription || null,
            scene_prompt: scenePrompt || "fundo neutro, iluminação profissional",
            dialogue,
            aspect_ratio: (gerarNode.data.format as string) || "9:16",
            duration,
            resolution: (gerarNode.data.quality as string) || "720p",
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Erro ao iniciar geração");
        }
        const data = await res.json();
        const taskId = data.task_id;

        setNodes(nds => nds.map(n => n.id === gerarNode.id
          ? { ...n, data: { ...n.data, status: "generating", progress: 25 } }
          : n
        ));

        // Polling — Seedance costuma levar de 1 a 3 min pra 10-15s de vídeo
        let attempts = 0;
        const maxAttempts = 60; // ~5 minutos de margem
        const poll = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await fetch(`${API}/seedance/status/${taskId}`);
            const statusData = await statusRes.json();

            const progress = Math.min(25 + attempts * 3, 95);
            setNodes(nds => nds.map(n => n.id === gerarNode.id
              ? { ...n, data: { ...n.data, progress } }
              : n
            ));

            if (statusData.status === "done") {
              clearInterval(poll);
              setNodes(nds => nds.map(n => n.id === gerarNode.id
                ? { ...n, data: { ...n.data, status: "done", progress: 100, videoUrl: statusData.video_url } }
                : n
              ));
            } else if (statusData.status === "error" || attempts > maxAttempts) {
              clearInterval(poll);
              setNodes(nds => nds.map(n => n.id === gerarNode.id
                ? { ...n, data: { ...n.data, status: "idle", progress: 0 } }
                : n
              ));
              alert(`Falha na geração do vídeo: ${statusData.error || "timeout"}`);
            }
          } catch { clearInterval(poll); }
        }, 5000);

      } catch (e: any) {
        setNodes(nds => nds.map(n => n.id === gerarNode.id
          ? { ...n, data: { ...n.data, status: "idle", progress: 0 } }
          : n
        ));
        alert(`Erro ao gerar vídeo: ${e.message}`);
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
        .react-flow__handle::after { content: ''; position: absolute; inset: -8px; border-radius: 50%; }
        .react-flow__pane::-webkit-scrollbar { display: none; }
      `}</style>

      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 z-50"
        style={{ background: "rgba(11,11,17,0.99)", borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-3">
          <a href="/dashboard"
            className="w-7 h-7 rounded-lg flex items-center justify-center no-underline transition-all hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.08)", border: "0.5px solid rgba(255,255,255,0.1)" }}
            title="Voltar ao Dashboard">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9090a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </a>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9090a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-[#f0f0f5]">Criativo de Produto</p>
            <p className="text-[10px] text-[#55556a]">TikTok Shop · Facebook Ads · Kwai · Instagram · YouTube Shorts</p>
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
              Seus vídeos precisam de <strong className="text-[#f87171]">{creditModal.needed} créditos</strong> mas você tem apenas <strong className="text-[#f0f0f5]">{creditModal.have} créditos</strong> disponíveis.
            </p>
            <div className="rounded-[10px] p-4 mb-5" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
              <div className="flex justify-between text-[12px] mb-2">
                <span className="text-[#55556a]">Necessário</span>
                <span className="text-[#f87171] font-semibold">{creditModal.needed} créditos</span>
              </div>
              <div className="flex justify-between text-[12px] mb-2">
                <span className="text-[#55556a]">Disponível</span>
                <span className="text-[#f0f0f5] font-semibold">{creditModal.have} créditos</span>
              </div>
              <div className="h-px my-2" style={{ background: "rgba(255,255,255,0.07)" }} />
              <div className="flex justify-between text-[12px]">
                <span className="text-[#55556a]">Faltam</span>
                <span className="text-[#f87171] font-bold">{creditModal.needed - creditModal.have} créditos</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <a href="/dashboard/settings"
                className="w-full h-11 rounded-[10px] text-sm font-semibold flex items-center justify-center gap-2 no-underline"
                style={{ background: "#7c6df5", color: "#fff" }}>
                ⚡ Ver planos e adicionar créditos
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

      <div className="flex-1 relative overflow-hidden" ref={reactFlowWrapper}
        style={{ height: "calc(100vh - 112px)" }}
        onDrop={handleDrop} onDragOver={e => e.preventDefault()}>

        <BlockSidebar onAdd={addNode} />

        <div style={{ marginLeft: "64px", marginRight: selectedNode ? "320px" : "0", height: "100%" }}>
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
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#c8c8d0" style={{ background: "#f5f5f7" }} />
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
