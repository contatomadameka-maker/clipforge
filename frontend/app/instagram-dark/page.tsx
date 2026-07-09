"use client";

// frontend/app/instagram-dark/page.tsx
// Instagram Dark — lista Reels de um perfil, baixa os selecionados
// e aplica capa nova + marca d'água em lote.

import { useState, useRef } from "react";
import { getSupabase } from "@/lib/supabase";

const API = "https://clipforge-6yzz.onrender.com";

interface ReelItem {
  media_id: string;
  video_url: string;
  thumbnail_url: string;
  views: number;
  duration_seconds: number;
}

export default function InstagramDarkPage() {
  const [profileInput, setProfileInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextMaxId, setNextMaxId] = useState<string | null>(null);
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

  const watermarkFileRef = useRef<HTMLInputElement>(null);

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
    if (!append) { setReels([]); setSelected(new Set()); setNextMaxId(null); }
    try {
      let url = `${API}/instagram-dark/list-reels?profile=${encodeURIComponent(profileInput.trim())}`;
      if (cursor) url += `&max_id=${encodeURIComponent(cursor)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao buscar Reels desse perfil");
      }
      const data = await res.json();
      setReels(prev => append ? [...prev, ...data.reels] : data.reels);
      setNextMaxId(data.next_max_id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
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

  async function startProcessing() {
    if (selected.size === 0) { alert("Selecione ao menos 1 Reel!"); return; }

    let userId = "";
    try {
      const sb = getSupabase();
      const { data } = await sb.auth.getUser();
      userId = data?.user?.id || "";
    } catch {}
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
        } else if (statusData.status === "error" || attempts > 120) {
          clearInterval(poll);
          setError(statusData.error || "Timeout no processamento");
          setProcessing(false);
        }
      }, 5000);
    } catch (e: any) {
      setError(e.message);
      setProcessing(false);
    }
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "#0a0a0f", color: "#f0f0f5" }}>
      <div className="max-w-4xl mx-auto flex flex-col gap-6">

        <div>
          <h1 className="text-xl font-bold mb-1">🌙 Instagram Dark</h1>
          <p className="text-sm text-[#9090a8]">Baixe Reels de um perfil e monte com capa + marca d'água nova.</p>
        </div>

        {/* Aviso de uso — regra de "sem rosto" */}
        <div className="rounded-xl p-4" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "#f59e0b" }}>⚠️ Antes de usar, leia:</p>
          <p className="text-xs leading-relaxed" style={{ color: "#d4a45a" }}>
            <strong>Não baixe vídeos com rosto de outras pessoas</strong> — isso viola direito de imagem. Use essa ferramenta apenas com vídeos sem pessoas identificáveis (produtos, paisagens, animais, texto). O vídeo baixado continua sendo trabalho autoral de quem criou — você assume a responsabilidade pelo uso que fizer do conteúdo.
          </p>
        </div>

        {/* Busca de perfil */}
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
          {error && <p className="text-xs text-[#f87171] mt-2">{error}</p>}
        </div>

        {/* Grid de reels */}
        {reels.length > 0 && (
          <div className="rounded-2xl p-5" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs font-medium text-[#9090a8] mb-3">{reels.length} Reels encontrados — {selected.size} selecionados</p>
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
            {nextMaxId && (
              <button type="button" onClick={() => searchReels(nextMaxId)} disabled={loadingMore}
                className="w-full mt-4 h-10 rounded-[8px] text-xs font-medium cursor-pointer border-none disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.1)" }}>
                {loadingMore ? "Carregando..." : "Carregar mais Reels"}
              </button>
            )}
          </div>
        )}

        {/* Faixa (molde) + marca d'água */}
        {reels.length > 0 && (
          <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
            <div>
              <label className="text-xs font-medium text-[#9090a8] block mb-2">Faixa no topo (opcional — nome do canal ou tema)</label>
              <input type="text" value={barText} onChange={e => setBarText(e.target.value)}
                placeholder="Ex: Reflexões Diárias"
                className="w-full h-11 px-3 rounded-[8px] text-sm outline-none placeholder-[#3a3a4a] mb-3"
                style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
              <div className="flex gap-4">
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
              {barText && (
                <div className="mt-3 h-12 rounded-[8px] flex items-center justify-center text-sm font-bold"
                  style={{ background: barColor, color: textColor }}>
                  {barText}
                </div>
              )}
              <p className="text-[10px] text-[#55556a] mt-2">A faixa é adicionada acima do vídeo — o vídeo original não é cortado, a tela final fica um pouco mais alta.</p>
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

            <button type="button" onClick={startProcessing} disabled={processing}
              className="w-full h-12 rounded-[10px] text-sm font-semibold cursor-pointer border-none disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff" }}>
              {processing ? `Processando... ${progress}%` : `Processar ${selected.size} Reel${selected.size !== 1 ? "s" : ""}`}
            </button>
          </div>
        )}

        {/* Resultados */}
        {results.length > 0 && (
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
      </div>
    </div>
  );
}
