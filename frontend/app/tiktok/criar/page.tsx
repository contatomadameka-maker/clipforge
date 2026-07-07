"use client";

// ─────────────────────────────────────────────────────────────
// frontend/app/tiktok/criar/page.tsx
// Modo guiado — cria vídeo em um painel único, sem canvas.
// Alternativa mais simples ao /tiktok (canvas livre), inspirada no
// modo "Criar" do PipClip, mas com 3 melhorias reais:
//   1. Duração sugerida automaticamente pelo tamanho do texto falado
//   2. Custo contextualizado ("dá pra fazer mais X vídeos no seu plano")
//   3. "Kits" combinando persona + cena + tom num clique só
// ─────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useMemo } from "react";
import { getSupabase } from "@/lib/supabase";

// ── Galeria de mídia já enviada (localStorage, compartilhada com o canvas) ──
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

function GalleryPickerModal({ onSelect, onUploadNew, onClose }: { onSelect: (url: string) => void; onUploadNew: () => void; onClose: () => void }) {
  const items = getGallery();
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ background: "#131318", border: "1px solid rgba(255,255,255,0.1)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
          <div><p className="text-sm font-bold text-[#f0f0f5]">Escolher imagem</p><p className="text-[10px] text-[#55556a]">Já enviadas antes, ou envie uma nova</p></div>
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

const API = "https://clipforge-6yzz.onrender.com";

const RESOLUTION_RATE: Record<string, number> = { "480p": 12, "720p": 27 };
function computeCost(duration: string, resolution: string): number {
  const rate = RESOLUTION_RATE[resolution] ?? RESOLUTION_RATE["480p"];
  return parseInt(duration || "10") * rate;
}

// Ritmo médio de fala em PT-BR (~2,5 palavras/segundo) — usado pra
// sugerir a duração automaticamente a partir do texto digitado.
function suggestDuration(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return "10";
  const estimatedSeconds = words / 2.5;
  if (estimatedSeconds <= 6) return "5";
  if (estimatedSeconds <= 12) return "10";
  return "15";
}

// ── Kits combinados: persona + cena + tom num clique só ────────
const KITS = [
  {
    id: "fitness",
    label: "🏋️ Depoimento Fitness",
    persona: "mulher com seus 35 anos, cabelo amarrado, corpo atlético, roupa de academia",
    scene: "dentro de uma academia lotada, câmera na altura do peito, iluminação quente",
    tone: "Animado",
  },
  {
    id: "beleza",
    label: "💄 Review Beleza",
    persona: "mulher com seus 26 anos, pele cuidada, estilo aesthetic, ambiente claro",
    scene: "em um quarto aconchegante com luz natural pela janela, tons pastel",
    tone: "Natural",
  },
  {
    id: "tech",
    label: "💻 Unboxing Tech",
    persona: "homem com seus 29 anos, estilo casual moderno, aparência descontraída",
    scene: "em um home office minimalista, mesa organizada, luz de LED ao fundo",
    tone: "Profissional",
  },
  {
    id: "casa",
    label: "🏠 Produto pra Casa",
    persona: "mulher com seus 40 anos, roupa casual, aparência acolhedora",
    scene: "em uma cozinha moderna e iluminada, bancada em destaque",
    tone: "Divertido",
  },
];

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
    window.open(url, "_blank");
  } finally {
    onEnd?.();
  }
}

