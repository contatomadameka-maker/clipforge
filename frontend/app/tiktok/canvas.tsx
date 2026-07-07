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
  duration?: string; // "5" | "10" | "15"
  aspectRatio?: string;
  resolution?: string;
  avatarStyle?: string;
  // resultado
  status?: "processing" | "done" | "error";
  progress?: number;
  videoUrl?: string;
  errorMsg?: string;
}

const ROLE_CONFIG: Record<MidiaRole, { color: string; icon: string; label: string }> = {
  produto:  { color: "#a99cf8", icon: "🛍️", label: "Produto" },
  persona:  { color: "#3ecf8e", icon: "🧑‍🎤", label: "Persona" },
};

const GERADOR_TIPOS: Record<string, { label: string; desc: string; credits: number }> = {
  video_produto: { label: "Vídeo de Produto", desc: "Produto + persona (foto ou texto) + cena + fala, tudo em 1 geração", credits: 60 },
};

const CREDIT_COST: Record<string, number> = { "5": 30, "10": 60, "15": 90 };

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
  const cost = CREDIT_COST[dur] || 60;

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
            ✨
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
          {d.scenePrompt ? (
            <p className="text-[11px] text-[#9090a8] line-clamp-2">🎬 {d.scenePrompt}</p>
          ) : (
            <p className="text-[11px] text-[#55556a] italic">Duplo clique para configurar cena e fala</p>
          )}
          {d.dialogue && (
            <p className="text-[11px] text-[#9090a8] line-clamp-2">💬 "{d.dialogue}"</p>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "#9090a8" }}>{dur}s</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "#9090a8" }}>{d.aspectRatio || "9:16"}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "#9090a8" }}>{d.resolution || "720p"}</span>
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

// ── Nó: Resultado ────────────────────────────────────────────────

