"use client";

// frontend/app/instagram-dark/page.tsx
// Instagram Dark — busca Reels (por perfil ou link direto), aplica
// capa/faixa + marca d'água em lote, cobra por Reels processado com sucesso.
// NOVO: aba "Editor em Massa" — enquadramento 1080x1920 (zoom/posição/
// bordas) aplicado em lote, sobre Reels já buscados OU upload novo.

import { useState, useRef } from "react";
import { getSupabase } from "@/lib/supabase";

const API = "https://clipforge-6yzz.onrender.com";
const CREDITS_PER_REEL = 25;

interface ReelItem {
  media_id: string;
  video_url: string;
  thumbnail_url: string;
  views: number;
  duration_seconds: number;
}

interface BatchUpload {
  id: string;
  url: string;
  name: string;
  uploading: boolean;
}

interface BatchResult {
  original_url: string;
  final_url?: string;
  status: "done" | "error";
  error?: string;
}

export default function InstagramDarkPage() {
  const [tab, setTab] = useState<"perfil" | "link" | "lote">("perfil");

  const [profileInput, setProfileInput] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingLink, setLoadingLink] = useState(false);
  const [nextPageId, setNextPageId] = useState<string | null>(null);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const [barText, setBarText] = useState("");
  const [barColor, setBarColor] = useState("#7c6df5");
  const [textColor, setTextColor] = useState("#ffffff");
  const [watermarkUrl, setWatermarkUrl] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ original_url: string; final_url?: string; status: string; error?: string }[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [userCredits, setUserCredits] = useState<number>(0);

  const watermarkFileRef = useRef<HTMLInputElement>(null);

  // ── Editor em Massa — estado próprio, separado do fluxo de faixa/marca acima ──
  const [batchSource, setBatchSource] = useState<"existing" | "upload">("existing");
  const [batchSelectedReels, setBatchSelectedReels] = useState<Set<string>>(new Set());
  const [batchUploads, setBatchUploads] = useState<BatchUpload[]>([]);
  const batchFileRef = useRef<HTMLInputElement>(null);

  const [zoom, setZoom] = useState(100);
  const [posX, setPosX] = useState(50);
  const [posY, setPosY] = useState(50);
  const [borderColor, setBorderColor] = useState("#ffffff");
  const [fillMode, setFillMode] = useState<"manual" | "automatico">("manual");
  const [fillTop, setFillTop] = useState(12);
  const [fillBottom, setFillBottom] = useState(12);

  // Modo "automatico" calcula o zoom SEPARADAMENTE por vídeo, pra igualar
  // o tamanho da borda mesmo entre vídeos de proporções diferentes.
  const [borderMode, setBorderMode] = useState<"manual" | "automatico">("manual");
  const [borderTargetPct, setBorderTargetPct] = useState(10);

  const [configTab, setConfigTab] = useState<"bordas" | "titulo" | "inferior">("bordas");

  const [titleEnabled, setTitleEnabled] = useState(false);
  const [titleMode, setTitleMode] = useState<"texto" | "imagem">("texto");
  const [titleLinesText, setTitleLinesText] = useState("");
  const [titleImageUrl, setTitleImageUrl] = useState("");
  const [titleImageUploading, setTitleImageUploading] = useState(false);
  const [titleX, setTitleX] = useState(50);
  const [titleY, setTitleY] = useState(12);
  const [titleFontSize, setTitleFontSize] = useState(6);
  const [titleColor, setTitleColor] = useState("#ffffff");
  const titleImageRef = useRef<HTMLInputElement>(null);

  const [bottomEnabled, setBottomEnabled] = useState(false);
  const [bottomMode, setBottomMode] = useState<"texto" | "imagem">("texto");
  const [bottomText, setBottomText] = useState("");
  const [bottomImageUrl, setBottomImageUrl] = useState("");
  const [bottomImageUploading, setBottomImageUploading] = useState(false);
  const [bottomX, setBottomX] = useState(50);
  const [bottomY, setBottomY] = useState(88);
  const [bottomFontSize, setBottomFontSize] = useState(4.5);
  const [bottomColor, setBottomColor] = useState("#ffffff");
  const bottomImageRef = useRef<HTMLInputElement>(null);

  async function uploadOverlayImage(file: File, onDone: (url: string) => void, setUploading: (v: boolean) => void) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/storage/upload/product-image`, { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onDone(data.url);
    } catch {
      setBatchError("Falha ao enviar a imagem.");
    } finally {
      setUploading(false);
    }
  }

  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);

  async function getUserId(): Promise<string> {
    const sb = getSupabase();
    const { data } = await sb.auth.getUser();
    return data?.user?.id || "";
  }

  async function refreshCredits() {
    try {
      const userId = await getUserId();
      if (!userId) return;
      const res = await fetch(`${API}/credits/${userId}`);
      const data = await res.json();
      if (data.balance !== undefined) setUserCredits(data.balance);
    } catch {}
  }

  useState(() => { refreshCredits(); });

  async function uploadFile(file: File, onDone: (url: string) => void) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API}/storage/upload/product-image`, { method: "POST", body: fd });
    const data = await res.json();
    onDone(data.url);
  }

  async function searchReels(cursor: string | null = null) {
    if (!profileInput.trim()) return;
    const append = !!cursor;
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    if (!append) { setReels([]); setSelected(new Set()); setNextPageId(null); }
    try {
      let url = `${API}/instagram-dark/list-reels?profile=${encodeURIComponent(profileInput.trim())}`;
      if (cursor) url += `&page_id=${encodeURIComponent(cursor)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao buscar Reels desse perfil");
      }
      const data = await res.json();
      setReels(prev => append ? [...prev, ...data.reels] : data.reels);
      setNextPageId(data.next_page_id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function searchByLink() {
    if (!linkInput.trim()) return;
    setLoadingLink(true);
    setError(null);
    try {
      const res = await fetch(`${API}/instagram-dark/reel-by-url?url=${encodeURIComponent(linkInput.trim())}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao buscar esse Reels");
      }
      const reel: ReelItem = await res.json();
      setReels(prev => prev.some(r => r.media_id === reel.media_id) ? prev : [reel, ...prev]);
      setSelected(prev => new Set(prev).add(reel.media_id));
      setLinkInput("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingLink(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(reels.map(r => r.media_id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const estimatedCost = selected.size * CREDITS_PER_REEL;

  function openConfirm() {
    if (selected.size === 0) { alert("Selecione ao menos 1 Reels!"); return; }
    setConfirmOpen(true);
  }

  async function startProcessing() {
    setConfirmOpen(false);
    const userId = await getUserId();
    if (!userId) { alert("Faça login novamente."); return; }

    const selectedUrls = reels.filter(r => selected.has(r.media_id)).map(r => r.video_url);

    setProcessing(true);
    setProgress(0);
    setResults([]);

    try {
      const res = await fetch(`${API}/instagram-dark/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          video_urls: selectedUrls,
          bar_text: barText || null,
          bar_color: barColor,
          text_color: textColor,
          watermark_image_url: watermarkUrl || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao iniciar processamento");
      }
      const data = await res.json();
      const taskId = data.task_id;

      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const statusRes = await fetch(`${API}/instagram-dark/status/${taskId}`);
        const statusData = await statusRes.json();
        setProgress(statusData.progress || 0);

        if (statusData.status === "done") {
          clearInterval(poll);
          setResults(statusData.videos || []);
          setProcessing(false);
          refreshCredits();
        } else if (statusData.status === "error" || attempts > 120) {
          clearInterval(poll);
          setError(statusData.error || "Timeout no processamento");
          setProcessing(false);
          refreshCredits();
        }
      }, 5000);
    } catch (e: any) {
      setError(e.message);
      setProcessing(false);
    }
  }

  // ── Editor em Massa — funções próprias ──────────────────────────────

  function toggleBatchReel(id: string) {
    setBatchSelectedReels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBatchFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = 50 - batchUploads.length;
    const toUpload = Array.from(files).slice(0, Math.max(0, remaining));

    for (const file of toUpload) {
      const localId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      setBatchUploads(prev => [...prev, { id: localId, url: "", name: file.name, uploading: true }]);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`${API}/storage/upload/video`, { method: "POST", body: fd });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setBatchUploads(prev => prev.map(u => u.id === localId ? { ...u, url: data.url, uploading: false } : u));
      } catch {
        setBatchUploads(prev => prev.filter(u => u.id !== localId));
        setBatchError(`Falha ao enviar "${file.name}"`);
      }
    }
  }

  function removeBatchUpload(id: string) {
    setBatchUploads(prev => prev.filter(u => u.id !== id));
  }

  const batchVideoUrls: string[] = batchSource === "existing"
    ? reels.filter(r => batchSelectedReels.has(r.media_id)).map(r => r.video_url)
    : batchUploads.filter(u => u.url).map(u => u.url);

  async function startBatchProcess() {
    if (batchVideoUrls.length === 0) {
      setBatchError(batchSource === "existing" ? "Selecione ao menos 1 Reels da lista!" : "Envie ao menos 1 vídeo!");
      return;
    }
    setBatchError(null);
    setBatchProcessing(true);
    setBatchProgress(0);
    setBatchResults([]);

    try {
      const res = await fetch(`${API}/batch-editor/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videos: batchVideoUrls,
          zoom,
          pos_x: posX,
          pos_y: posY,
          border_color: borderColor,
          fill_top_pct: fillTop,
          fill_bottom_pct: fillBottom,
          fill_mode: fillMode,
          border_mode: borderMode,
          border_target_pct: borderTargetPct,
          title_lines: titleEnabled && titleMode === "texto" ? titleLinesText.split("\n").map(l => l.trim()).filter(Boolean) : [],
          title_image_url: titleEnabled && titleMode === "imagem" && titleImageUrl ? titleImageUrl : null,
          title_x_pct: titleX,
          title_y_pct: titleY,
          title_font_size_pct: titleFontSize,
          title_color: titleColor,
          bottom_text: bottomEnabled && bottomMode === "texto" && bottomText.trim() ? bottomText.trim() : null,
          bottom_image_url: bottomEnabled && bottomMode === "imagem" && bottomImageUrl ? bottomImageUrl : null,
          bottom_x_pct: bottomX,
          bottom_y_pct: bottomY,
          bottom_font_size_pct: bottomFontSize,
          bottom_color: bottomColor,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao iniciar processamento em lote");
      }
      const data = await res.json();
      const jobId = data.job_id;

      let attempts = 0;
      const maxAttempts = 240; // até 20min (5s x 240) — lote de até 50 vídeos pode demorar
      const poll = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await fetch(`${API}/batch-editor/status/${jobId}`);
          const statusData = await statusRes.json();
          setBatchProgress(statusData.progress || 0);
          setBatchResults(statusData.videos || []);

          if (statusData.status === "done") {
            clearInterval(poll);
            setBatchProcessing(false);
          } else if (attempts > maxAttempts) {
            clearInterval(poll);
            setBatchError("Timeout aguardando o processamento em lote.");
            setBatchProcessing(false);
          }
        } catch { clearInterval(poll); setBatchProcessing(false); }
      }, 5000);
    } catch (e: any) {
      setBatchError(e.message);
      setBatchProcessing(false);
    }
  }

  // Prévia — usa o próprio <video> do arquivo (pega o frame real), não uma
  // thumbnail estática, pra funcionar tanto com Reels já buscados quanto
  // com upload novo. O usuário pode clicar num item da lista pra trocar
  // QUAL vídeo aparece na prévia — isso não muda o que é aplicado, já que
  // a configuração é sempre a mesma pra todos os vídeos do lote.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const effectivePreviewUrl = (previewUrl && batchVideoUrls.includes(previewUrl))
    ? previewUrl
    : (batchVideoUrls[0] || null);

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "#0a0a0f", color: "#f0f0f5" }}>

      {/* Fundo gradiente animado, estilo Instagram (só paleta de cor, sem logo/marca) */}
      <div className="fixed inset-0 pointer-events-none" style={{ opacity: 0.18 }}>
        <div className="ig-blob" style={{ background: "radial-gradient(circle, #833AB4, transparent 70%)", top: "-10%", left: "-10%" }} />
        <div className="ig-blob" style={{ background: "radial-gradient(circle, #FD1D1D, transparent 70%)", top: "20%", right: "-15%", animationDelay: "-5s" }} />
        <div className="ig-blob" style={{ background: "radial-gradient(circle, #F77737, transparent 70%)", bottom: "-15%", left: "20%", animationDelay: "-10s" }} />
        <div className="ig-blob" style={{ background: "radial-gradient(circle, #FCAF45, transparent 70%)", bottom: "10%", right: "10%", animationDelay: "-15s" }} />
      </div>
      <style>{`
        .ig-blob {
          position: absolute;
          width: 45vw;
          height: 45vw;
          border-radius: 50%;
          filter: blur(60px);
          animation: ig-float 22s ease-in-out infinite;
        }
        @keyframes ig-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(4%, 6%) scale(1.08); }
          66% { transform: translate(-4%, -3%) scale(0.95); }
        }
        input[type="range"] { accent-color: #7c6df5; }
      `}</style>

      <div className="relative z-10 p-6 max-w-4xl mx-auto flex flex-col gap-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold mb-1">🌙 Instagram Dark</h1>
            <p className="text-sm text-[#9090a8]">Baixe Reels e monte com faixa + marca d'água nova.</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#9090a8] px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
            <span className="font-semibold text-[#f0f0f5]">{userCredits.toLocaleString()}</span> créditos
          </div>
        </div>

        {/* Aviso de uso */}
        <div className="rounded-xl p-4" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "#f59e0b" }}>⚠️ Antes de usar, leia:</p>
          <p className="text-xs leading-relaxed" style={{ color: "#d4a45a" }}>
            <strong>Não baixe vídeos com rosto de outras pessoas</strong> — isso viola direito de imagem. Use essa ferramenta apenas com vídeos sem pessoas identificáveis. O vídeo baixado continua sendo trabalho autoral de quem criou — você assume a responsabilidade pelo uso que fizer do conteúdo.
          </p>
        </div>

        {/* Abas */}
        <div className="flex gap-1 p-1 rounded-[10px] w-fit" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
          {[{ id: "perfil", label: "🔍 Buscar por perfil" }, { id: "link", label: "🔗 Link de um Reels" }, { id: "lote", label: "🎛️ Editor em Massa" }].map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id as any)}
              className="px-4 py-2 rounded-[8px] text-sm font-medium cursor-pointer border-none transition-all"
              style={tab === t.id ? { background: "#7c6df5", color: "#fff" } : { background: "transparent", color: "#9090a8" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Busca por perfil */}
        {tab === "perfil" && (
          <div className="rounded-2xl p-5" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
            <label className="text-xs font-medium text-[#9090a8] block mb-2">Link ou @usuário do perfil</label>
            <div className="flex gap-2">
              <input type="text" value={profileInput} onChange={e => setProfileInput(e.target.value)}
                placeholder="https://instagram.com/perfil ou @perfil"
                onKeyDown={e => e.key === "Enter" && searchReels()}
                className="flex-1 h-11 px-3 rounded-[8px] text-sm outline-none placeholder-[#3a3a4a]"
                style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
              <button type="button" onClick={() => searchReels()} disabled={loading}
                className="px-5 h-11 rounded-[8px] text-sm font-semibold cursor-pointer border-none disabled:opacity-50"
                style={{ background: "#7c6df5", color: "#fff" }}>
                {loading ? "Buscando..." : "Buscar"}
              </button>
            </div>
          </div>
        )}

        {/* Busca por link individual */}
        {tab === "link" && (
          <div className="rounded-2xl p-5" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
            <label className="text-xs font-medium text-[#9090a8] block mb-2">Link de um Reels específico</label>
            <div className="flex gap-2">
              <input type="text" value={linkInput} onChange={e => setLinkInput(e.target.value)}
                placeholder="https://instagram.com/reel/..."
                onKeyDown={e => e.key === "Enter" && searchByLink()}
                className="flex-1 h-11 px-3 rounded-[8px] text-sm outline-none placeholder-[#3a3a4a]"
                style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
              <button type="button" onClick={searchByLink} disabled={loadingLink}
                className="px-5 h-11 rounded-[8px] text-sm font-semibold cursor-pointer border-none disabled:opacity-50"
                style={{ background: "#7c6df5", color: "#fff" }}>
                {loadingLink ? "Buscando..." : "Adicionar"}
              </button>
            </div>
            <p className="text-[10px] text-[#55556a] mt-2">Adiciona esse Reels específico à lista abaixo, já selecionado.</p>
          </div>
        )}

        {error && tab !== "lote" && <p className="text-xs text-[#f87171] -mt-3">{error}</p>}

        {/* Grid de reels (aba Buscar/Link) */}
        {tab !== "lote" && reels.length > 0 && (
          <div className="rounded-2xl p-5" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-[#9090a8]">{reels.length} Reels encontrados — {selected.size} selecionados</p>
              <div className="flex gap-2">
                <button type="button" onClick={selectAll}
                  className="text-[11px] px-2.5 py-1 rounded-[6px] cursor-pointer border-none" style={{ background: "rgba(124,109,245,0.15)", color: "#a99cf8" }}>
                  Selecionar todos
                </button>
                <button type="button" onClick={clearSelection}
                  className="text-[11px] px-2.5 py-1 rounded-[6px] cursor-pointer border-none" style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>
                  Limpar
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {reels.map(reel => (
                <div key={reel.media_id} onClick={() => toggleSelect(reel.media_id)}
                  className="relative rounded-xl overflow-hidden cursor-pointer"
                  style={{ aspectRatio: "9/16", border: selected.has(reel.media_id) ? "2px solid #7c6df5" : "1px solid rgba(255,255,255,0.1)" }}>
                  <img src={reel.thumbnail_url} className="w-full h-full object-cover" alt="" />
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: selected.has(reel.media_id) ? "#7c6df5" : "rgba(0,0,0,0.5)" }}>
                    {selected.has(reel.media_id) && <span className="text-white text-xs">✓</span>}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-white" style={{ background: "linear-gradient(transparent,rgba(0,0,0,0.8))" }}>
                    👁 {reel.views.toLocaleString()} · {Math.round(reel.duration_seconds)}s
                  </div>
                </div>
              ))}
            </div>
            {nextPageId && (
              <button type="button" onClick={() => searchReels(nextPageId)} disabled={loadingMore}
                className="w-full mt-4 h-10 rounded-[8px] text-xs font-medium cursor-pointer border-none disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.1)" }}>
                {loadingMore ? "Carregando..." : "Carregar mais Reels"}
              </button>
            )}
          </div>
        )}

        {/* Faixa (molde) + marca d'água + custo ao vivo (aba Buscar/Link) */}
        {tab !== "lote" && reels.length > 0 && (
          <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
            <div>
              <label className="text-xs font-medium text-[#9090a8] block mb-2">Faixa no topo (opcional — nome do canal ou tema)</label>
              <input type="text" value={barText} onChange={e => setBarText(e.target.value)}
                placeholder="Ex: Reflexões Diárias"
                className="w-full h-11 px-3 rounded-[8px] text-sm outline-none placeholder-[#3a3a4a] mb-3"
                style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <label className="text-[11px] text-[#55556a] block mb-1.5">Cor da faixa</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={barColor} onChange={e => setBarColor(e.target.value)}
                      className="w-10 h-10 rounded-[8px] cursor-pointer border-none bg-transparent" />
                    <span className="text-xs text-[#9090a8]">{barColor}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-[#55556a] block mb-1.5">Cor do texto</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
                      className="w-10 h-10 rounded-[8px] cursor-pointer border-none bg-transparent" />
                    <span className="text-xs text-[#9090a8]">{textColor}</span>
                  </div>
                </div>
              </div>

              {/* Prévia maior, em formato de celular */}
              <div className="flex justify-center">
                <div className="rounded-[24px] p-2" style={{ background: "#000", border: "3px solid #2a2a35", width: "160px" }}>
                  <div className="rounded-[16px] overflow-hidden" style={{ aspectRatio: "9/16" }}>
                    <div className="flex items-center justify-center text-[13px] font-bold text-center px-2" style={{ height: "18%", background: barColor, color: textColor }}>
                      {barText || "sua faixa aqui"}
                    </div>
                    <div className="flex items-center justify-center text-[10px] text-[#55556a]" style={{ height: "82%", background: "#18181f" }}>
                      vídeo original
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-[#55556a] mt-3 text-center">A faixa é adicionada acima do vídeo — o vídeo original não é cortado.</p>
            </div>

            <div>
              <label className="text-xs font-medium text-[#9090a8] block mb-2">Marca d'água (opcional — canto inferior direito, o vídeo todo)</label>
              <div onClick={() => watermarkFileRef.current?.click()}
                className="flex items-center gap-3 px-4 py-3 rounded-[8px] cursor-pointer"
                style={{ background: "rgba(62,207,142,0.05)", border: "0.5px dashed rgba(62,207,142,0.3)" }}>
                {watermarkUrl ? <img src={watermarkUrl} className="w-10 h-10 rounded object-cover" alt="" /> : <span>💧</span>}
                <span className="text-xs text-[#9090a8]">{watermarkUrl ? "Marca d'água enviada — clique pra trocar" : "Enviar marca d'água (PNG transparente)"}</span>
              </div>
              <input ref={watermarkFileRef} type="file" accept="image/png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, setWatermarkUrl); }} />
            </div>

            {/* Custo ao vivo */}
            <div className="rounded-[10px] px-4 py-3 flex items-center justify-between" style={{ background: "rgba(96,165,250,0.08)", border: "0.5px solid rgba(96,165,250,0.2)" }}>
              <span className="text-xs text-[#9090a8]">{selected.size} selecionado{selected.size !== 1 ? "s" : ""} × {CREDITS_PER_REEL}cr</span>
              <span className="text-sm font-bold text-[#60a5fa]">{estimatedCost} créditos</span>
            </div>

            <button type="button" onClick={openConfirm} disabled={processing}
              className="w-full h-12 rounded-[10px] text-sm font-semibold cursor-pointer border-none disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff" }}>
              {processing ? `Processando... ${progress}%` : `Processar ${selected.size} Reel${selected.size !== 1 ? "s" : ""}`}
            </button>
            <p className="text-[10px] text-[#55556a] text-center -mt-2">Você só paga pelos Reels que realmente forem baixados com sucesso.</p>
          </div>
        )}

        {/* Resultados (aba Buscar/Link) */}
        {tab !== "lote" && results.length > 0 && (
          <div className="rounded-2xl p-5" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
            <p className="text-sm font-semibold mb-3">Resultado</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {results.map((r, i) => (
                <div key={i} className="rounded-xl overflow-hidden" style={{ border: "0.5px solid rgba(255,255,255,0.1)" }}>
                  {r.status === "done" && r.final_url ? (
                    <>
                      <video src={r.final_url} className="w-full" style={{ aspectRatio: "9/16" }} controls muted />
                      <a href={r.final_url} download className="block text-center py-2 text-xs no-underline" style={{ color: "#3ecf8e" }}>⬇️ Baixar</a>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-3 gap-1.5" style={{ aspectRatio: "9/16" }}>
                      <span className="text-xs text-[#f87171] font-medium">❌ Falhou</span>
                      {r.error && <p className="text-[10px] text-[#9090a8] text-center leading-relaxed line-clamp-6">{r.error}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            ABA: EDITOR EM MASSA — layout 3 colunas (lista | prévia | config)
        ═══════════════════════════════════════════════════════════ */}
        {tab === "lote" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-5 items-start">

              {/* ── Coluna esquerda: origem + lista de vídeos ── */}
              <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                <div className="flex gap-1 p-1 rounded-[10px]" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                  {[{ id: "existing", label: "📋 Buscados" }, { id: "upload", label: "⬆️ Upload" }].map(s => (
                    <button key={s.id} type="button" onClick={() => setBatchSource(s.id as any)}
                      className="flex-1 px-2 py-1.5 rounded-[8px] text-[11px] font-medium cursor-pointer border-none transition-all"
                      style={batchSource === s.id ? { background: "#7c6df5", color: "#fff" } : { background: "transparent", color: "#9090a8" }}>
                      {s.label}
                    </button>
                  ))}
                </div>

                {batchSource === "existing" ? (
                  reels.length === 0 ? (
                    <p className="text-[11px] text-[#55556a] leading-relaxed">Nenhum Reels buscado ainda — vá na aba "Buscar por perfil", ou troque pra "Upload".</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-[#55556a]">{batchSelectedReels.size} de {reels.length}</p>
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => setBatchSelectedReels(new Set(reels.map(r => r.media_id)))}
                            className="text-[10px] px-2 py-0.5 rounded-[6px] cursor-pointer border-none" style={{ background: "rgba(124,109,245,0.15)", color: "#a99cf8" }}>
                            Todos
                          </button>
                          <button type="button" onClick={() => setBatchSelectedReels(new Set())}
                            className="text-[10px] px-2 py-0.5 rounded-[6px] cursor-pointer border-none" style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>
                            Limpar
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 max-h-[520px] overflow-y-auto">
                        {reels.map(reel => {
                          const isSelected = batchSelectedReels.has(reel.media_id);
                          const isPreviewing = effectivePreviewUrl === reel.video_url;
                          return (
                            <div key={reel.media_id}
                              className="flex items-center gap-2 px-2 py-2 rounded-[8px] cursor-pointer"
                              style={{ background: isPreviewing ? "rgba(124,109,245,0.15)" : "rgba(255,255,255,0.03)", border: isPreviewing ? "1px solid rgba(124,109,245,0.4)" : "1px solid transparent" }}
                              onClick={() => setPreviewUrl(reel.video_url)}>
                              <div onClick={e => { e.stopPropagation(); toggleBatchReel(reel.media_id); }}
                                className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 cursor-pointer"
                                style={{ background: isSelected ? "#7c6df5" : "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
                                {isSelected && <span className="text-white text-[9px]">✓</span>}
                              </div>
                              <div className="w-8 rounded overflow-hidden flex-shrink-0" style={{ aspectRatio: "9/16" }}>
                                <img src={reel.thumbnail_url} className="w-full h-full object-cover" alt="" />
                              </div>
                              <span className="text-[10px] text-[#9090a8] truncate flex-1">{Math.round(reel.duration_seconds)}s · {reel.views.toLocaleString()} views</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )
                ) : (
                  <>
                    <div onClick={() => batchFileRef.current?.click()}
                      onDrop={e => { e.preventDefault(); handleBatchFilesSelected(e.dataTransfer.files); }}
                      onDragOver={e => e.preventDefault()}
                      className="flex flex-col items-center justify-center rounded-xl cursor-pointer py-6"
                      style={{ border: "1.5px dashed rgba(124,109,245,0.4)", background: "rgba(124,109,245,0.05)" }}>
                      <span className="text-xl mb-1">⬆️</span>
                      <p className="text-[10px] text-[#9090a8] text-center px-2">Arraste ou clique — até 50, 100MB cada</p>
                    </div>
                    <input ref={batchFileRef} type="file" accept="video/*" multiple className="hidden"
                      onChange={e => handleBatchFilesSelected(e.target.files)} />
                    {batchUploads.length > 0 && (
                      <div className="flex flex-col gap-1.5 max-h-[440px] overflow-y-auto">
                        {batchUploads.map(u => {
                          const isPreviewing = !!u.url && effectivePreviewUrl === u.url;
                          return (
                            <div key={u.id}
                              className="flex items-center gap-2 px-2 py-2 rounded-[8px] cursor-pointer"
                              style={{ background: isPreviewing ? "rgba(124,109,245,0.15)" : "rgba(255,255,255,0.03)", border: isPreviewing ? "1px solid rgba(124,109,245,0.4)" : "1px solid transparent" }}
                              onClick={() => u.url && setPreviewUrl(u.url)}>
                              <span className="text-[10px] text-[#9090a8] truncate flex-1">{u.name}</span>
                              {u.uploading ? (
                                <span className="text-[9px] text-[#60a5fa] flex-shrink-0">Enviando...</span>
                              ) : (
                                <button type="button" onClick={e => { e.stopPropagation(); removeBatchUpload(u.id); }}
                                  className="text-[9px] px-1.5 py-0.5 rounded-[6px] cursor-pointer border-none flex-shrink-0" style={{ background: "rgba(248,113,113,0.1)", color: "#f87171" }}>
                                  Remover
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Coluna central: prévia grande ── */}
              <div className="rounded-2xl p-6 flex flex-col items-center justify-center gap-4" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)", minHeight: "560px" }}>
                <div className="rounded-[28px] p-2.5" style={{ background: "#000", border: "4px solid #2a2a35", width: "300px" }}>
                  <div className="rounded-[20px] overflow-hidden relative" style={{ aspectRatio: "9/16", background: borderColor }}>
                    {effectivePreviewUrl ? (
                      <video
                        key={effectivePreviewUrl}
                        src={effectivePreviewUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        controls
                        className="absolute inset-0 w-full h-full object-contain"
                        style={{
                          // Corta visualmente o topo/rodapé do vídeo ORIGINAL,
                          // igual ao que o FFmpeg faz de verdade no backend.
                          clipPath: `inset(${fillTop}% 0 ${fillBottom}% 0)`,
                          // Zoom via transform:scale — diferente de mexer em
                          // width/height em %, isso funciona igual pra cima
                          // (>100%) e pra baixo (<100%). Posição desloca o
                          // enquadramento dentro da área com zoom aplicado.
                          transform: `translate(${(50 - posX) * 0.6}%, ${(50 - posY) * 0.6}%) scale(${zoom / 100})`,
                          transformOrigin: "center center",
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-[#55556a] text-center px-4">
                        Selecione ou envie um vídeo pra ver a prévia
                      </div>
                    )}

                    {/* Prévia do título (texto ou imagem) */}
                    {titleEnabled && titleMode === "texto" && titleLinesText.split("\n").find(l => l.trim()) && (
                      <div className="absolute px-2 text-center font-bold pointer-events-none"
                        style={{
                          left: `${titleX}%`, top: `${titleY}%`, transform: "translate(-50%,-50%)",
                          color: titleColor, fontSize: `${titleFontSize * 3.6}px`,
                          textShadow: "0 0 3px #000, 0 0 3px #000, 0 0 3px #000, 1px 1px 2px #000",
                          maxWidth: "90%", lineHeight: 1.25,
                        }}>
                        {titleLinesText.split("\n").find(l => l.trim())}
                      </div>
                    )}
                    {titleEnabled && titleMode === "imagem" && titleImageUrl && (
                      <img src={titleImageUrl} alt="" className="absolute pointer-events-none"
                        style={{ left: `${titleX}%`, top: `${titleY}%`, transform: "translate(-50%,-50%)", width: `${titleFontSize}%`, height: "auto" }} />
                    )}

                    {/* Prévia do texto inferior (texto ou imagem) */}
                    {bottomEnabled && bottomMode === "texto" && bottomText.trim() && (
                      <div className="absolute px-2 text-center font-bold pointer-events-none"
                        style={{
                          left: `${bottomX}%`, top: `${bottomY}%`, transform: "translate(-50%,-50%)",
                          color: bottomColor, fontSize: `${bottomFontSize * 3.6}px`,
                          textShadow: "0 0 3px #000, 0 0 3px #000, 0 0 3px #000, 1px 1px 2px #000",
                          maxWidth: "90%", lineHeight: 1.25,
                        }}>
                        {bottomText}
                      </div>
                    )}
                    {bottomEnabled && bottomMode === "imagem" && bottomImageUrl && (
                      <img src={bottomImageUrl} alt="" className="absolute pointer-events-none"
                        style={{ left: `${bottomX}%`, top: `${bottomY}%`, transform: "translate(-50%,-50%)", width: `${bottomFontSize}%`, height: "auto" }} />
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-[#55556a] text-center max-w-xs">
                  {batchVideoUrls.length > 0
                    ? `Prévia aproximada — a mesma edição vai ser aplicada aos ${batchVideoUrls.length} vídeo${batchVideoUrls.length !== 1 ? "s" : ""} selecionado${batchVideoUrls.length !== 1 ? "s" : ""}. Clique em outro vídeo na lista pra conferir o enquadramento dele.`
                    : "Selecione vídeos na lista à esquerda pra começar."}
                </p>
              </div>

              {/* ── Coluna direita: config (Bordas / Título / Inferior) ── */}
              <div className="rounded-2xl p-5 flex flex-col gap-5" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                <div className="flex gap-1 p-1 rounded-[10px]" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                  {[{ id: "bordas", label: "Bordas" }, { id: "titulo", label: "Título" }, { id: "inferior", label: "Inferior" }].map(t => (
                    <button key={t.id} type="button" onClick={() => setConfigTab(t.id as any)}
                      className="flex-1 px-2 py-1.5 rounded-[8px] text-[11px] font-medium cursor-pointer border-none transition-all"
                      style={configTab === t.id ? { background: "#7c6df5", color: "#fff" } : { background: "transparent", color: "#9090a8" }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {configTab === "bordas" && (
                  <>
                    <div>
                      <p className="text-xs font-medium text-[#9090a8] mb-2">Tamanho da borda</p>
                      <div className="flex gap-1 p-1 rounded-[10px] w-fit mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                        <button type="button" onClick={() => setBorderMode("manual")}
                          className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium cursor-pointer border-none"
                          style={borderMode === "manual" ? { background: "#7c6df5", color: "#fff" } : { background: "transparent", color: "#9090a8" }}>
                          Zoom manual
                        </button>
                        <button type="button" onClick={() => setBorderMode("automatico")}
                          className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium cursor-pointer border-none"
                          style={borderMode === "automatico" ? { background: "#7c6df5", color: "#fff" } : { background: "transparent", color: "#9090a8" }}>
                          Automático
                        </button>
                      </div>
                      {borderMode === "manual" ? (
                        <p className="text-[10px] text-[#55556a] mb-3">Zoom fixo pra todos — vídeos de proporções diferentes podem sair com bordas de tamanhos diferentes.</p>
                      ) : (
                        <p className="text-[10px] text-[#55556a] mb-3">Calcula o zoom individualmente por vídeo pra deixar a borda sempre do mesmo tamanho, mesmo com formatos de origem diferentes.</p>
                      )}
                    </div>

                    {borderMode === "manual" ? (
                      <div>
                        <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Zoom: {zoom}%</label>
                        <input type="range" min={20} max={200} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="w-full" />
                      </div>
                    ) : (
                      <div>
                        <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Borda alvo: {borderTargetPct}%</label>
                        <input type="range" min={0} max={40} value={borderTargetPct} onChange={e => setBorderTargetPct(Number(e.target.value))} className="w-full" />
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Posição horizontal: {posX}%</label>
                      <input type="range" min={0} max={100} value={posX} onChange={e => setPosX(Number(e.target.value))} className="w-full" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Posição vertical: {posY}%</label>
                      <input type="range" min={0} max={100} value={posY} onChange={e => setPosY(Number(e.target.value))} className="w-full" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Cor das bordas</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={borderColor} onChange={e => setBorderColor(e.target.value)}
                          className="w-9 h-9 rounded-[8px] cursor-pointer border-none bg-transparent" />
                        <span className="text-xs text-[#9090a8]">{borderColor}</span>
                      </div>
                    </div>

                    <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

                    <div>
                      <p className="text-xs font-medium text-[#9090a8] mb-2">Corte do original (remove legenda/marca queimada)</p>
                      <div className="flex gap-1 p-1 rounded-[10px] w-fit mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                        <button type="button" onClick={() => setFillMode("manual")}
                          className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium cursor-pointer border-none"
                          style={fillMode === "manual" ? { background: "#7c6df5", color: "#fff" } : { background: "transparent", color: "#9090a8" }}>
                          Manual
                        </button>
                        <button type="button" onClick={() => setFillMode("automatico")}
                          className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium cursor-pointer border-none flex items-center gap-1"
                          style={fillMode === "automatico" ? { background: "#7c6df5", color: "#fff" } : { background: "transparent", color: "#9090a8" }}>
                          Automático
                          <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.2)", color: "#f59e0b" }}>em breve</span>
                        </button>
                      </div>
                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Topo: {fillTop}%</label>
                          <input type="range" min={0} max={45} value={fillTop} onChange={e => setFillTop(Number(e.target.value))} className="w-full" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Rodapé: {fillBottom}%</label>
                          <input type="range" min={0} max={45} value={fillBottom} onChange={e => setFillBottom(Number(e.target.value))} className="w-full" />
                        </div>
                      </div>
                      <p className="text-[10px] text-[#55556a] mt-2">Conteúdo central restante: {100 - fillTop - fillBottom}%</p>
                    </div>
                  </>
                )}

                {configTab === "titulo" && (
                  <>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-[#9090a8]">Título no vídeo</label>
                      <button type="button" onClick={() => setTitleEnabled(v => !v)}
                        className="w-9 h-5 rounded-full cursor-pointer border-none relative flex-shrink-0"
                        style={{ background: titleEnabled ? "#7c6df5" : "rgba(255,255,255,0.15)" }}>
                        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: titleEnabled ? "18px" : "2px" }} />
                      </button>
                    </div>
                    {titleEnabled && (
                      <>
                        <div className="flex gap-1 p-1 rounded-[10px] w-fit" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                          <button type="button" onClick={() => setTitleMode("texto")}
                            className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium cursor-pointer border-none"
                            style={titleMode === "texto" ? { background: "#7c6df5", color: "#fff" } : { background: "transparent", color: "#9090a8" }}>
                            Texto
                          </button>
                          <button type="button" onClick={() => setTitleMode("imagem")}
                            className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium cursor-pointer border-none"
                            style={titleMode === "imagem" ? { background: "#7c6df5", color: "#fff" } : { background: "transparent", color: "#9090a8" }}>
                            Imagem
                          </button>
                        </div>

                        {titleMode === "texto" ? (
                          <div>
                            <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Um título por linha (cicla se houver mais vídeos)</label>
                            <textarea value={titleLinesText} onChange={e => setTitleLinesText(e.target.value)}
                              placeholder={"esse vídeo fica mais tenso a cada segundo\neu não esperava por esse final"} rows={5}
                              className="w-full px-3 py-2.5 rounded-[8px] text-xs resize-none outline-none placeholder-[#3a3a4a]"
                              style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
                            <p className="text-[10px] text-[#55556a] mt-1">{titleLinesText.split("\n").filter(l => l.trim()).length} título{titleLinesText.split("\n").filter(l => l.trim()).length !== 1 ? "s" : ""}</p>
                          </div>
                        ) : (
                          <div>
                            <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Imagem (logo, foto, etc — mesma em todos os vídeos)</label>
                            <div onClick={() => titleImageRef.current?.click()}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] cursor-pointer"
                              style={{ background: "rgba(124,109,245,0.05)", border: "0.5px dashed rgba(124,109,245,0.3)" }}>
                              {titleImageUrl ? <img src={titleImageUrl} className="w-9 h-9 rounded object-cover" alt="" /> : <span>🖼️</span>}
                              <span className="text-[11px] text-[#9090a8]">
                                {titleImageUploading ? "Enviando..." : titleImageUrl ? "Enviada — clique pra trocar" : "Clique pra enviar"}
                              </span>
                            </div>
                            <input ref={titleImageRef} type="file" accept="image/*" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) uploadOverlayImage(f, setTitleImageUrl, setTitleImageUploading); }} />
                          </div>
                        )}

                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">
                            {titleMode === "imagem" ? `Largura da imagem: ${titleFontSize}%` : `Tamanho do texto: ${titleFontSize}%`}
                          </label>
                          <input type="range" min={2} max={40} step={0.5} value={titleFontSize} onChange={e => setTitleFontSize(Number(e.target.value))} className="w-full" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Posição X: {titleX}%</label>
                          <input type="range" min={0} max={100} value={titleX} onChange={e => setTitleX(Number(e.target.value))} className="w-full" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Posição Y: {titleY}%</label>
                          <input type="range" min={0} max={100} value={titleY} onChange={e => setTitleY(Number(e.target.value))} className="w-full" />
                        </div>
                        {titleMode === "texto" && (
                          <div>
                            <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Cor do texto</label>
                            <div className="flex items-center gap-2">
                              <input type="color" value={titleColor} onChange={e => setTitleColor(e.target.value)}
                                className="w-9 h-9 rounded-[8px] cursor-pointer border-none bg-transparent" />
                              <span className="text-xs text-[#9090a8]">{titleColor}</span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {configTab === "inferior" && (
                  <>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-[#9090a8]">Texto inferior (igual em todos)</label>
                      <button type="button" onClick={() => setBottomEnabled(v => !v)}
                        className="w-9 h-5 rounded-full cursor-pointer border-none relative flex-shrink-0"
                        style={{ background: bottomEnabled ? "#7c6df5" : "rgba(255,255,255,0.15)" }}>
                        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: bottomEnabled ? "18px" : "2px" }} />
                      </button>
                    </div>
                    {bottomEnabled && (
                      <>
                        <div className="flex gap-1 p-1 rounded-[10px] w-fit" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                          <button type="button" onClick={() => setBottomMode("texto")}
                            className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium cursor-pointer border-none"
                            style={bottomMode === "texto" ? { background: "#7c6df5", color: "#fff" } : { background: "transparent", color: "#9090a8" }}>
                            Texto
                          </button>
                          <button type="button" onClick={() => setBottomMode("imagem")}
                            className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium cursor-pointer border-none"
                            style={bottomMode === "imagem" ? { background: "#7c6df5", color: "#fff" } : { background: "transparent", color: "#9090a8" }}>
                            Imagem
                          </button>
                        </div>

                        {bottomMode === "texto" ? (
                          <div>
                            <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Texto</label>
                            <textarea value={bottomText} onChange={e => setBottomText(e.target.value)}
                              placeholder="Texto exibido em todos os vídeos" rows={3}
                              className="w-full px-3 py-2.5 rounded-[8px] text-xs resize-none outline-none placeholder-[#3a3a4a]"
                              style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
                          </div>
                        ) : (
                          <div>
                            <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Imagem (logo, foto, etc — mesma em todos os vídeos)</label>
                            <div onClick={() => bottomImageRef.current?.click()}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] cursor-pointer"
                              style={{ background: "rgba(124,109,245,0.05)", border: "0.5px dashed rgba(124,109,245,0.3)" }}>
                              {bottomImageUrl ? <img src={bottomImageUrl} className="w-9 h-9 rounded object-cover" alt="" /> : <span>🖼️</span>}
                              <span className="text-[11px] text-[#9090a8]">
                                {bottomImageUploading ? "Enviando..." : bottomImageUrl ? "Enviada — clique pra trocar" : "Clique pra enviar"}
                              </span>
                            </div>
                            <input ref={bottomImageRef} type="file" accept="image/*" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) uploadOverlayImage(f, setBottomImageUrl, setBottomImageUploading); }} />
                          </div>
                        )}

                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">
                            {bottomMode === "imagem" ? `Largura da imagem: ${bottomFontSize}%` : `Tamanho do texto: ${bottomFontSize}%`}
                          </label>
                          <input type="range" min={2} max={40} step={0.5} value={bottomFontSize} onChange={e => setBottomFontSize(Number(e.target.value))} className="w-full" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Posição X: {bottomX}%</label>
                          <input type="range" min={0} max={100} value={bottomX} onChange={e => setBottomX(Number(e.target.value))} className="w-full" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Posição Y: {bottomY}%</label>
                          <input type="range" min={0} max={100} value={bottomY} onChange={e => setBottomY(Number(e.target.value))} className="w-full" />
                        </div>
                        {bottomMode === "texto" && (
                          <div>
                            <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Cor do texto</label>
                            <div className="flex items-center gap-2">
                              <input type="color" value={bottomColor} onChange={e => setBottomColor(e.target.value)}
                                className="w-9 h-9 rounded-[8px] cursor-pointer border-none bg-transparent" />
                              <span className="text-xs text-[#9090a8]">{bottomColor}</span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {batchError && <p className="text-xs text-[#f87171]">{batchError}</p>}

                <button type="button" onClick={startBatchProcess} disabled={batchProcessing}
                  className="w-full h-12 rounded-[10px] text-sm font-semibold cursor-pointer border-none disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff" }}>
                  {batchProcessing ? `Processando... ${batchProgress}%` : `Processar ${batchVideoUrls.length} vídeo${batchVideoUrls.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>

            {/* Resultados do lote */}
            {batchResults.length > 0 && (
              <div className="rounded-2xl p-5" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                <p className="text-sm font-semibold mb-3">Resultado do lote</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {batchResults.map((r, i) => (
                    <div key={i} className="rounded-xl overflow-hidden" style={{ border: "0.5px solid rgba(255,255,255,0.1)" }}>
                      {r.status === "done" && r.final_url ? (
                        <>
                          <video src={r.final_url} className="w-full" style={{ aspectRatio: "9/16" }} controls muted />
                          <a href={r.final_url} download className="block text-center py-2 text-xs no-underline" style={{ color: "#3ecf8e" }}>⬇️ Baixar</a>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-3 gap-1.5" style={{ aspectRatio: "9/16" }}>
                          <span className="text-xs text-[#f87171] font-medium">❌ Falhou</span>
                          {r.error && <p className="text-[10px] text-[#9090a8] text-center leading-relaxed line-clamp-6">{r.error}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de confirmação (aba Buscar/Link) */}
      {confirmOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }} onClick={() => setConfirmOpen(false)}>
          <div className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden" style={{ background: "#131318", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 40px 80px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-5 flex flex-col items-center text-center" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-3" style={{ background: "linear-gradient(135deg,rgba(139,124,248,0.2),rgba(124,109,245,0.2))", border: "0.5px solid rgba(124,109,245,0.3)" }}>🌙</div>
              <p className="text-base font-bold text-[#f0f0f5]">Processar {selected.size} Reels?</p>
              <p className="text-[11px] text-[#55556a] mt-1">Só cobra pelos que baixarem com sucesso</p>
            </div>
            <div className="px-6 py-5 flex flex-col gap-2.5">
              <div className="flex justify-between text-[12px]"><span className="text-[#9090a8]">Reels selecionados</span><span className="text-[#f0f0f5] font-medium">{selected.size}</span></div>
              <div className="flex justify-between text-[12px]"><span className="text-[#9090a8]">Preço por Reels</span><span className="text-[#f0f0f5] font-medium">{CREDITS_PER_REEL} créditos</span></div>
              <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
              <div className="flex justify-between text-[13px]"><span className="text-[#9090a8]">Custo máximo (se todos derem certo)</span><span className="font-bold" style={{ color: "#f59e0b" }}>{estimatedCost} créditos</span></div>
              <div className="flex justify-between text-[12px]"><span className="text-[#9090a8]">Saldo atual</span><span className="text-[#f0f0f5]">{userCredits.toLocaleString()}</span></div>
              <div className="flex justify-between text-[12px]"><span className="text-[#9090a8]">Saldo mínimo após (pior caso)</span><span className="text-[#3ecf8e] font-medium">{(userCredits - estimatedCost).toLocaleString()}</span></div>
            </div>
            <div className="px-6 pb-6 flex flex-col gap-2">
              <button type="button" onClick={startProcessing}
                className="w-full h-11 rounded-[10px] text-sm font-semibold cursor-pointer border-none"
                style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff" }}>
                Processar agora
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
    </div>
  );
}
