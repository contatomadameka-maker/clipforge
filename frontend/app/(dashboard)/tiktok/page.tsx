"use client";

// ─────────────────────────────────────────────────────────────
// frontend/app/(dashboard)/tiktok/page.tsx
// ClipForge TikTok Shop — canvas de 4 blocos sequenciais
// Produto → Avatar → Script → Gerar
// ─────────────────────────────────────────────────────────────

import { useState, useRef } from "react";

// ── Tipos ─────────────────────────────────────────────────────

type BlockId = 1 | 2 | 3 | 4;
type VideoStyle = "ugc" | "review" | "tutorial" | "flash";
type VideoFormat = "9:16" | "1:1" | "16:9";
type VideoDuration = "15" | "30" | "45" | "60";

interface Avatar {
  id: string;
  name: string;
  emoji: string;
  lang: string[];
}

// ── Dados mock ────────────────────────────────────────────────

const avatars: Avatar[] = [
  { id: "a1", name: "Ana", emoji: "👩🏽", lang: ["PT-BR", "EN"] },
  { id: "a2", name: "Carlos", emoji: "👨🏻", lang: ["PT-BR", "ES"] },
  { id: "a3", name: "Bianca", emoji: "👩🏻‍🦱", lang: ["PT-BR"] },
  { id: "a4", name: "Lucas", emoji: "👨🏾", lang: ["PT-BR", "EN"] },
  { id: "a5", name: "Mel", emoji: "👩🏼", lang: ["PT-BR", "EN", "ES"] },
  { id: "a6", name: "Diego", emoji: "👨🏽‍🦲", lang: ["PT-BR"] },
];

const styleLabels: Record<VideoStyle, string> = {
  ugc: "UGC Unboxing",
  review: "Review entusiasta",
  tutorial: "Tutorial",
  flash: "Oferta relâmpago",
};

const creditCost: Record<VideoDuration, number> = {
  "15": 8,
  "30": 15,
  "45": 20,
  "60": 25,
};

// ── Bloco header ──────────────────────────────────────────────