export default function CriarGuiadoPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userCredits, setUserCredits] = useState<number>(50);
  const [userPlanCredits, setUserPlanCredits] = useState<number>(400); // total do plano, pra contextualizar custo

  const [productImageUrl, setProductImageUrl] = useState("");
  const [productName, setProductName] = useState("");
  const [productUploading, setProductUploading] = useState(false);

  const [personaImageUrl, setPersonaImageUrl] = useState("");
  const [personaDescription, setPersonaDescription] = useState("");

  const [scenePrompt, setScenePrompt] = useState("");
  const [dialogue, setDialogue] = useState("");
  const [tone, setTone] = useState("Animado");

  const [durationTouched, setDurationTouched] = useState(false);
  const [duration, setDuration] = useState("10");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("480p");

  const [generatingScript, setGeneratingScript] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creditModal, setCreditModal] = useState<{ needed: number; have: number } | null>(null);

  const [result, setResult] = useState<{ status: "idle" | "processing" | "done" | "error"; progress: number; videoUrl?: string; error?: string }>({ status: "idle", progress: 0 });
  const [downloading, setDownloading] = useState(false);

  const productFileRef = useRef<HTMLInputElement>(null);
  const personaFileRef = useRef<HTMLInputElement>(null);
  const [showProductGallery, setShowProductGallery] = useState(false);
  const [showPersonaGallery, setShowPersonaGallery] = useState(false);

  // Sugestão automática de duração — só atualiza se o usuário ainda
  // não mexeu manualmente no slider (pra não sobrescrever escolha dele)
  useEffect(() => {
    if (!durationTouched) setDuration(suggestDuration(dialogue));
  }, [dialogue, durationTouched]);

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

  const cost = computeCost(duration, resolution);
  const videosRestantesNoPlano = useMemo(() => Math.floor(userCredits / cost), [userCredits, cost]);

  async function uploadFile(file: File, onDone: (url: string) => void, onUploading: (v: boolean) => void, label: string) {
    onUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/storage/upload/product-image`, { method: "POST", body: fd });
      const data = await res.json();
      onDone(data.url);
      addToGallery(data.url, label);
    } catch {
      const reader = new FileReader();
      reader.onload = ev => onDone(ev.target?.result as string);
      reader.readAsDataURL(file);
    } finally {
      onUploading(false);
    }
  }

  function applyKit(kit: typeof KITS[number]) {
    setPersonaDescription(kit.persona);
    setScenePrompt(kit.scene);
    setTone(kit.tone);
  }

  async function generateScript() {
    setGeneratingScript(true);
    try {
      const res = await fetch(`${API}/copy/generate-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_name: productName || "produto", category: "Geral", style: "UGC unboxing", tone, duration: `${duration}s`, language: "pt-br" }),
      });
      const data = await res.json();
      setDialogue(data.script);
    } catch {
      setDialogue(`Gente, esse ${productName || "produto"} mudou minha rotina! Resultado real em poucas semanas. Corre no link da bio!`);
    } finally {
      setGeneratingScript(false);
    }
  }

  function handleGenerateClick() {
    if (!productImageUrl) { alert("Envie a foto do produto primeiro!"); return; }
    if (!dialogue) { alert("Escreva (ou gere com IA) a fala do avatar!"); return; }
    if (!personaImageUrl && !personaDescription) { alert("Envie uma foto de persona OU descreva ela em texto!"); return; }
    if (cost > userCredits) { setCreditModal({ needed: cost, have: userCredits }); return; }
    setConfirmOpen(true);
  }

  async function executeGenerate() {
    setConfirmOpen(false);
    if (!userId) { alert("Não foi possível identificar seu usuário. Faça login novamente."); return; }

    let debitedOk = false;
    try {
      const debitRes = await fetch(`${API}/credits/debit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, amount: cost, description: `Vídeo guiado — ${duration}s ${resolution}` }),
      });
      if (!debitRes.ok) {
        const err = await debitRes.json().catch(() => ({}));
        if (debitRes.status === 402) setCreditModal({ needed: cost, have: userCredits });
        else alert(`Erro ao debitar créditos: ${err.detail || "erro desconhecido"}`);
        return;
      }
      const debitData = await debitRes.json();
      setUserCredits(debitData.balance);
      debitedOk = true;
    } catch (e: any) {
      alert(`Erro ao debitar créditos: ${e.message}`);
      return;
    }

    setResult({ status: "processing", progress: 10 });

    async function refund(motivo: string) {
      try {
        const r = await fetch(`${API}/credits/refund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, amount: cost, description: `Estorno — ${motivo}` }),
        });
        const d = await r.json().catch(() => null);
        if (d?.balance !== undefined) setUserCredits(d.balance);
      } catch {}
    }

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
          aspect_ratio: aspectRatio,
          duration,
          resolution,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || "Erro ao iniciar geração"); }
      const data = await res.json();
      const taskId = data.task_id;

      setResult(r => ({ ...r, progress: 25 }));

      let attempts = 0;
      const maxAttempts = 60;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await fetch(`${API}/seedance/status/${taskId}`);
          const statusData = await statusRes.json();
          setResult(r => ({ ...r, progress: Math.min(25 + attempts * 3, 95) }));

          if (statusData.status === "done") {
            clearInterval(poll);
            setResult({ status: "done", progress: 100, videoUrl: statusData.video_url });
          } else if (statusData.status === "error" || attempts > maxAttempts) {
            clearInterval(poll);
            setResult({ status: "error", progress: 0, error: statusData.error || "Timeout aguardando geração" });
            await refund(statusData.error || "timeout na geração");
          }
        } catch { clearInterval(poll); }
      }, 5000);
    } catch (e: any) {
      setResult({ status: "error", progress: 0, error: e.message });
      await refund(e.message);
    }
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 56px)", background: "#0a0a10" }}>
      {/* Topbar */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: "rgba(11,11,17,0.99)", borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="w-7 h-7 rounded-lg flex items-center justify-center no-underline" style={{ background: "rgba(255,255,255,0.08)", border: "0.5px solid rgba(255,255,255,0.1)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9090a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </a>
          <div>
            <p className="text-sm font-bold text-[#f0f0f5]">Criar (modo guiado)</p>
            <p className="text-[10px] text-[#55556a]">Sem canvas — tudo num painel só. <a href="/tiktok" className="text-[#a99cf8] no-underline">Prefere o canvas livre?</a></p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#9090a8] px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.07)" }}>
          <span className="font-semibold text-[#f0f0f5]">{userCredits.toLocaleString()}</span> créditos
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 max-w-6xl mx-auto w-full">

        {/* Coluna esquerda — formulário */}
        <div className="flex-1 flex flex-col gap-5">

          {/* Kits combinados */}
          <div>
            <p className="text-xs font-semibold text-[#9090a8] mb-2">✨ Kits rápidos (persona + cena + tom juntos)</p>
            <div className="grid grid-cols-2 gap-2">
              {KITS.map(kit => (
                <button key={kit.id} type="button" onClick={() => applyKit(kit)}
                  className="text-left px-3 py-2.5 rounded-[10px] text-xs cursor-pointer border-none transition-all"
                  style={{ background: "rgba(124,109,245,0.08)", color: "#a99cf8", border: "0.5px solid rgba(124,109,245,0.25)" }}>
                  {kit.label}
                </button>
              ))}
            </div>
          </div>

          {/* Produto */}
          <div className="rounded-2xl p-4" style={{ background: "rgba(14,14,20,0.98)", border: "0.5px solid rgba(255,255,255,0.1)" }}>
            <p className="text-xs font-semibold text-[#a99cf8] mb-3">🛍️ Produto</p>
            <div onClick={() => setShowProductGallery(true)}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) uploadFile(f, setProductImageUrl, setProductUploading, "Produto"); }}
              onDragOver={e => e.preventDefault()}
              className="flex flex-col items-center justify-center rounded-xl cursor-pointer"
              style={{ height: productImageUrl ? "140px" : "100px", border: "1.5px dashed rgba(124,109,245,0.3)", background: "rgba(124,109,245,0.04)" }}>
              {productImageUrl ? (
                <img src={productImageUrl} className="w-full h-full object-contain rounded-xl" alt="" />
              ) : productUploading ? (
                <div className="w-5 h-5 border-2 border-[#7c6df5]/30 border-t-[#7c6df5] rounded-full animate-spin" />
              ) : (
                <>
                  <span className="text-xl mb-1">📷</span>
                  <p className="text-xs text-[#9090a8]">Clique pra escolher ou enviar</p>
                </>
              )}
            </div>
            <input ref={productFileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, setProductImageUrl, setProductUploading, "Produto"); }} />
            {showProductGallery && (
              <GalleryPickerModal
                onSelect={url => { setProductImageUrl(url); setShowProductGallery(false); }}
                onUploadNew={() => { setShowProductGallery(false); productFileRef.current?.click(); }}
                onClose={() => setShowProductGallery(false)}
              />
            )}
            <input type="text" value={productName} onChange={e => setProductName(e.target.value)} placeholder="Nome do produto (ex: Fit Green)"
              className="w-full h-9 px-3 mt-2.5 rounded-[8px] text-sm outline-none placeholder-[#3a3a4a]"
              style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
          </div>

          {/* Persona */}
          <div className="rounded-2xl p-4" style={{ background: "rgba(14,14,20,0.98)", border: "0.5px solid rgba(255,255,255,0.1)" }}>
            <p className="text-xs font-semibold text-[#3ecf8e] mb-3">🧑‍🎤 Persona</p>
            <div className="grid grid-cols-1 gap-1.5 mb-2.5">
              {PERSONA_TEMPLATES.map(t => (
                <button key={t.label} type="button" onClick={() => setPersonaDescription(t.text)}
                  className="text-left px-2.5 py-2 rounded-[8px] text-[11px] cursor-pointer border-none"
                  style={personaDescription === t.text ? { background: "rgba(62,207,142,0.15)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.4)" } : { background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                  {t.label}
                </button>
              ))}
            </div>
            <textarea value={personaDescription} onChange={e => setPersonaDescription(e.target.value)}
              placeholder="Ex: mulher com seus 38 anos, cabelo amarrado, corpo atlético, roupa de academia"
              rows={3}
              className="w-full px-3 py-2.5 rounded-[8px] text-xs resize-none outline-none placeholder-[#3a3a4a]"
              style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
            <p className="text-[10px] text-[#55556a] mt-1.5">Ou envie uma foto de referência (opcional):</p>
            <div onClick={() => setShowPersonaGallery(true)}
              className="flex items-center gap-2 mt-1.5 px-3 py-2 rounded-[8px] cursor-pointer"
              style={{ background: "rgba(62,207,142,0.05)", border: "0.5px dashed rgba(62,207,142,0.3)" }}>
              {personaImageUrl ? <img src={personaImageUrl} className="w-8 h-8 rounded-lg object-cover" alt="" /> : <span className="text-sm">📷</span>}
              <span className="text-[11px] text-[#9090a8]">{personaImageUrl ? "Foto enviada — clique pra trocar" : "Escolher foto de referência"}</span>
            </div>
            <input ref={personaFileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, setPersonaImageUrl, () => {}, "Persona"); }} />
            {showPersonaGallery && (
              <GalleryPickerModal
                onSelect={url => { setPersonaImageUrl(url); setShowPersonaGallery(false); }}
                onUploadNew={() => { setShowPersonaGallery(false); personaFileRef.current?.click(); }}
                onClose={() => setShowPersonaGallery(false)}
              />
            )}
          </div>

          {/* Cena */}
          <div className="rounded-2xl p-4" style={{ background: "rgba(14,14,20,0.98)", border: "0.5px solid rgba(255,255,255,0.1)" }}>
            <p className="text-xs font-semibold text-[#f59e0b] mb-3">🎬 Cena</p>
            <div className="grid grid-cols-2 gap-1.5 mb-2.5">
              {SCENE_TEMPLATES.map(t => (
                <button key={t.label} type="button" onClick={() => setScenePrompt(t.text)}
                  className="text-left px-2.5 py-2 rounded-[8px] text-[11px] cursor-pointer border-none"
                  style={scenePrompt === t.text ? { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "0.5px solid rgba(245,158,11,0.4)" } : { background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.07)" }}>
                  {t.label}
                </button>
              ))}
            </div>
            <textarea value={scenePrompt} onChange={e => setScenePrompt(e.target.value)} placeholder="Descreva a cena..." rows={2}
              className="w-full px-3 py-2.5 rounded-[8px] text-xs resize-none outline-none placeholder-[#3a3a4a]"
              style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
          </div>

          {/* Fala */}
          <div className="rounded-2xl p-4" style={{ background: "rgba(14,14,20,0.98)", border: "0.5px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-[#f87171]">💬 Fala do avatar</p>
              <button type="button" onClick={generateScript} disabled={generatingScript}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer border-none disabled:opacity-40"
                style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", border: "0.5px solid rgba(248,113,113,0.2)" }}>
                {generatingScript ? "Gerando..." : "✨ Gerar com IA"}
              </button>
            </div>
            <textarea value={dialogue} onChange={e => setDialogue(e.target.value)} placeholder='Ex: "Esse produto mudou minha vida..."' rows={4}
              className="w-full px-3 py-2.5 rounded-[8px] text-sm resize-none outline-none placeholder-[#3a3a4a]"
              style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
            {dialogue && !durationTouched && (
              <p className="text-[10px] mt-1.5" style={{ color: "#3ecf8e" }}>
                ✨ Duração sugerida automaticamente pro tamanho desse texto: {duration}s (você pode ajustar abaixo)
              </p>
            )}
          </div>

          {/* Configurações finais */}
          <div className="rounded-2xl p-4 flex flex-col gap-4" style={{ background: "rgba(14,14,20,0.98)", border: "0.5px solid rgba(255,255,255,0.1)" }}>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[#9090a8]">Duração: {duration}s</label>
                {durationTouched && (
                  <button type="button" onClick={() => setDurationTouched(false)} className="text-[10px] cursor-pointer border-none bg-transparent" style={{ color: "#3ecf8e" }}>
                    usar sugestão automática
                  </button>
                )}
              </div>
              <input type="range" min={5} max={15} step={5} value={parseInt(duration)}
                onChange={e => { setDuration(e.target.value); setDurationTouched(true); }}
                className="w-full" />
              <div className="flex justify-between text-[10px] text-[#55556a] mt-1"><span>5s</span><span>10s</span><span>15s</span></div>
            </div>

            <div>
              <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Formato</label>
              <div className="flex gap-2">
                {[{ id: "9:16", l: "9:16 📱" }, { id: "1:1", l: "1:1 ⬜" }, { id: "16:9", l: "16:9 🖥️" }].map(f => (
                  <button key={f.id} type="button" onClick={() => setAspectRatio(f.id)}
                    className="flex-1 py-2 rounded-[8px] text-xs font-semibold cursor-pointer border-none"
                    style={aspectRatio === f.id ? { background: "rgba(96,165,250,0.2)", color: "#60a5fa", border: "0.5px solid rgba(96,165,250,0.4)" } : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
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
                  const selected = resolution === q;
                  return (
                    <button key={q} type="button" onClick={() => setResolution(q)}
                      className="flex-1 py-2 rounded-[8px] text-xs font-semibold cursor-pointer border-none flex flex-col items-center gap-0.5"
                      style={selected ? { background: "rgba(96,165,250,0.2)", color: "#60a5fa", border: "0.5px solid rgba(96,165,250,0.4)" } : { background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                      <span>{q}</span>
                      <span className="text-[9px] opacity-70">{rate} cr/s</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[10px] px-4 py-3" style={{ background: "rgba(96,165,250,0.08)", border: "0.5px solid rgba(96,165,250,0.2)" }}>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-[#9090a8]">Custo desse vídeo</span>
                <span className="text-sm font-bold text-[#60a5fa]">{cost} créditos</span>
              </div>
              <p className="text-[10px] text-[#55556a]">Com seu saldo atual, dá pra gerar mais <strong className="text-[#9090a8]">{videosRestantesNoPlano}</strong> vídeo{videosRestantesNoPlano !== 1 ? "s" : ""} assim.</p>
            </div>

            <button type="button" onClick={handleGenerateClick}
              className="w-full h-12 rounded-[10px] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer border-none"
              style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff", boxShadow: "0 4px 14px rgba(124,109,245,0.4)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Gerar vídeo ({cost} cr)
            </button>
          </div>
        </div>

        {/* Coluna direita — resultado */}
        <div className="lg:w-80 flex-shrink-0">
          <div className="rounded-2xl p-4 sticky top-6" style={{ background: "rgba(14,14,20,0.98)", border: "0.5px solid rgba(255,255,255,0.1)", minHeight: "300px" }}>
            <p className="text-xs font-semibold text-[#f0f0f5] mb-3">Resultado</p>
            {result.status === "idle" && (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <span className="text-3xl opacity-40">✨</span>
                <p className="text-xs text-[#55556a] text-center px-4">Preencha os campos e clique em gerar</p>
              </div>
            )}
            {result.status === "processing" && (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <div className="w-8 h-8 border-2 border-[#7c6df5]/30 border-t-[#7c6df5] rounded-full animate-spin" />
                <p className="text-xs text-[#9090a8]">Gerando... {result.progress}%</p>
              </div>
            )}
            {result.status === "done" && result.videoUrl && (
              <div className="flex flex-col gap-2">
                <video src={result.videoUrl} className="w-full rounded-lg" controls muted />
                <button type="button" disabled={downloading}
                  onClick={() => downloadVideoBlob(result.videoUrl as string, `video-${Date.now()}.mp4`, () => setDownloading(true), () => setDownloading(false))}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-[8px] text-xs font-medium border-none cursor-pointer disabled:opacity-50"
                  style={{ background: "rgba(62,207,142,0.15)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.3)" }}>
                  {downloading ? "⏳ Baixando..." : "⬇️ Baixar vídeo"}
                </button>
              </div>
            )}
            {result.status === "error" && (
              <div className="py-8 px-2">
                <p className="text-xs text-[#f87171]">{result.error}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de confirmação */}
      {confirmOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }} onClick={() => setConfirmOpen(false)}>
          <div className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden" style={{ background: "#131318", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 40px 80px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-5 flex flex-col items-center text-center" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-3" style={{ background: "linear-gradient(135deg,rgba(139,124,248,0.2),rgba(124,109,245,0.2))", border: "0.5px solid rgba(124,109,245,0.3)" }}>✨</div>
              <p className="text-base font-bold text-[#f0f0f5]">Gerar vídeo agora?</p>
            </div>
            <div className="px-6 py-5 flex flex-col gap-2.5">
              <div className="flex justify-between text-[12px]"><span className="text-[#9090a8]">Duração</span><span className="text-[#f0f0f5] font-medium">{duration}s</span></div>
              <div className="flex justify-between text-[12px]"><span className="text-[#9090a8]">Resolução</span><span className="text-[#f0f0f5] font-medium">{resolution}</span></div>
              <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
              <div className="flex justify-between text-[13px]"><span className="text-[#9090a8]">Custo total</span><span className="font-bold" style={{ color: "#f59e0b" }}>{cost} créditos</span></div>
              <div className="flex justify-between text-[12px]"><span className="text-[#9090a8]">Saldo após gerar</span><span className="text-[#3ecf8e] font-medium">{(userCredits - cost).toLocaleString()}</span></div>
            </div>
            <div className="px-6 pb-6 flex flex-col gap-2">
              <button type="button" onClick={executeGenerate}
                className="w-full h-11 rounded-[10px] text-sm font-semibold cursor-pointer border-none"
                style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff" }}>
                Gerar vídeo ({cost} cr)
              </button>
              <button type="button" onClick={() => setConfirmOpen(false)}
                className="w-full h-10 rounded-[10px] text-sm cursor-pointer border-none"
                style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de créditos insuficientes */}
      {creditModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
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
    </div>
  );
}