function ResultadoNode({ data }: NodeProps) {
  const d = data as BlockData;
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
                <span className="text-[10px] text-[#9090a8]">Criando algo incrível...</span>
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
              <a href={d.videoUrl} target="_blank" rel="noopener noreferrer" download
                className="flex items-center justify-center gap-1.5 py-1.5 rounded-[6px] text-[10px] font-medium no-underline"
                style={{ background: "rgba(62,207,142,0.15)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.3)" }}>
                ⬇️ Baixar vídeo
              </a>
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

function MidiaPanel({ node, update, onUpdate }: { node: Node<BlockData>; update: (p: Partial<BlockData>) => void; onUpdate: (id: string, p: Partial<BlockData>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
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
        <div onClick={() => fileRef.current?.click()}
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
              <p className="text-xs text-[#9090a8]">Arraste ou clique para enviar</p>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
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
  const [promptMode, setPromptMode] = useState<"auto" | "avancado">("auto");
  const [generating, setGenerating] = useState(false);

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
        <div className="rounded-[8px] px-3 py-2.5 flex items-center justify-between" style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }}>
          <span className="text-sm text-[#f0f0f5]">Vídeo de Produto</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>{CREDIT_COST[node.data.duration || "10"] || 60} cr</span>
        </div>
        <p className="text-[10px] text-[#55556a] mt-1">Conecte um bloco Mídia (Produto) ao Gerador. Persona é opcional — se não conectar foto, descreva em texto abaixo.</p>
      </div>

      <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

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

      <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

      <div>
        <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Duração: {node.data.duration || "10"}s ({CREDIT_COST[node.data.duration || "10"]} cr)</label>
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
          {["720p", "1080p"].map(q => (
            <button key={q} type="button" onClick={() => update({ resolution: q })}
              className="flex-1 py-2 rounded-[8px] text-xs font-semibold cursor-pointer border-none"
              style={node.data.resolution === q ? { background: "rgba(96,165,250,0.2)", color: "#60a5fa", border: "0.5px solid rgba(96,165,250,0.4)" } : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
              {q}
            </button>
          ))}
        </div>
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

// ── Modal "Adicionar Componente" ────────────────────────────────

function AddComponentModal({ onAdd, onClose }: { onAdd: (type: BlockType, role?: MidiaRole) => void; onClose: () => void }) {
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
            <button onClick={() => onAdd("gerador")} className="text-left px-4 py-3 rounded-[10px] cursor-pointer border-none flex items-center justify-between" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
              <div><p className="text-sm font-medium text-[#f0f0f5]">✨ Vídeo de Produto</p><p className="text-[11px] text-[#55556a]">Produto + persona + cena + fala → vídeo com áudio nativo</p></div>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>60 cr</span>
            </button>
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
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [userCredits, setUserCredits] = useState<number>(50);
  const [creditModal, setCreditModal] = useState<{ needed: number; have: number } | null>(null);

  useEffect(() => {
    try {
      const sb = (window as any).__supabase;
      if (sb) {
        sb.auth.getUser().then(({ data }: any) => {
          if (data?.user) {
            fetch(`${API}/credits/${data.user.id}`).then(r => r.json()).then(d => { if (d.balance !== undefined) setUserCredits(d.balance); }).catch(() => {});
          }
        });
      }
    } catch {}
  }, []);

  const onConnect = useCallback((params: Connection) => setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: "#7c6df5", strokeWidth: 2 } }, eds)), [setEdges]);

  function addNode(type: BlockType, role?: MidiaRole, position?: { x: number; y: number }) {
    const id = nextId();
    const pos = position || { x: 300 + Math.random() * 200, y: 100 + Math.random() * 300 };
    const base: BlockData = { type, label: type };
    if (type === "midia") { base.role = role; }
    if (type === "gerador") { base.tipo = "video_produto"; base.duration = "10"; base.aspectRatio = "9:16"; base.resolution = "720p"; }
    setNodes(nds => [...nds, { id, type, position: pos, data: base }]);
    setSelectedNodeId(id);
    setShowAddModal(false);
  }

  function updateNodeData(id: string, patch: Partial<BlockData>) {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
  }

  async function handleGenerate(geradorId: string) {
    const geradorNode = nodes.find(n => n.id === geradorId);
    if (!geradorNode) return;

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
    const scenePrompt = (geradorNode.data.scenePrompt as string) || "";
    const dialogue = (geradorNode.data.dialogue as string) || "";
    const duration = (geradorNode.data.duration as string) || "10";
    const cost = CREDIT_COST[duration] || 60;

    if (!productImageUrl) { alert("Conecte um bloco Mídia (Produto) ao Gerador!"); return; }
    if (!dialogue) { alert("Preencha a fala do avatar no Gerador!"); return; }
    if (!personaImageUrl && !personaDescription) { alert("Conecte uma foto de Persona OU descreva a persona em texto no Gerador!"); return; }

    if (cost > userCredits) { setCreditModal({ needed: cost, have: userCredits }); return; }
    if (!window.confirm(`Gerar vídeo por ${cost} créditos?\nSaldo atual: ${userCredits}\nSaldo após: ${userCredits - cost}`)) return;

    // Cria o nó Resultado conectado
    const resultId = nextId();
    const resultPos = { x: geradorNode.position.x + 320, y: geradorNode.position.y };
    setNodes(nds => [...nds, { id: resultId, type: "resultado", position: resultPos, data: { type: "resultado", label: "Resultado", status: "processing", progress: 10 } }]);
    setEdges(eds => addEdge({ id: `e-${geradorId}-${resultId}`, source: geradorId, target: resultId, animated: true, style: { stroke: "#7c6df5", strokeWidth: 2 } }, eds));

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
          aspect_ratio: (geradorNode.data.aspectRatio as string) || "9:16",
          duration,
          resolution: (geradorNode.data.resolution as string) || "720p",
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || "Erro ao iniciar geração"); }
      const data = await res.json();
      const taskId = data.task_id;

      updateNodeData(resultId, { progress: 25 });

      let attempts = 0;
      const maxAttempts = 60;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await fetch(`${API}/seedance/status/${taskId}`);
          const statusData = await statusRes.json();
          updateNodeData(resultId, { progress: Math.min(25 + attempts * 3, 95) });

          if (statusData.status === "done") {
            clearInterval(poll);
            updateNodeData(resultId, { status: "done", progress: 100, videoUrl: statusData.video_url });
          } else if (statusData.status === "error" || attempts > maxAttempts) {
            clearInterval(poll);
            updateNodeData(resultId, { status: "error", errorMsg: statusData.error || "Timeout aguardando geração" });
          }
        } catch { clearInterval(poll); }
      }, 5000);
    } catch (e: any) {
      updateNodeData(resultId, { status: "error", errorMsg: e.message });
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
          <div><p className="text-sm font-bold text-[#f0f0f5]">Criativo de Produto</p><p className="text-[10px] text-[#55556a]">TikTok Shop · Facebook Ads · Kwai · Instagram</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowLibrary(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer border-none" style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
            📁 Biblioteca
          </button>
          <div className="flex items-center gap-1.5 text-xs text-[#9090a8] px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
            <span className="font-semibold text-[#f0f0f5]">{userCredits.toLocaleString()}</span> créditos
          </div>
          <button type="button" onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-sm font-semibold cursor-pointer border-none"
            style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff", boxShadow: "0 4px 14px rgba(124,109,245,0.4)" }}>
            + Adicionar
          </button>
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

      {showAddModal && <AddComponentModal onAdd={(type, role) => addNode(type, role)} onClose={() => setShowAddModal(false)} />}

      <div className="flex-1 relative overflow-hidden" ref={reactFlowWrapper} style={{ height: "calc(100vh - 112px)" }} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
        <div style={{ marginRight: (selectedNode || showLibrary) ? "288px" : "0", height: "100%" }}>
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