function BlockHeader({
  number,
  title,
  desc,
  active,
  done,
}: {
  number: number;
  title: string;
  desc: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0
        ${done ? "bg-green text-white" : active ? "bg-purple text-white" : "bg-surface-3 text-text-3 border border-border"}`}>
        {done ? (
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : number}
      </div>
      <div>
        <h2 className={`text-[14px] font-semibold ${active ? "text-text" : done ? "text-text" : "text-text-3"}`}>
          {title}
        </h2>
        <p className="text-[11px] text-text-3">{desc}</p>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function TikTokPage() {
  const [activeBlock, setActiveBlock] = useState<BlockId>(1);

  // Bloco 1 — Produto
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("fashion");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [productImage, setProductImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Bloco 2 — Avatar
  const [selectedAvatar, setSelectedAvatar] = useState<string>("a1");
  const [avatarPosition, setAvatarPosition] = useState("side");
  const [videoStyle, setVideoStyle] = useState<VideoStyle>("review");
  const [language, setLanguage] = useState("PT-BR");

  // Bloco 3 — Script
  const [script, setScript] = useState("");
  const [tone, setTone] = useState("animated");
  const [duration, setDuration] = useState<VideoDuration>("30");

  // Bloco 4 — Gerar
  const [format, setFormat] = useState<VideoFormat>("9:16");
  const [caption, setCaption] = useState(true);
  const [music, setMusic] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDone, setIsDone] = useState(false);

  function isBlockDone(block: BlockId) {
    return activeBlock > block || isDone;
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setProductImage(url);
  }

  function handleGenerate() {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setIsDone(true);
    }, 4000);
  }

  function handleSuggestScript() {
    setScript(
      `Olha esse produto incrível! ✨ ${productName || "Produto"} que vai mudar sua vida! Qualidade premium, preço que você não vai acreditar. Aproveita agora que tá com desconto especial! 🔥 Clica no link e garante o seu!`
    );
  }

  const bgColors = ["#ffffff", "#f8f0e8", "#e8f0f8", "#f0e8f8", "#e8f8f0", "#1a1a1a"];

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>

      {/* ── Canvas principal ─────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="font-tight text-[20px] font-bold text-text tracking-tight">
            TikTok Shop
          </h1>
          <p className="text-[12px] text-text-2">
            De uma foto do produto a um vídeo de vendas em menos de 5 minutos
          </p>
        </div>

        {/* Progress bar dos blocos */}
        <div className="flex items-center gap-0 mb-8">
          {([1, 2, 3, 4] as BlockId[]).map((b, i) => (
            <div key={b} className="flex items-center flex-1">
              <button
                onClick={() => b <= activeBlock && setActiveBlock(b)}
                className={`flex items-center gap-2 text-[12px] font-medium transition-colors
                  ${activeBlock === b ? "text-purple-light" : isBlockDone(b) ? "text-green cursor-pointer" : "text-text-3"}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold
                  ${activeBlock === b ? "bg-purple text-white" : isBlockDone(b) ? "bg-green text-white" : "bg-surface-3 text-text-3 border border-border"}`}>
                  {isBlockDone(b) ? (
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : b}
                </div>
                <span className="hidden sm:inline">{["Produto", "Avatar", "Script", "Gerar"][i]}</span>
              </button>
              {i < 3 && (
                <div className={`flex-1 h-px mx-3 ${isBlockDone(b) ? "bg-green" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        {/* ── Bloco 1: Produto ──────────────────────────── */}
        {activeBlock === 1 && (
          <div className="bg-surface border border-border rounded-[14px] p-6 max-w-[640px]">
            <BlockHeader number={1} title="Produto" desc="Adicione a foto e detalhes do produto" active={true} done={false} />

            {/* Upload */}
            <div className="mb-5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3 block mb-2">
                Foto do produto
              </label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-[10px] flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors
                  ${productImage ? "border-purple-border" : "border-border hover:border-border-strong"}`}
                style={{ height: 140 }}
              >
                {productImage ? (
                  <img src={productImage} alt="Produto" className="h-full w-full object-contain rounded-[10px] p-2" />
                ) : (
                  <>
                    <svg className="w-8 h-8 stroke-text-3 fill-none stroke-[1.5]" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9l4-4 4 4 4-4 4 4M3 15l4 4 4-4 4 4" />
                    </svg>
                    <p className="text-[12px] text-text-3">Clique para fazer upload</p>
                    <p className="text-[10px] text-text-3">JPG, PNG até 10MB</p>
                  </>
                )}
              </div>
            </div>

            {/* Nome */}
            <div className="mb-4">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3 block mb-2">
                Nome do produto
              </label>
              <input
                type="text"
                className="w-full bg-surface-2 border border-border rounded-[6px] px-3 py-2 text-[13px] text-text placeholder:text-text-3 outline-none focus:border-purple-border transition-colors"
                placeholder="Ex: Tênis Nike Air Max 270"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
            </div>

            {/* Categoria + cor */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3 block mb-2">
                  Categoria
                </label>
                <select
                  className="w-full bg-surface-2 border border-border rounded-[6px] px-3 py-2 text-[13px] text-text outline-none cursor-pointer"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="fashion">Moda</option>
                  <option value="beauty">Beleza</option>
                  <option value="tech">Tech</option>
                  <option value="food">Alimentos</option>
                  <option value="other">Outros</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3 block mb-2">
                  Cor de fundo
                </label>
                <div className="flex gap-2 items-center">
                  {bgColors.map((c) => (
                    <button
                      key={c}
                      onClick={() => setBgColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-all flex-shrink-0
                        ${bgColor === c ? "border-purple scale-110" : "border-border"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveBlock(2)}
              disabled={!productName.trim()}
              className={`w-full py-2.5 rounded-[8px] text-[13px] font-medium transition-all
                ${productName.trim() ? "bg-purple text-white hover:opacity-90" : "bg-surface-2 text-text-3 cursor-not-allowed"}`}
            >
              Próximo — Avatar →
            </button>
          </div>
        )}

        {/* ── Bloco 2: Avatar ───────────────────────────── */}
        {activeBlock === 2 && (
          <div className="bg-surface border border-border rounded-[14px] p-6 max-w-[640px]">
            <BlockHeader number={2} title="Avatar" desc="Escolha quem vai apresentar o produto" active={true} done={false} />

            {/* Galeria */}
            <div className="mb-5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3 block mb-2">
                Selecionar avatar
              </label>
              <div className="grid grid-cols-3 gap-2">
                {avatars.map((av) => (
                  <button
                    key={av.id}
                    onClick={() => setSelectedAvatar(av.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-[10px] border transition-all
                      ${selectedAvatar === av.id ? "border-purple-border bg-purple-dim" : "border-border bg-surface-2 hover:border-border-strong"}`}
                  >
                    <span className="text-3xl">{av.emoji}</span>
                    <span className={`text-[12px] font-medium ${selectedAvatar === av.id ? "text-purple-light" : "text-text-2"}`}>
                      {av.name}
                    </span>
                    <div className="flex gap-1">
                      {av.lang.map((l) => (
                        <span key={l} className="text-[9px] text-text-3 bg-surface-3 px-1.5 py-0.5 rounded-full">
                          {l}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Posição + estilo */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3 block mb-2">
                  Posição
                </label>
                <select
                  className="w-full bg-surface-2 border border-border rounded-[6px] px-3 py-2 text-[13px] text-text outline-none cursor-pointer"
                  value={avatarPosition}
                  onChange={(e) => setAvatarPosition(e.target.value)}
                >
                  <option value="holding">Segurando produto</option>
                  <option value="side">Ao lado do produto</option>
                  <option value="highlight">Produto em destaque</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3 block mb-2">
                  Idioma
                </label>
                <select
                  className="w-full bg-surface-2 border border-border rounded-[6px] px-3 py-2 text-[13px] text-text outline-none cursor-pointer"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="PT-BR">PT-BR</option>
                  <option value="EN">Inglês</option>
                  <option value="ES">Espanhol</option>
                </select>
              </div>
            </div>

            {/* Estilo */}
            <div className="mb-5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3 block mb-2">
                Estilo do vídeo
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(styleLabels) as VideoStyle[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setVideoStyle(s)}
                    className={`py-2 px-3 rounded-[6px] text-[12px] font-medium border text-left transition-all
                      ${videoStyle === s ? "border-purple-border bg-purple-dim text-purple-light" : "border-border bg-surface-2 text-text-2 hover:border-border-strong"}`}
                  >
                    {styleLabels[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setActiveBlock(1)}
                className="px-4 py-2.5 rounded-[8px] text-[13px] font-medium border border-border bg-surface-2 text-text-2 hover:border-border-strong transition-colors"
              >
                ← Voltar
              </button>
              <button
                onClick={() => setActiveBlock(3)}
                className="flex-1 py-2.5 rounded-[8px] text-[13px] font-medium bg-purple text-white hover:opacity-90 transition-opacity"
              >
                Próximo — Script →
              </button>
            </div>
          </div>
        )}

        {/* ── Bloco 3: Script ───────────────────────────── */}
        {activeBlock === 3 && (
          <div className="bg-surface border border-border rounded-[14px] p-6 max-w-[640px]">
            <BlockHeader number={3} title="Script" desc="Escreva ou gere o roteiro com IA" active={true} done={false} />

            {/* Duração + tom */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3 block mb-2">
                  Duração máxima
                </label>
                <div className="flex gap-2">
                  {(["15", "30", "45", "60"] as VideoDuration[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={`flex-1 py-2 rounded-[6px] text-[12px] font-medium border transition-all
                        ${duration === d ? "border-purple-border bg-purple-dim text-purple-light" : "border-border bg-surface-2 text-text-3 hover:border-border-strong"}`}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3 block mb-2">
                  Tom de voz
                </label>
                <select
                  className="w-full bg-surface-2 border border-border rounded-[6px] px-3 py-2 text-[13px] text-text outline-none cursor-pointer"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                >
                  <option value="animated">Animado</option>
                  <option value="natural">Natural</option>
                  <option value="professional">Profissional</option>
                  <option value="fun">Divertido</option>
                </select>
              </div>
            </div>

            {/* Textarea do script */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3">
                  Script
                </label>
                <button
                  onClick={handleSuggestScript}
                  className="flex items-center gap-1.5 text-[11px] text-purple-light hover:text-purple transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  Sugerir com IA — 2 créditos
                </button>
              </div>
              <textarea
                className="w-full bg-surface-2 border border-border rounded-[10px] px-3.5 py-3 text-[13px] text-text placeholder:text-text-3 outline-none focus:border-purple-border transition-colors resize-none leading-relaxed"
                rows={6}
                placeholder="Escreva o script aqui ou clique em 'Sugerir com IA' para gerar automaticamente..."
                value={script}
                onChange={(e) => setScript(e.target.value)}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-text-3">
                  {script.length} caracteres
                </span>
                <span className="text-[10px] text-text-3">
                  ≈ {Math.round(script.split(" ").length / 2.5)}s de fala
                </span>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setActiveBlock(2)}
                className="px-4 py-2.5 rounded-[8px] text-[13px] font-medium border border-border bg-surface-2 text-text-2 hover:border-border-strong transition-colors"
              >
                ← Voltar
              </button>
              <button
                onClick={() => setActiveBlock(4)}
                disabled={!script.trim()}
                className={`flex-1 py-2.5 rounded-[8px] text-[13px] font-medium transition-all
                  ${script.trim() ? "bg-purple text-white hover:opacity-90" : "bg-surface-2 text-text-3 cursor-not-allowed"}`}
              >
                Próximo — Gerar →
              </button>
            </div>
          </div>
        )}

        {/* ── Bloco 4: Gerar ────────────────────────────── */}
        {activeBlock === 4 && (
          <div className="bg-surface border border-border rounded-[14px] p-6 max-w-[640px]">
            <BlockHeader number={4} title="Gerar vídeo" desc="Configurações finais e geração" active={true} done={isDone} />

            {!isDone ? (
              <>
                {/* Formato */}
                <div className="mb-4">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3 block mb-2">
                    Formato
                  </label>
                  <div className="flex gap-2">
                    {(["9:16", "1:1", "16:9"] as VideoFormat[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFormat(f)}
                        className={`flex-1 py-2 rounded-[6px] text-[12px] font-medium border transition-all
                          ${format === f ? "border-purple-border bg-purple-dim text-purple-light" : "border-border bg-surface-2 text-text-3 hover:border-border-strong"}`}
                      >
                        {f}
                        {f === "9:16" && <span className="text-[9px] block text-text-3">TikTok</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Opções */}
                <div className="flex flex-col gap-3 mb-5">
                  {[
                    { label: "Legenda animada automática", value: caption, onChange: setCaption },
                    { label: "Música de fundo trending", value: music, onChange: setMusic },
                  ].map((opt) => (
                    <div
                      key={opt.label}
                      className="flex items-center justify-between p-3 bg-surface-2 border border-border rounded-[8px]"
                    >
                      <span className="text-[13px] text-text-2">{opt.label}</span>
                      <button
                        onClick={() => opt.onChange(!opt.value)}
                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0
                          ${opt.value ? "bg-purple" : "bg-surface-3"}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all
                          ${opt.value ? "left-5" : "left-0.5"}`} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Resumo */}
                <div className="bg-surface-2 border border-border rounded-[10px] p-4 mb-5">
                  <p className="text-[11px] font-semibold text-text-3 uppercase tracking-wider mb-3">Resumo</p>
                  <div className="flex flex-col gap-2">
                    {[
                      { label: "Produto", value: productName || "—" },
                      { label: "Avatar", value: avatars.find((a) => a.id === selectedAvatar)?.name || "—" },
                      { label: "Estilo", value: styleLabels[videoStyle] },
                      { label: "Duração", value: `${duration}s` },
                      { label: "Formato", value: format },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between">
                        <span className="text-[12px] text-text-3">{row.label}</span>
                        <span className="text-[12px] text-text font-medium">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-3">
                  <button
                    onClick={() => setActiveBlock(3)}
                    className="px-4 py-2.5 rounded-[8px] text-[13px] font-medium border border-border bg-surface-2 text-text-2 hover:border-border-strong transition-colors"
                  >
                    ← Voltar
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[8px] text-[13px] font-medium transition-all
                      ${isGenerating ? "bg-purple/60 text-white cursor-not-allowed" : "bg-purple text-white hover:opacity-90"}`}
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Gerando vídeo...
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Gerar agora
                      </>
                    )}
                  </button>
                </div>
                <p className="text-center text-[11px] text-text-3">
                  ≈ <span className="text-purple-light font-medium">{creditCost[duration]} créditos</span> · pronto em ~60 segundos
                </p>
              </>
            ) : (
              /* ── Resultado ── */
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="w-16 h-16 rounded-full bg-green-dim border border-green-border flex items-center justify-center">
                  <svg className="w-8 h-8 stroke-green fill-none stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-[16px] font-semibold text-text mb-1">Vídeo pronto! 🎉</p>
                  <p className="text-[12px] text-text-2">Seu vídeo de {duration}s está pronto para download</p>
                </div>
                <div className="flex gap-2 w-full">
                  <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[8px] bg-green text-[#0c1a13] text-[13px] font-medium hover:opacity-90 transition-opacity">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    Baixar MP4
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[8px] border border-border bg-surface-2 text-text-2 text-[13px] font-medium hover:border-border-strong transition-colors">
                    Publicar no TikTok
                  </button>
                </div>
                <button
                  onClick={() => { setActiveBlock(1); setIsDone(false); setScript(""); setProductName(""); setProductImage(null); }}
                  className="text-[12px] text-text-3 hover:text-text-2 transition-colors"
                >
                  Criar outro vídeo →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Painel direito: preview ──────────────────────── */}
      <aside className="w-[220px] flex-shrink-0 border-l border-border bg-surface p-4 flex flex-col gap-4 overflow-y-auto">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-3 mb-3">
            Preview 9:16
          </p>
          <div
            className="w-full bg-surface-2 border border-border rounded-[10px] flex flex-col items-center justify-center gap-3 overflow-hidden"
            style={{ aspectRatio: "9/16", maxHeight: 280, background: bgColor + "15" }}
          >
            {productImage ? (
              <img src={productImage} alt="Produto" className="w-full h-full object-contain p-4" />
            ) : (
              <>
                <svg className="w-10 h-10 stroke-border-strong fill-none stroke-[1.5]" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9l4-4 4 4 4-4 4 4" />
                </svg>
                <span className="text-[11px] text-text-3 text-center px-4">Preview disponível após upload do produto</span>
              </>
            )}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-3 mb-3">
            Etapas
          </p>
          {[
            { label: "Produto", done: activeBlock > 1 || isDone },
            { label: "Avatar", done: activeBlock > 2 || isDone },
            { label: "Script", done: activeBlock > 3 || isDone },
            { label: "Gerar", done: isDone },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center gap-2 py-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                ${step.done ? "bg-green-dim border border-green-border" : activeBlock === i + 1 ? "bg-purple-dim border border-purple-border" : "bg-surface-3 border border-border"}`}>
                {step.done ? (
                  <svg className="w-2.5 h-2.5 stroke-green fill-none stroke-[2.5]" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span className={`text-[9px] font-semibold ${activeBlock === i + 1 ? "text-purple-light" : "text-text-3"}`}>{i + 1}</span>
                )}
              </div>
              <span className={`text-[12px] ${step.done ? "text-green" : activeBlock === i + 1 ? "text-text" : "text-text-3"}`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
