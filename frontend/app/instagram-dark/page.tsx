"use client";

// frontend/app/instagram-dark/page.tsx
// Instagram Dark — busca Reels (por perfil ou link direto), aplica
// capa/faixa + marca d'água em lote, cobra por Reels processado com sucesso.
// NOVO: aba "Editor em Massa" — enquadramento 1080x1920 (zoom/posição/
// bordas) aplicado em lote, sobre Reels já buscados OU upload novo.

import { useState, useRef, useEffect } from "react";
import { getSupabase } from "@/lib/supabase";

const API = "https://clipforge-6yzz.onrender.com";
const CREDITS_PER_REEL = 15; // igualado ao Editor em Massa — antes era 25
const BATCH_CREDITS_PER_VIDEO = 15; // Editor em Massa — preço único, tudo incluso (bordas, título, marca, anti-dup)

// Fontes disponíveis — baixadas sob demanda no backend a partir do Google
// Fonts, exceto "sistema" (DejaVu, já incluída no repo).
const FONT_OPTIONS: { id: string; label: string }[] = [
  { id: "sistema", label: "Sistema (padrão)" },
  { id: "poppins", label: "Poppins" },
  { id: "montserrat", label: "Montserrat" },
  { id: "raleway", label: "Raleway" },
  { id: "oswald", label: "Oswald" },
  { id: "anton", label: "Anton" },
  { id: "bebas_neue", label: "Bebas Neue" },
  { id: "custom", label: "🎨 Fonte personalizada (.ttf/.otf)" },
];

// Nome CSS de cada fonte, pra aplicar na PRÉVIA (o vídeo final usa a fonte
// baixada direto no backend — isso aqui é só pra mostrar algo parecido na tela).
const FONT_CSS_FAMILY: Record<string, string> = {
  sistema: "inherit",
  poppins: "'Poppins', sans-serif",
  montserrat: "'Montserrat', sans-serif",
  raleway: "'Raleway', sans-serif",
  oswald: "'Oswald', sans-serif",
  anton: "'Anton', sans-serif",
  bebas_neue: "'Bebas Neue', sans-serif",
};

// Download forçado via PROXY DO BACKEND — o atributo `download` do <a> só
// é respeitado pelo navegador quando o arquivo é do MESMO domínio da
// página. Como o vídeo está no R2 (domínio diferente do Vercel), um link
// direto só abre o vídeo numa aba em vez de baixar. A correção: o backend
// busca o arquivo por trás e devolve com Content-Disposition: attachment,
// que força o download de verdade não importa a origem — e como não
// depende de `fetch()` lendo a resposta no navegador, também não esbarra
// em bloqueio de CORS (que era o motivo do fallback antigo abrir uma aba
// nova em vez de baixar).
function downloadVideoBlob(url: string, filename: string) {
  const proxyUrl = `${API}/storage/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
  const a = document.createElement("a");
  a.href = proxyUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Baixa todos como UM ZIP SÓ, montado no backend — resolve o problema de
// "baixar todos" disparando N downloads separados (o navegador trata isso
// como suspeito: pede permissão e, mesmo aceitando, costuma travar ou
// falhar em parte deles). Como é 1 download só, não esbarra nesse
// bloqueio. onProgress aqui não é "vídeo a vídeo" (o zip é montado inteiro
// no backend antes de vir) — só sinaliza início/fim pra UI.
async function downloadAllAsZip(items: { url: string; filename: string }[], zipFilename: string, onProgress?: (done: number, total: number) => void) {
  onProgress?.(0, items.length);
  const res = await fetch(`${API}/storage/download-zip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      urls: items.map(i => i.url),
      filenames: items.map(i => i.filename),
      zip_filename: zipFilename,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao gerar o ZIP");
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
  onProgress?.(items.length, items.length);
}

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
  const [tab, setTab] = useState<"perfil" | "link" | "tiktok" | "facebook" | "lote">("perfil");

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
  const [batchSource, setBatchSource] = useState<"existing" | "tiktok" | "facebook" | "upload">("existing");

  function goToEditorWith(source: "tiktok" | "facebook") {
    setBatchSource(source);
    setTab("lote");
  }

  // ── TikTok — busca por perfil, dentro do Editor em Massa ──
  const [tiktokProfileInput, setTiktokProfileInput] = useState("");
  const [tiktokLoading, setTiktokLoading] = useState(false);
  const [tiktokVideos, setTiktokVideos] = useState<ReelItem[]>([]);
  const [tiktokSelected, setTiktokSelected] = useState<Set<string>>(new Set());
  const [tiktokError, setTiktokError] = useState<string | null>(null);

  async function searchTiktokVideos() {
    if (!tiktokProfileInput.trim()) return;
    setTiktokLoading(true);
    setTiktokError(null);
    setTiktokVideos([]);
    setTiktokSelected(new Set());
    try {
      const res = await fetch(`${API}/tiktok-dark/list-videos?profile=${encodeURIComponent(tiktokProfileInput.trim())}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao buscar vídeos desse perfil no TikTok");
      }
      const data = await res.json();
      const items: ReelItem[] = (data.videos || []).map((v: any) => ({
        media_id: v.media_id, video_url: v.video_url, thumbnail_url: v.thumbnail_url,
        views: v.views, duration_seconds: v.duration_seconds,
      }));
      setTiktokVideos(items);
    } catch (e: any) {
      setTiktokError(e.message);
    } finally {
      setTiktokLoading(false);
    }
  }

  // ── Facebook — busca por página, dentro do Editor em Massa ──
  const FACEBOOK_SESSION_KEY = "clipforge_facebook_search_state";
  const [facebookPageInput, setFacebookPageInput] = useState("");
  const [facebookLoading, setFacebookLoading] = useState(false);
  const [facebookLoadingMore, setFacebookLoadingMore] = useState(false);
  const [facebookVideos, setFacebookVideos] = useState<ReelItem[]>([]);
  const [facebookSelected, setFacebookSelected] = useState<Set<string>>(new Set());
  const [facebookError, setFacebookError] = useState<string | null>(null);
  const [facebookHasMore, setFacebookHasMore] = useState(false);
  const [facebookCursor, setFacebookCursor] = useState<string | null>(null);
  const [facebookRestored, setFacebookRestored] = useState(false);
  const FACEBOOK_PAGE_SIZE = 20;

  // Restaura a busca salva (se tiver) assim que a página carrega — cobre
  // o caso de dar um F5 sem querer no meio de uma busca grande: sem isso,
  // o navegador esquece tudo e a próxima busca recomeça do zero,
  // gastando crédito de novo nos vídeos que já tinham sido buscados.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(FACEBOOK_SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setFacebookPageInput(parsed.pageInput || "");
        setFacebookVideos(parsed.videos || []);
        setFacebookHasMore(!!parsed.hasMore);
        setFacebookCursor(parsed.cursor || null);
      }
    } catch {}
    setFacebookRestored(true);
  }, []);

  // Salva sempre que algo relevante muda — só depois de já ter restaurado
  // (senão o efeito de restaurar acima ia disparar isso e sobrescrever
  // com estado vazio antes de ler o que tinha salvo).
  useEffect(() => {
    if (!facebookRestored) return;
    try {
      sessionStorage.setItem(FACEBOOK_SESSION_KEY, JSON.stringify({
        pageInput: facebookPageInput,
        videos: facebookVideos,
        hasMore: facebookHasMore,
        cursor: facebookCursor,
      }));
    } catch {}
  }, [facebookRestored, facebookPageInput, facebookVideos, facebookHasMore, facebookCursor]);

  async function searchFacebookVideos() {
    if (!facebookPageInput.trim()) return;
    setFacebookLoading(true);
    setFacebookError(null);
    setFacebookVideos([]);
    setFacebookSelected(new Set());
    setFacebookHasMore(false);
    setFacebookCursor(null);
    // O backend pode fazer várias chamadas internas (até 8) até juntar o
    // total pedido — timeout generoso pra não desistir antes dele
    // terminar (senão o site mostra erro mas o backend continua rodando
    // e gastando crédito nos bastidores, sem ninguém ver o resultado).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch(`${API}/facebook-dark/list-videos?page_url=${encodeURIComponent(facebookPageInput.trim())}&limit=${FACEBOOK_PAGE_SIZE}`, { signal: controller.signal });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao buscar vídeos dessa página do Facebook");
      }
      const data = await res.json();
      const items: ReelItem[] = (data.videos || []).map((v: any) => ({
        media_id: v.media_id, video_url: v.video_url, thumbnail_url: v.thumbnail_url,
        views: v.views, duration_seconds: v.duration_seconds,
      }));
      setFacebookVideos(items);
      setFacebookHasMore(!!data.has_more);
      setFacebookCursor(data.next_cursor || null);
    } catch (e: any) {
      setFacebookError(e.name === "AbortError" ? "Demorou demais pra responder (mais de 2 min). Tenta de novo — se continuar acontecendo, tenta com um link diferente ou me avisa." : e.message);
    } finally {
      clearTimeout(timeoutId);
      setFacebookLoading(false);
    }
  }

  async function loadMoreFacebookVideos() {
    if (!facebookPageInput.trim() || facebookLoadingMore || !facebookCursor) return;
    setFacebookLoadingMore(true);
    setFacebookError(null);
    // Mesmo motivo do timeout generoso da busca inicial — o backend pode
    // fazer até 8 chamadas internas antes de responder.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch(`${API}/facebook-dark/list-videos?page_url=${encodeURIComponent(facebookPageInput.trim())}&limit=${FACEBOOK_PAGE_SIZE}&cursor=${encodeURIComponent(facebookCursor)}`, { signal: controller.signal });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao carregar mais vídeos");
      }
      const data = await res.json();
      const items: ReelItem[] = (data.videos || []).map((v: any) => ({
        media_id: v.media_id, video_url: v.video_url, thumbnail_url: v.thumbnail_url,
        views: v.views, duration_seconds: v.duration_seconds,
      }));
      setFacebookVideos(prev => [...prev, ...items]);
      setFacebookHasMore(!!data.has_more);
      setFacebookCursor(data.next_cursor || null);
    } catch (e: any) {
      setFacebookError(e.name === "AbortError" ? "Demorou demais pra responder (mais de 2 min). Tenta de novo, ou usa os que já carregou." : e.message);
    } finally {
      clearTimeout(timeoutId);
      setFacebookLoadingMore(false);
    }
  }

  // Quando a SociaVault diz "acabou" (cursor null), nem sempre é
  // verdade — já vimos ela relatar fim bem cedo e, recomeçando a busca
  // do zero, aparecerem vídeos novos que ela tinha "esquecido". Essa
  // função recomeça do início mas só ACRESCENTA o que ainda não estava
  // na lista (compara por media_id) — não duplica, não perde o que já
  // tinha sido selecionado.
  async function retryFacebookSearchFromScratch() {
    if (!facebookPageInput.trim() || facebookLoadingMore) return;
    setFacebookLoadingMore(true);
    setFacebookError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch(`${API}/facebook-dark/list-videos?page_url=${encodeURIComponent(facebookPageInput.trim())}&limit=${FACEBOOK_PAGE_SIZE}`, { signal: controller.signal });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao buscar de novo");
      }
      const data = await res.json();
      const items: ReelItem[] = (data.videos || []).map((v: any) => ({
        media_id: v.media_id, video_url: v.video_url, thumbnail_url: v.thumbnail_url,
        views: v.views, duration_seconds: v.duration_seconds,
      }));
      setFacebookVideos(prev => {
        const existingIds = new Set(prev.map(v => v.media_id));
        const novos = items.filter(v => !existingIds.has(v.media_id));
        if (novos.length === 0) {
          setFacebookError("Buscou de novo e não achou nenhum vídeo novo — essa página realmente deve ter acabado mesmo.");
        }
        return [...prev, ...novos];
      });
      // Continua a paginação a partir dessa nova busca, caso ainda tenha mais.
      setFacebookHasMore(!!data.has_more);
      setFacebookCursor(data.next_cursor || null);
    } catch (e: any) {
      setFacebookError(e.name === "AbortError" ? "Demorou demais pra responder (mais de 2 min). Tenta de novo." : e.message);
    } finally {
      clearTimeout(timeoutId);
      setFacebookLoadingMore(false);
    }
  }
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

  const [configTab, setConfigTab] = useState<"bordas" | "titulo" | "inferior" | "sobreposicao" | "antiduplicacao">("bordas");

  const [antiDuplication, setAntiDuplication] = useState(false);
  const [speedVariation, setSpeedVariation] = useState(false);
  const [mirrorVideos, setMirrorVideos] = useState(false);

  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [overlayImageUrl, setOverlayImageUrl] = useState("");
  const [overlayImageUploading, setOverlayImageUploading] = useState(false);
  const [overlayPosition, setOverlayPosition] = useState<"top_left" | "top_right" | "bottom_left" | "bottom_right" | "center" | "custom">("bottom_right");
  const [overlayX, setOverlayX] = useState(85);
  const [overlayY, setOverlayY] = useState(90);
  const [overlayMargin, setOverlayMargin] = useState(20);
  const [overlayWidth, setOverlayWidth] = useState(20);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const overlayImageRef = useRef<HTMLInputElement>(null);

  const [titleEnabled, setTitleEnabled] = useState(false);
  const [titleMode, setTitleMode] = useState<"texto" | "imagem">("texto");
  const [titleLinesText, setTitleLinesText] = useState("");
  // Cada BLOCO (separado por linha em branco) vira o título de 1 vídeo,
  // ciclando se faltar bloco. Enter simples DENTRO de um bloco só quebra a
  // linha do mesmo título — não pula pro próximo vídeo. Isso resolve a
  // ambiguidade entre "quebrar linha" e "próximo vídeo".
  const titleBlocks = titleLinesText.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const [titleImageUrl, setTitleImageUrl] = useState("");
  const [titleImageUploading, setTitleImageUploading] = useState(false);
  const [titleX, setTitleX] = useState(50);
  const [titleY, setTitleY] = useState(12);
  const [titleFontSize, setTitleFontSize] = useState(6);
  const [titleColor, setTitleColor] = useState("#ffffff");
  const [titleFont, setTitleFont] = useState("sistema");
  const [titleCustomFontUrl, setTitleCustomFontUrl] = useState("");
  const [titleCustomFontUploading, setTitleCustomFontUploading] = useState(false);
  const titleImageRef = useRef<HTMLInputElement>(null);
  const titleFontFileRef = useRef<HTMLInputElement>(null);

  // Título ESPECÍFICO por vídeo — sobrepõe o ciclo de title_lines só pra
  // aquele vídeo. Guardado por chave (media_id do Reels, ou id do upload).
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>({});
  const [editingOverrideKey, setEditingOverrideKey] = useState<string | null>(null);

  const [bottomEnabled, setBottomEnabled] = useState(false);
  const [bottomMode, setBottomMode] = useState<"texto" | "imagem">("texto");
  const [bottomText, setBottomText] = useState("");
  const [bottomImageUrl, setBottomImageUrl] = useState("");
  const [bottomImageUploading, setBottomImageUploading] = useState(false);
  const [bottomX, setBottomX] = useState(50);
  const [bottomY, setBottomY] = useState(88);
  const [bottomFontSize, setBottomFontSize] = useState(4.5);
  const [bottomColor, setBottomColor] = useState("#ffffff");
  const [bottomFont, setBottomFont] = useState("sistema");
  const [bottomCustomFontUrl, setBottomCustomFontUrl] = useState("");
  const [bottomCustomFontUploading, setBottomCustomFontUploading] = useState(false);
  const bottomImageRef = useRef<HTMLInputElement>(null);
  const bottomFontFileRef = useRef<HTMLInputElement>(null);

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

  async function uploadCustomFont(file: File, onDone: (url: string) => void, setUploading: (v: boolean) => void) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/storage/upload/font`, { method: "POST", body: fd });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || "Falha ao enviar a fonte"); }
      const data = await res.json();
      onDone(data.url);
    } catch (e: any) {
      setBatchError(e.message || "Falha ao enviar a fonte (use .ttf ou .otf).");
    } finally {
      setUploading(false);
    }
  }

  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadAllProgress, setDownloadAllProgress] = useState({ done: 0, total: 0 });
  const [batchInsufficientCredits, setBatchInsufficientCredits] = useState<{ needed: number; have: number } | null>(null);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [repeatEveryN, setRepeatEveryN] = useState(1);

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

  // Carrega as fontes escolhíveis (Título/Inferior) direto do Google Fonts,
  // uma vez só — sem isso a prévia sempre mostra a fonte padrão do
  // navegador, mesmo escolhendo outra no seletor.
  useEffect(() => {
    const id = "instagram-dark-google-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Montserrat:wght@700&family=Oswald:wght@700&family=Poppins:wght@700&family=Raleway:wght@700&display=swap";
    document.head.appendChild(link);
  }, []);

  // Carrega as fontes PERSONALIZADAS (enviadas pelo usuário) via FontFace
  // API assim que a URL fica disponível — sem isso a prévia não sabe usar
  // um arquivo de fonte hospedado dinamicamente no R2.
  useEffect(() => {
    if (!titleCustomFontUrl) return;
    const font = new FontFace("IGDarkTitleCustom", `url(${titleCustomFontUrl})`);
    font.load().then(loaded => { (document as any).fonts.add(loaded); }).catch(() => {
      setBatchError("Não consegui carregar essa fonte personalizada na prévia (o vídeo final pode funcionar mesmo assim).");
    });
  }, [titleCustomFontUrl]);

  useEffect(() => {
    if (!bottomCustomFontUrl) return;
    const font = new FontFace("IGDarkBottomCustom", `url(${bottomCustomFontUrl})`);
    font.load().then(loaded => { (document as any).fonts.add(loaded); }).catch(() => {
      setBatchError("Não consegui carregar essa fonte personalizada na prévia (o vídeo final pode funcionar mesmo assim).");
    });
  }, [bottomCustomFontUrl]);

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

  const batchItems: { url: string; key: string }[] =
    batchSource === "existing" ? reels.filter(r => batchSelectedReels.has(r.media_id)).map(r => ({ url: r.video_url, key: r.media_id })) :
    batchSource === "tiktok" ? tiktokVideos.filter(v => tiktokSelected.has(v.media_id)).map(v => ({ url: v.video_url, key: v.media_id })) :
    batchSource === "facebook" ? facebookVideos.filter(v => facebookSelected.has(v.media_id)).map(v => ({ url: v.video_url, key: v.media_id })) :
    batchUploads.filter(u => u.url).map(u => ({ url: u.url, key: u.id }));
  const batchVideoUrls: string[] = batchItems.map(i => i.url);

  // Distribui os temas do campo principal (titleBlocks) entre os vídeos,
  // repetindo cada tema a cada N vídeos — ex: everyN=3 com 2 temas e 9
  // vídeos = tema 1 nos vídeos 1-3, tema 2 nos vídeos 4-6, tema 1 de novo
  // nos vídeos 7-9. Se não tiver tema nenhum digitado, não faz nada.
  function applyRepeatPattern(everyN: number) {
    if (titleBlocks.length === 0) {
      setBatchError("Digite pelo menos 1 título no campo principal antes de aplicar o padrão.");
      return;
    }
    const next: Record<string, string> = { ...titleOverrides };
    batchItems.forEach((item, idx) => {
      const themeIndex = Math.floor(idx / Math.max(1, everyN)) % titleBlocks.length;
      next[item.key] = titleBlocks[themeIndex];
    });
    setTitleOverrides(next);
  }

  async function startBatchProcess() {
    if (batchVideoUrls.length === 0) {
      setBatchError("Selecione ou envie ao menos 1 vídeo antes de processar!");
      return;
    }
    setBatchError(null);

    const batchCost = batchVideoUrls.length * BATCH_CREDITS_PER_VIDEO;
    const userId = await getUserId();
    if (!userId) { setBatchError("Não foi possível identificar seu usuário. Faça login novamente."); return; }

    // 1) DÉBITO — acontece ANTES de processar, igual ao resto do sistema.
    // Cobra por vídeo PROCESSADO (não por clique em "Baixar") — baixar
    // depois é sempre grátis, quantas vezes quiser.
    try {
      const debitRes = await fetch(`${API}/credits/debit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, amount: batchCost, description: `Editor em Massa — ${batchVideoUrls.length} vídeo${batchVideoUrls.length !== 1 ? "s" : ""}` }),
      });
      if (!debitRes.ok) {
        const err = await debitRes.json().catch(() => ({}));
        if (debitRes.status === 402) {
          setBatchInsufficientCredits({ needed: batchCost, have: userCredits });
        } else {
          setBatchError(err.detail || "Erro ao debitar créditos.");
        }
        return;
      }
      const debitData = await debitRes.json();
      setUserCredits(debitData.balance);
    } catch (e: any) {
      setBatchError(`Erro ao debitar créditos: ${e.message}`);
      return;
    }

    setBatchProcessing(true);
    setBatchProgress(0);
    setBatchResults([]);

    async function refundBatch(count: number, motivo: string) {
      if (count <= 0) return;
      try {
        const refundRes = await fetch(`${API}/credits/refund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, amount: count * BATCH_CREDITS_PER_VIDEO, description: `Estorno — ${motivo}` }),
        });
        const refundData = await refundRes.json().catch(() => null);
        if (refundData?.balance !== undefined) setUserCredits(refundData.balance);
      } catch {}
    }

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
          title_lines: titleEnabled && titleMode === "texto" ? titleBlocks : [],
          title_overrides: titleEnabled && titleMode === "texto" ? batchItems.map(i => titleOverrides[i.key]?.trim() || null) : [],
          title_image_url: titleEnabled && titleMode === "imagem" && titleImageUrl ? titleImageUrl : null,
          title_x_pct: titleX,
          title_y_pct: titleY,
          title_font_size_pct: titleFontSize,
          title_color: titleColor,
          title_font: titleFont,
          title_font_url: titleFont === "custom" && titleCustomFontUrl ? titleCustomFontUrl : null,
          bottom_text: bottomEnabled && bottomMode === "texto" && bottomText.trim() ? bottomText.trim() : null,
          bottom_image_url: bottomEnabled && bottomMode === "imagem" && bottomImageUrl ? bottomImageUrl : null,
          bottom_x_pct: bottomX,
          bottom_y_pct: bottomY,
          bottom_font_size_pct: bottomFontSize,
          bottom_color: bottomColor,
          bottom_font: bottomFont,
          bottom_font_url: bottomFont === "custom" && bottomCustomFontUrl ? bottomCustomFontUrl : null,
          overlay_image_url: overlayEnabled && overlayImageUrl ? overlayImageUrl : null,
          overlay_position: overlayPosition,
          overlay_x_pct: overlayX,
          overlay_y_pct: overlayY,
          overlay_margin_px: overlayMargin,
          overlay_width_pct: overlayWidth,
          overlay_opacity_pct: overlayOpacity,
          anti_duplication: antiDuplication,
          speed_variation: speedVariation,
          mirror_videos: mirrorVideos,
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
            // 2) ESTORNO — só dos vídeos que falharam, os que deram certo já foram cobrados
            const failedCount = (statusData.videos || []).filter((v: BatchResult) => v.status === "error").length;
            await refundBatch(failedCount, `${failedCount} vídeo${failedCount !== 1 ? "s" : ""} falhou no Editor em Massa`);
          } else if (attempts > maxAttempts) {
            clearInterval(poll);
            setBatchError("Timeout aguardando o processamento em lote.");
            setBatchProcessing(false);
            // Timeout total — não sabemos quantos deram certo, estorna o lote inteiro por segurança
            await refundBatch(batchVideoUrls.length, "timeout no Editor em Massa");
          }
        } catch { clearInterval(poll); setBatchProcessing(false); }
      }, 5000);
    } catch (e: any) {
      setBatchError(e.message);
      setBatchProcessing(false);
      await refundBatch(batchVideoUrls.length, e.message);
    }
  }

  // Prévia — usa o próprio <video> do arquivo (pega o frame real), não uma
  // thumbnail estática, pra funcionar tanto com Reels já buscados quanto
  // com upload novo. O usuário pode clicar num item da lista pra trocar
  // QUAL vídeo aparece na prévia — isso não muda o que é aplicado, já que
  // a configuração é sempre a mesma pra todos os vídeos do lote.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewVideoDims, setPreviewVideoDims] = useState<{ w: number; h: number } | null>(null);

  // Calcula exatamente a mesma matemática que o backend usa em
  // _build_filter (batch_editor.py) — corte de topo/rodapé, escala
  // "contain" + zoom, pad/crop conforme a posição — pra prévia bater
  // 1:1 com o resultado real do FFmpeg. Em vez de pré-cortar o vídeo
  // (precisaria de uma segunda camada de clip), posiciona o vídeo
  // INTEIRO deslocado pra cima pelo equivalente ao corte de topo já
  // escalado — o conteúdo cortado fica empurrado pra fora da área
  // visível do quadro, com o mesmo efeito visual final.
  function computePreviewVideoBox(srcW: number, srcH: number) {
    const CANVAS_W = 1080, CANVAS_H = 1920;
    const topPx = srcH * Math.max(0, Math.min(fillTop, 45)) / 100;
    const bottomPx = srcH * Math.max(0, Math.min(fillBottom, 45)) / 100;
    const croppedH = Math.max(2, srcH - topPx - bottomPx);

    const scaleBase = Math.min(CANVAS_W / srcW, CANVAS_H / croppedH);
    const zoomFactor = Math.max(zoom, 10) / 100;
    const scale = scaleBase * zoomFactor;

    const newW = srcW * scale;
    const newH = croppedH * scale;
    const padW = Math.max(newW, CANVAS_W);
    const padH = Math.max(newH, CANVAS_H);
    const padX = (padW - newW) * (posX / 100);
    const padY = (padH - newH) * (posY / 100);
    const cropX = (padW - CANVAS_W) * (posX / 100);
    const cropY = (padH - CANVAS_H) * (posY / 100);

    const fullRenderedW = srcW * scale;
    const fullRenderedH = srcH * scale;
    const left = padX - cropX;
    const top = padY - cropY - topPx * scale;

    return {
      widthPct: (fullRenderedW / CANVAS_W) * 100,
      heightPct: (fullRenderedH / CANVAS_H) * 100,
      leftPct: (left / CANVAS_W) * 100,
      topPct: (top / CANVAS_H) * 100,
    };
  }
  const effectivePreviewUrl = (previewUrl && batchVideoUrls.includes(previewUrl))
    ? previewUrl
    : (batchVideoUrls[0] || null);
  useEffect(() => { setPreviewVideoDims(null); }, [effectivePreviewUrl]);
  const effectivePreviewKey = batchItems.find(i => i.url === effectivePreviewUrl)?.key;
  const previewTitleText = (effectivePreviewKey && titleOverrides[effectivePreviewKey]?.trim())
    || titleBlocks[0]
    || "";

  // Prévia aproximada da posição da marca — converte os presets de canto
  // (que no backend usam margem em pixels reais) pra % do canvas, só pra
  // referência visual rápida.
  const CANVAS_PREVIEW_W = 1080, CANVAS_PREVIEW_H = 1920;
  function overlayPreviewXY(): { x: number; y: number } {
    if (overlayPosition === "custom") return { x: overlayX, y: overlayY };
    if (overlayPosition === "center") return { x: 50, y: 50 };
    const marginXPct = (overlayMargin / CANVAS_PREVIEW_W) * 100;
    const marginYPct = (overlayMargin / CANVAS_PREVIEW_H) * 100;
    const halfWPct = overlayWidth / 2;
    const halfHPct = halfWPct; // aproximação — não sabemos a altura real da imagem aqui
    switch (overlayPosition) {
      case "top_left": return { x: marginXPct + halfWPct, y: marginYPct + halfHPct };
      case "top_right": return { x: 100 - marginXPct - halfWPct, y: marginYPct + halfHPct };
      case "bottom_left": return { x: marginXPct + halfWPct, y: 100 - marginYPct - halfHPct };
      case "bottom_right": return { x: 100 - marginXPct - halfWPct, y: 100 - marginYPct - halfHPct };
      default: return { x: overlayX, y: overlayY };
    }
  }
  const overlayPreview = overlayPreviewXY();

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
          <div className="flex items-center gap-3.5">
            <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "conic-gradient(from 220deg, #833AB4, #FD1D1D, #F77737, #FCAF45, #833AB4)", boxShadow: "0 6px 20px rgba(253,29,29,0.35)" }}>
              <div className="w-[calc(100%-4px)] h-[calc(100%-4px)] rounded-[14px] flex items-center justify-center" style={{ background: "#0a0a0f" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3c-3 2.2-4.8 5.3-4.8 9 0 5 4 9 8.8 9-3.6 1.3-7.8.4-10.5-2.6C1.8 14.4 2 9 5.5 5.4 7.4 3.5 9.7 2.6 12 3z" fill="url(#igMoonGrad)" />
                  <circle cx="16.5" cy="7" r="1.4" fill="#FCAF45" />
                  <defs>
                    <linearGradient id="igMoonGrad" x1="2" y1="3" x2="17" y2="21" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#F77737" /><stop offset="1" stopColor="#833AB4" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight mb-0.5" style={{
                background: "linear-gradient(90deg, #F77737, #FD1D1D, #833AB4)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>Instagram Dark</h1>
              <p className="text-sm text-[#8a8aa0]">Baixe Reels e monte com faixa, texto e marca d'água — em lote.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl" style={{ background: "rgba(252,175,69,0.1)", border: "0.5px solid rgba(252,175,69,0.3)" }}>
            <span className="font-bold text-[15px]" style={{ color: "#FCAF45" }}>{userCredits.toLocaleString()}</span>
            <span className="text-[#c9a56a]">créditos</span>
          </div>
        </div>

        {/* Aviso de uso */}
        <div className="rounded-xl p-4" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "#f59e0b" }}>⚠️ Antes de usar, leia:</p>
          <p className="text-xs leading-relaxed" style={{ color: "#d4a45a" }}>
            <strong>Não baixe vídeos com rosto de outras pessoas</strong> — isso viola direito de imagem. Use essa ferramenta apenas com vídeos sem pessoas identificáveis. O vídeo baixado continua sendo trabalho autoral de quem criou — você assume a responsabilidade pelo uso que fizer do conteúdo.
          </p>
        </div>

        {/* Abas — cada uma com identidade de cor própria */}
        <div className="flex gap-2.5 flex-wrap">
          {[
            { id: "perfil", label: "Buscar por perfil", icon: "🔍", grad: "linear-gradient(135deg,#833AB4,#5851DB)", glow: "rgba(131,58,180,0.35)" },
            { id: "link", label: "Link de um Reels", icon: "🔗", grad: "linear-gradient(135deg,#5B51D8,#3897F0)", glow: "rgba(56,151,240,0.35)" },
            { id: "tiktok", label: "TikTok", icon: "🎵", grad: "linear-gradient(135deg,#000000,#ee1d52)", glow: "rgba(238,29,82,0.35)" },
            { id: "facebook", label: "Facebook", icon: "👥", grad: "linear-gradient(135deg,#0064e0,#00c6ff)", glow: "rgba(0,100,224,0.35)" },
            { id: "lote", label: "Editor em Massa", icon: "🎛️", grad: "linear-gradient(135deg,#FD1D1D,#F77737)", glow: "rgba(247,119,55,0.35)" },
          ].map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id as any)}
              className="px-5 py-3 rounded-2xl text-sm font-semibold cursor-pointer border-none transition-all flex items-center gap-2"
              style={tab === t.id
                ? { background: t.grad, color: "#fff", boxShadow: `0 6px 18px ${t.glow}`, transform: "translateY(-1px)" }
                : { background: "rgba(255,255,255,0.04)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.09)" }}>
              <span>{t.icon}</span> {t.label}
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

        {/* ═══════════ Aba TikTok — busca por perfil ═══════════ */}
        {tab === "tiktok" && (
          <>
            <div className="rounded-2xl p-5" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
              <label className="text-xs font-medium text-[#9090a8] block mb-2">@usuário ou link do perfil no TikTok</label>
              <div className="flex gap-2">
                <input type="text" value={tiktokProfileInput} onChange={e => setTiktokProfileInput(e.target.value)}
                  placeholder="https://tiktok.com/@perfil ou @perfil"
                  onKeyDown={e => e.key === "Enter" && searchTiktokVideos()}
                  className="flex-1 h-11 px-3 rounded-[8px] text-sm outline-none placeholder-[#3a3a4a]"
                  style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
                <button type="button" onClick={searchTiktokVideos} disabled={tiktokLoading}
                  className="px-5 h-11 rounded-[8px] text-sm font-semibold cursor-pointer border-none disabled:opacity-50"
                  style={{ background: "#7c6df5", color: "#fff" }}>
                  {tiktokLoading ? "Buscando..." : "Buscar"}
                </button>
              </div>
            </div>

            {tiktokError && <p className="text-xs text-[#f87171] -mt-3">{tiktokError}</p>}

            {tiktokVideos.length > 0 && (
              <div className="rounded-2xl p-5" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-[#9090a8]">{tiktokVideos.length} vídeos encontrados — {tiktokSelected.size} selecionados</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setTiktokSelected(new Set(tiktokVideos.map(v => v.media_id)))}
                      className="text-[11px] px-2.5 py-1 rounded-[6px] cursor-pointer border-none" style={{ background: "rgba(124,109,245,0.15)", color: "#a99cf8" }}>Selecionar todos</button>
                    <button type="button" onClick={() => setTiktokSelected(new Set())}
                      className="text-[11px] px-2.5 py-1 rounded-[6px] cursor-pointer border-none" style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>Limpar</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {tiktokVideos.map(v => (
                    <div key={v.media_id} onClick={() => setTiktokSelected(prev => { const n = new Set(prev); n.has(v.media_id) ? n.delete(v.media_id) : n.add(v.media_id); return n; })}
                      className="relative rounded-xl overflow-hidden cursor-pointer"
                      style={{ aspectRatio: "9/16", border: tiktokSelected.has(v.media_id) ? "2px solid #7c6df5" : "1px solid rgba(255,255,255,0.1)" }}>
                      {v.thumbnail_url ? <img src={v.thumbnail_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-[#55556a]">sem prévia</div>}
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: tiktokSelected.has(v.media_id) ? "#7c6df5" : "rgba(0,0,0,0.5)" }}>
                        {tiktokSelected.has(v.media_id) && <span className="text-white text-xs">✓</span>}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-white" style={{ background: "linear-gradient(transparent,rgba(0,0,0,0.8))" }}>
                        👁 {v.views.toLocaleString()} · {Math.round(v.duration_seconds)}s
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => goToEditorWith("tiktok")} disabled={tiktokSelected.size === 0}
                  className="w-full mt-4 h-11 rounded-[10px] text-sm font-semibold cursor-pointer border-none disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff" }}>
                  🎛️ Editar {tiktokSelected.size} vídeo{tiktokSelected.size !== 1 ? "s" : ""} no Editor em Massa
                </button>
              </div>
            )}
          </>
        )}

        {/* ═══════════ Aba Facebook — busca por página ═══════════ */}
        {tab === "facebook" && (
          <>
            <div className="rounded-2xl p-5" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
              <label className="text-xs font-medium text-[#9090a8] block mb-2">Link da página do Facebook</label>
              <div className="flex gap-2">
                <input type="text" value={facebookPageInput} onChange={e => setFacebookPageInput(e.target.value)}
                  placeholder="https://facebook.com/nomedapagina"
                  onKeyDown={e => e.key === "Enter" && searchFacebookVideos()}
                  className="flex-1 h-11 px-3 rounded-[8px] text-sm outline-none placeholder-[#3a3a4a]"
                  style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
                <button type="button" onClick={searchFacebookVideos} disabled={facebookLoading}
                  className="px-5 h-11 rounded-[8px] text-sm font-semibold cursor-pointer border-none disabled:opacity-50"
                  style={{ background: "#7c6df5", color: "#fff" }}>
                  {facebookLoading ? "Buscando..." : "Buscar"}
                </button>
              </div>
              <p className="text-[10px] text-[#55556a] mt-2">Cada busca consome créditos da API (SociaVault) — o progresso fica salvo mesmo se você atualizar a página, então não se preocupa em perder o que já buscou.</p>
            </div>

            {facebookError && <p className="text-xs text-[#f87171] -mt-3">{facebookError}</p>}

            {facebookVideos.length > 0 && (
              <div className="rounded-2xl p-5" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-[#9090a8]">{facebookVideos.length} vídeos encontrados — {facebookSelected.size} selecionados</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setFacebookSelected(new Set(facebookVideos.map(v => v.media_id)))}
                      className="text-[11px] px-2.5 py-1 rounded-[6px] cursor-pointer border-none" style={{ background: "rgba(124,109,245,0.15)", color: "#a99cf8" }}>Selecionar todos</button>
                    <button type="button" onClick={() => setFacebookSelected(new Set())}
                      className="text-[11px] px-2.5 py-1 rounded-[6px] cursor-pointer border-none" style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>Limpar</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {facebookVideos.map(v => (
                    <div key={v.media_id} onClick={() => setFacebookSelected(prev => { const n = new Set(prev); n.has(v.media_id) ? n.delete(v.media_id) : n.add(v.media_id); return n; })}
                      className="relative rounded-xl overflow-hidden cursor-pointer"
                      style={{ aspectRatio: "9/16", border: facebookSelected.has(v.media_id) ? "2px solid #7c6df5" : "1px solid rgba(255,255,255,0.1)" }}>
                      {v.thumbnail_url ? <img src={v.thumbnail_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-[#55556a]">sem prévia</div>}
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: facebookSelected.has(v.media_id) ? "#7c6df5" : "rgba(0,0,0,0.5)" }}>
                        {facebookSelected.has(v.media_id) && <span className="text-white text-xs">✓</span>}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-white" style={{ background: "linear-gradient(transparent,rgba(0,0,0,0.8))" }}>
                        👁 {v.views.toLocaleString()} · {Math.round(v.duration_seconds)}s
                      </div>
                    </div>
                  ))}
                </div>
                {facebookHasMore && (
                  <button type="button" onClick={loadMoreFacebookVideos} disabled={facebookLoadingMore}
                    className="w-full mt-3 h-10 rounded-[8px] text-xs font-medium cursor-pointer border-none disabled:opacity-50"
                    style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8", border: "0.5px solid rgba(255,255,255,0.1)" }}>
                    {facebookLoadingMore ? "Carregando mais..." : "Carregar mais vídeos"}
                  </button>
                )}
                {!facebookHasMore && facebookVideos.length > 0 && (
                  <button type="button" onClick={retryFacebookSearchFromScratch} disabled={facebookLoadingMore}
                    className="w-full mt-3 h-10 rounded-[8px] text-xs font-medium cursor-pointer border-none disabled:opacity-50"
                    style={{ background: "rgba(124,109,245,0.1)", color: "#a99cf8", border: "0.5px dashed rgba(124,109,245,0.3)" }}>
                    {facebookLoadingMore ? "Buscando de novo..." : "🔄 A página disse que acabou — tentar buscar mais uma vez"}
                  </button>
                )}
                <button type="button" onClick={() => goToEditorWith("facebook")} disabled={facebookSelected.size === 0}
                  className="w-full mt-4 h-11 rounded-[10px] text-sm font-semibold cursor-pointer border-none disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff" }}>
                  🎛️ Editar {facebookSelected.size} vídeo{facebookSelected.size !== 1 ? "s" : ""} no Editor em Massa
                </button>
              </div>
            )}
          </>
        )}


        {error && (tab === "perfil" || tab === "link") && <p className="text-xs text-[#f87171] -mt-3">{error}</p>}

        {/* Grid de reels (aba Buscar/Link) */}
        {(tab === "perfil" || tab === "link") && reels.length > 0 && (
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
        {(tab === "perfil" || tab === "link") && reels.length > 0 && (
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
                      <video src={r.final_url} className="w-full" style={{ aspectRatio: "9/16" }} controls />
                      <button type="button" onClick={() => downloadVideoBlob(r.final_url as string, `reel-${Date.now()}.mp4`)}
                        className="block w-full text-center py-2 text-xs no-underline cursor-pointer border-none" style={{ background: "transparent", color: "#3ecf8e" }}>⬇️ Baixar</button>
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
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_380px] gap-5 items-start">

              {/* ── Coluna esquerda: origem + lista de vídeos ── */}
              <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                <div className="flex gap-1 p-1 rounded-[10px] flex-wrap" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                  {[{ id: "existing", label: "📋 Instagram" }, { id: "tiktok", label: "🎵 TikTok" }, { id: "facebook", label: "👥 Facebook" }, { id: "upload", label: "⬆️ Upload" }].map(s => (
                    <button key={s.id} type="button" onClick={() => setBatchSource(s.id as any)}
                      className="flex-1 px-2 py-1.5 rounded-[8px] text-[10px] font-medium cursor-pointer border-none transition-all whitespace-nowrap"
                      style={batchSource === s.id ? { background: "#7c6df5", color: "#fff" } : { background: "transparent", color: "#9090a8" }}>
                      {s.label}
                    </button>
                  ))}
                </div>

                {batchSource === "existing" && (
                  reels.length === 0 ? (
                    <p className="text-[11px] text-[#55556a] leading-relaxed">Nenhum Reels buscado ainda — vá na aba "Buscar por perfil", ou troque de origem.</p>
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
                          const hasOverride = !!titleOverrides[reel.media_id]?.trim();
                          const isEditingThis = editingOverrideKey === reel.media_id;
                          return (
                            <div key={reel.media_id} className="flex flex-col gap-1.5">
                              <div
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
                                {titleEnabled && titleMode === "texto" && (
                                  <button type="button" onClick={e => { e.stopPropagation(); setEditingOverrideKey(isEditingThis ? null : reel.media_id); }}
                                    title="Título só deste vídeo"
                                    className="text-[10px] px-1.5 py-0.5 rounded-[5px] cursor-pointer border-none flex-shrink-0"
                                    style={hasOverride ? { background: "rgba(62,207,142,0.2)", color: "#3ecf8e" } : { background: "rgba(255,255,255,0.06)", color: "#55556a" }}>
                                    ✏️
                                  </button>
                                )}
                              </div>
                              {isEditingThis && (
                                <input type="text" autoFocus value={titleOverrides[reel.media_id] || ""}
                                  onChange={e => setTitleOverrides(prev => ({ ...prev, [reel.media_id]: e.target.value }))}
                                  onKeyDown={e => e.key === "Enter" && setEditingOverrideKey(null)}
                                  placeholder="Título só pra esse vídeo (deixe vazio pra usar o ciclo normal)"
                                  className="w-full px-2.5 py-1.5 rounded-[6px] text-[10px] outline-none placeholder-[#3a3a4a]"
                                  style={{ color: "#f0f0f5", background: "rgba(62,207,142,0.06)", border: "0.5px solid rgba(62,207,142,0.3)" }} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )
                )}

                {batchSource === "tiktok" && (
                  <>
                    <button type="button" onClick={() => setTab("tiktok")}
                      className="w-full py-2 rounded-[8px] text-[11px] font-medium cursor-pointer border-none flex items-center justify-center gap-1.5"
                      style={{ background: "rgba(124,109,245,0.1)", color: "#a99cf8", border: "0.5px dashed rgba(124,109,245,0.3)" }}>
                      🔍 Buscar mais vídeos no TikTok
                    </button>
                    {tiktokVideos.length === 0 ? (
                      <p className="text-[11px] text-[#55556a] leading-relaxed">Nenhum vídeo do TikTok buscado ainda — clica acima pra buscar por perfil.</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-[#55556a]">{tiktokSelected.size} de {tiktokVideos.length}</p>
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => setTiktokSelected(new Set(tiktokVideos.map(v => v.media_id)))}
                              className="text-[10px] px-2 py-0.5 rounded-[6px] cursor-pointer border-none" style={{ background: "rgba(124,109,245,0.15)", color: "#a99cf8" }}>Todos</button>
                            <button type="button" onClick={() => setTiktokSelected(new Set())}
                              className="text-[10px] px-2 py-0.5 rounded-[6px] cursor-pointer border-none" style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>Limpar</button>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 max-h-[480px] overflow-y-auto">
                          {tiktokVideos.map(v => {
                            const isSelected = tiktokSelected.has(v.media_id);
                            const isPreviewing = effectivePreviewUrl === v.video_url;
                            return (
                              <div key={v.media_id}
                                className="flex items-center gap-2 px-2 py-2 rounded-[8px] cursor-pointer"
                                style={{ background: isPreviewing ? "rgba(124,109,245,0.15)" : "rgba(255,255,255,0.03)", border: isPreviewing ? "1px solid rgba(124,109,245,0.4)" : "1px solid transparent" }}
                                onClick={() => setPreviewUrl(v.video_url)}>
                                <div onClick={e => { e.stopPropagation(); setTiktokSelected(prev => { const n = new Set(prev); n.has(v.media_id) ? n.delete(v.media_id) : n.add(v.media_id); return n; }); }}
                                  className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 cursor-pointer"
                                  style={{ background: isSelected ? "#7c6df5" : "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
                                  {isSelected && <span className="text-white text-[9px]">✓</span>}
                                </div>
                                {v.thumbnail_url && (
                                  <div className="w-8 rounded overflow-hidden flex-shrink-0" style={{ aspectRatio: "9/16" }}>
                                    <img src={v.thumbnail_url} className="w-full h-full object-cover" alt="" />
                                  </div>
                                )}
                                <span className="text-[10px] text-[#9090a8] truncate flex-1">{Math.round(v.duration_seconds)}s · {v.views.toLocaleString()} views</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </>
                )}

                {batchSource === "facebook" && (
                  <>
                    <button type="button" onClick={() => setTab("facebook")}
                      className="w-full py-2 rounded-[8px] text-[11px] font-medium cursor-pointer border-none flex items-center justify-center gap-1.5"
                      style={{ background: "rgba(124,109,245,0.1)", color: "#a99cf8", border: "0.5px dashed rgba(124,109,245,0.3)" }}>
                      🔍 Buscar mais vídeos no Facebook
                    </button>
                    {facebookVideos.length === 0 ? (
                      <p className="text-[11px] text-[#55556a] leading-relaxed">Nenhum vídeo do Facebook buscado ainda — clica acima pra buscar por página.</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-[#55556a]">{facebookSelected.size} de {facebookVideos.length}</p>
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => setFacebookSelected(new Set(facebookVideos.map(v => v.media_id)))}
                              className="text-[10px] px-2 py-0.5 rounded-[6px] cursor-pointer border-none" style={{ background: "rgba(124,109,245,0.15)", color: "#a99cf8" }}>Todos</button>
                            <button type="button" onClick={() => setFacebookSelected(new Set())}
                              className="text-[10px] px-2 py-0.5 rounded-[6px] cursor-pointer border-none" style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>Limpar</button>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 max-h-[480px] overflow-y-auto">
                          {facebookVideos.map(v => {
                            const isSelected = facebookSelected.has(v.media_id);
                            const isPreviewing = effectivePreviewUrl === v.video_url;
                            return (
                              <div key={v.media_id}
                                className="flex items-center gap-2 px-2 py-2 rounded-[8px] cursor-pointer"
                                style={{ background: isPreviewing ? "rgba(124,109,245,0.15)" : "rgba(255,255,255,0.03)", border: isPreviewing ? "1px solid rgba(124,109,245,0.4)" : "1px solid transparent" }}
                                onClick={() => setPreviewUrl(v.video_url)}>
                                <div onClick={e => { e.stopPropagation(); setFacebookSelected(prev => { const n = new Set(prev); n.has(v.media_id) ? n.delete(v.media_id) : n.add(v.media_id); return n; }); }}
                                  className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 cursor-pointer"
                                  style={{ background: isSelected ? "#7c6df5" : "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
                                  {isSelected && <span className="text-white text-[9px]">✓</span>}
                                </div>
                                {v.thumbnail_url && (
                                  <div className="w-8 rounded overflow-hidden flex-shrink-0" style={{ aspectRatio: "9/16" }}>
                                    <img src={v.thumbnail_url} className="w-full h-full object-cover" alt="" />
                                  </div>
                                )}
                                <span className="text-[10px] text-[#9090a8] truncate flex-1">{Math.round(v.duration_seconds)}s · {v.views.toLocaleString()} views</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </>
                )}

                {batchSource === "upload" && (
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
                          const hasOverride = !!titleOverrides[u.id]?.trim();
                          const isEditingThis = editingOverrideKey === u.id;
                          return (
                            <div key={u.id} className="flex flex-col gap-1.5">
                              <div
                                className="flex items-center gap-2 px-2 py-2 rounded-[8px] cursor-pointer"
                                style={{ background: isPreviewing ? "rgba(124,109,245,0.15)" : "rgba(255,255,255,0.03)", border: isPreviewing ? "1px solid rgba(124,109,245,0.4)" : "1px solid transparent" }}
                                onClick={() => u.url && setPreviewUrl(u.url)}>
                                <span className="text-[10px] text-[#9090a8] truncate flex-1">{u.name}</span>
                                {u.uploading ? (
                                  <span className="text-[9px] text-[#60a5fa] flex-shrink-0">Enviando...</span>
                                ) : (
                                  <>
                                    {titleEnabled && titleMode === "texto" && (
                                      <button type="button" onClick={e => { e.stopPropagation(); setEditingOverrideKey(isEditingThis ? null : u.id); }}
                                        title="Título só deste vídeo"
                                        className="text-[10px] px-1.5 py-0.5 rounded-[5px] cursor-pointer border-none flex-shrink-0"
                                        style={hasOverride ? { background: "rgba(62,207,142,0.2)", color: "#3ecf8e" } : { background: "rgba(255,255,255,0.06)", color: "#55556a" }}>
                                        ✏️
                                      </button>
                                    )}
                                    <button type="button" onClick={e => { e.stopPropagation(); removeBatchUpload(u.id); }}
                                      className="text-[9px] px-1.5 py-0.5 rounded-[6px] cursor-pointer border-none flex-shrink-0" style={{ background: "rgba(248,113,113,0.1)", color: "#f87171" }}>
                                      Remover
                                    </button>
                                  </>
                                )}
                              </div>
                              {isEditingThis && (
                                <input type="text" autoFocus value={titleOverrides[u.id] || ""}
                                  onChange={e => setTitleOverrides(prev => ({ ...prev, [u.id]: e.target.value }))}
                                  onKeyDown={e => e.key === "Enter" && setEditingOverrideKey(null)}
                                  placeholder="Título só pra esse vídeo (deixe vazio pra usar o ciclo normal)"
                                  className="w-full px-2.5 py-1.5 rounded-[6px] text-[10px] outline-none placeholder-[#3a3a4a]"
                                  style={{ color: "#f0f0f5", background: "rgba(62,207,142,0.06)", border: "0.5px solid rgba(62,207,142,0.3)" }} />
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
                        loop
                        playsInline
                        controls
                        onLoadedMetadata={e => setPreviewVideoDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
                        className="absolute"
                        style={previewVideoDims ? (() => {
                          const box = computePreviewVideoBox(previewVideoDims.w, previewVideoDims.h);
                          return {
                            width: `${box.widthPct}%`, height: `${box.heightPct}%`,
                            left: `${box.leftPct}%`, top: `${box.topPct}%`,
                          };
                        })() : {
                          // Enquanto os metadados reais não carregam, mostra
                          // preenchendo o quadro todo — evita salto visual
                          // grande assim que o vídeo carrega de verdade.
                          width: "100%", height: "100%", left: 0, top: 0, objectFit: "contain",
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-[#55556a] text-center px-4">
                        Selecione ou envie um vídeo pra ver a prévia
                      </div>
                    )}

                    {/* Prévia do título (texto ou imagem) */}
                    {titleEnabled && titleMode === "texto" && previewTitleText && (
                      <div className="absolute px-2 text-center font-bold pointer-events-none"
                        style={{
                          left: `${titleX}%`, top: `${titleY}%`, transform: "translate(-50%,-50%)",
                          color: titleColor, fontSize: `${titleFontSize * 3.6}px`,
                          fontFamily: titleFont === "custom" ? "'IGDarkTitleCustom', sans-serif" : (FONT_CSS_FAMILY[titleFont] || "inherit"),
                          textShadow: "0 0 3px #000, 0 0 3px #000, 0 0 3px #000, 1px 1px 2px #000",
                          whiteSpace: "pre", overflow: "visible", lineHeight: 1.25,
                        }}>
                        {previewTitleText}
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
                          fontFamily: bottomFont === "custom" ? "'IGDarkBottomCustom', sans-serif" : (FONT_CSS_FAMILY[bottomFont] || "inherit"),
                          textShadow: "0 0 3px #000, 0 0 3px #000, 0 0 3px #000, 1px 1px 2px #000",
                          whiteSpace: "pre", overflow: "visible", lineHeight: 1.25,
                        }}>
                        {bottomText}
                      </div>
                    )}
                    {bottomEnabled && bottomMode === "imagem" && bottomImageUrl && (
                      <img src={bottomImageUrl} alt="" className="absolute pointer-events-none"
                        style={{ left: `${bottomX}%`, top: `${bottomY}%`, transform: "translate(-50%,-50%)", width: `${bottomFontSize}%`, height: "auto" }} />
                    )}

                    {/* Prévia da marca/logo (Fase 3) */}
                    {overlayEnabled && overlayImageUrl && (
                      <img src={overlayImageUrl} alt="" className="absolute pointer-events-none"
                        style={{
                          left: `${overlayPreview.x}%`, top: `${overlayPreview.y}%`, transform: "translate(-50%,-50%)",
                          width: `${overlayWidth}%`, height: "auto", opacity: overlayOpacity / 100,
                        }} />
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
                <div className="flex gap-1 p-1 rounded-[10px] flex-wrap" style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                  {[{ id: "bordas", label: "Bordas" }, { id: "titulo", label: "Título" }, { id: "inferior", label: "Inferior" }, { id: "sobreposicao", label: "Marca" }, { id: "antiduplicacao", label: "Anti-dup" }].map(t => (
                    <button key={t.id} type="button" onClick={() => setConfigTab(t.id as any)}
                      className="flex-1 px-2 py-1.5 rounded-[8px] text-[10px] font-medium cursor-pointer border-none transition-all whitespace-nowrap"
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
                            <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Título por vídeo — separe com uma linha em branco (Enter simples só quebra a linha do mesmo título)</label>
                            <textarea value={titleLinesText} onChange={e => setTitleLinesText(e.target.value)}
                              placeholder={"madame ka moda\nfeminina\n\npróximo vídeo aqui"} rows={6}
                              className="w-full px-3 py-2.5 rounded-[8px] text-xs resize-none outline-none placeholder-[#3a3a4a]"
                              style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", lineHeight: "1.6" }} />
                            <p className="text-[10px] text-[#55556a] mt-1">{titleBlocks.length} título{titleBlocks.length !== 1 ? "s" : ""}</p>
                            {batchItems.length > 0 && (
                              <button type="button" onClick={() => setShowTitleModal(true)}
                                className="w-full mt-2 py-2 rounded-[8px] text-[11px] font-medium cursor-pointer border-none"
                                style={{ background: "rgba(62,207,142,0.1)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.3)" }}>
                                📝 Definir título de cada vídeo individualmente ({batchItems.length} vídeo{batchItems.length !== 1 ? "s" : ""})
                              </button>
                            )}
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
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Fonte</label>
                          <select value={titleFont} onChange={e => setTitleFont(e.target.value)}
                            className="w-full h-9 px-3 rounded-[8px] text-xs outline-none cursor-pointer"
                            style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }}>
                            {FONT_OPTIONS.map(f => <option key={f.id} value={f.id} style={{ background: "#131318" }}>{f.label}</option>)}
                          </select>
                          {titleFont === "custom" && (
                            <div className="mt-1.5">
                              <div onClick={() => titleFontFileRef.current?.click()}
                                className="flex items-center gap-2 px-3 py-2 rounded-[8px] cursor-pointer"
                                style={{ background: "rgba(124,109,245,0.05)", border: "0.5px dashed rgba(124,109,245,0.3)" }}>
                                <span>🔤</span>
                                <span className="text-[11px] text-[#9090a8]">
                                  {titleCustomFontUploading ? "Enviando..." : titleCustomFontUrl ? "Fonte enviada ✓ — clique pra trocar" : "Clique pra enviar (.ttf ou .otf)"}
                                </span>
                              </div>
                              <input ref={titleFontFileRef} type="file" accept=".ttf,.otf" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadCustomFont(f, setTitleCustomFontUrl, setTitleCustomFontUploading); }} />
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">
                            {titleMode === "imagem" ? `Largura da imagem: ${titleFontSize}%` : `Tamanho do texto: ${titleFontSize}%`}
                          </label>
                          <input type="range" min={2} max={titleMode === "imagem" ? 100 : 40} step={0.5} value={titleFontSize} onChange={e => setTitleFontSize(Number(e.target.value))} className="w-full" />
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
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Fonte</label>
                          <select value={bottomFont} onChange={e => setBottomFont(e.target.value)}
                            className="w-full h-9 px-3 rounded-[8px] text-xs outline-none cursor-pointer"
                            style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }}>
                            {FONT_OPTIONS.map(f => <option key={f.id} value={f.id} style={{ background: "#131318" }}>{f.label}</option>)}
                          </select>
                          {bottomFont === "custom" && (
                            <div className="mt-1.5">
                              <div onClick={() => bottomFontFileRef.current?.click()}
                                className="flex items-center gap-2 px-3 py-2 rounded-[8px] cursor-pointer"
                                style={{ background: "rgba(124,109,245,0.05)", border: "0.5px dashed rgba(124,109,245,0.3)" }}>
                                <span>🔤</span>
                                <span className="text-[11px] text-[#9090a8]">
                                  {bottomCustomFontUploading ? "Enviando..." : bottomCustomFontUrl ? "Fonte enviada ✓ — clique pra trocar" : "Clique pra enviar (.ttf ou .otf)"}
                                </span>
                              </div>
                              <input ref={bottomFontFileRef} type="file" accept=".ttf,.otf" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadCustomFont(f, setBottomCustomFontUrl, setBottomCustomFontUploading); }} />
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">
                            {bottomMode === "imagem" ? `Largura da imagem: ${bottomFontSize}%` : `Tamanho do texto: ${bottomFontSize}%`}
                          </label>
                          <input type="range" min={2} max={bottomMode === "imagem" ? 100 : 40} step={0.5} value={bottomFontSize} onChange={e => setBottomFontSize(Number(e.target.value))} className="w-full" />
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

                {configTab === "sobreposicao" && (
                  <>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-[#9090a8]">Marca/logo (igual em todos)</label>
                      <button type="button" onClick={() => setOverlayEnabled(v => !v)}
                        className="w-9 h-5 rounded-full cursor-pointer border-none relative flex-shrink-0"
                        style={{ background: overlayEnabled ? "#7c6df5" : "rgba(255,255,255,0.15)" }}>
                        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: overlayEnabled ? "18px" : "2px" }} />
                      </button>
                    </div>
                    {overlayEnabled && (
                      <>
                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Imagem (logo, marca-d'água, etc)</label>
                          <div onClick={() => overlayImageRef.current?.click()}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] cursor-pointer"
                            style={{ background: "rgba(124,109,245,0.05)", border: "0.5px dashed rgba(124,109,245,0.3)" }}>
                            {overlayImageUrl ? <img src={overlayImageUrl} className="w-9 h-9 rounded object-cover" alt="" /> : <span>🏷️</span>}
                            <span className="text-[11px] text-[#9090a8]">
                              {overlayImageUploading ? "Enviando..." : overlayImageUrl ? "Enviada — clique pra trocar" : "Clique pra enviar"}
                            </span>
                          </div>
                          <input ref={overlayImageRef} type="file" accept="image/*" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadOverlayImage(f, setOverlayImageUrl, setOverlayImageUploading); }} />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-2">Posição</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button type="button" onClick={() => setOverlayPosition("top_left")}
                              className="py-2 rounded-[8px] text-[10px] cursor-pointer border-none"
                              style={overlayPosition === "top_left" ? { background: "#7c6df5", color: "#fff" } : { background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>↖ Sup. esq.</button>
                            <button type="button" onClick={() => setOverlayPosition("center")}
                              className="py-2 rounded-[8px] text-[10px] cursor-pointer border-none"
                              style={overlayPosition === "center" ? { background: "#7c6df5", color: "#fff" } : { background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>● Centro</button>
                            <button type="button" onClick={() => setOverlayPosition("top_right")}
                              className="py-2 rounded-[8px] text-[10px] cursor-pointer border-none"
                              style={overlayPosition === "top_right" ? { background: "#7c6df5", color: "#fff" } : { background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>↗ Sup. dir.</button>
                            <button type="button" onClick={() => setOverlayPosition("bottom_left")}
                              className="py-2 rounded-[8px] text-[10px] cursor-pointer border-none"
                              style={overlayPosition === "bottom_left" ? { background: "#7c6df5", color: "#fff" } : { background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>↙ Inf. esq.</button>
                            <button type="button" onClick={() => setOverlayPosition("custom")}
                              className="py-2 rounded-[8px] text-[10px] cursor-pointer border-none"
                              style={overlayPosition === "custom" ? { background: "#7c6df5", color: "#fff" } : { background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>✥ Livre</button>
                            <button type="button" onClick={() => setOverlayPosition("bottom_right")}
                              className="py-2 rounded-[8px] text-[10px] cursor-pointer border-none"
                              style={overlayPosition === "bottom_right" ? { background: "#7c6df5", color: "#fff" } : { background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>↘ Inf. dir.</button>
                          </div>
                        </div>

                        {overlayPosition === "custom" ? (
                          <>
                            <div>
                              <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Posição X: {overlayX}%</label>
                              <input type="range" min={0} max={100} value={overlayX} onChange={e => setOverlayX(Number(e.target.value))} className="w-full" />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Posição Y: {overlayY}%</label>
                              <input type="range" min={0} max={100} value={overlayY} onChange={e => setOverlayY(Number(e.target.value))} className="w-full" />
                            </div>
                          </>
                        ) : overlayPosition !== "center" && (
                          <div>
                            <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Margem da borda: {overlayMargin}px</label>
                            <input type="range" min={0} max={120} value={overlayMargin} onChange={e => setOverlayMargin(Number(e.target.value))} className="w-full" />
                          </div>
                        )}

                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Tamanho: {overlayWidth}% da largura</label>
                          <input type="range" min={5} max={60} value={overlayWidth} onChange={e => setOverlayWidth(Number(e.target.value))} className="w-full" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-[#9090a8] block mb-1.5">Opacidade: {overlayOpacity}%</label>
                          <input type="range" min={10} max={100} value={overlayOpacity} onChange={e => setOverlayOpacity(Number(e.target.value))} className="w-full" />
                        </div>
                      </>
                    )}
                  </>
                )}

                {configTab === "antiduplicacao" && (
                  <>
                    <p className="text-[11px] text-[#55556a] leading-relaxed">
                      Cada opção abaixo aplica uma variação <strong>aleatória e diferente em cada vídeo</strong> do lote — mesmo vindo da mesma fonte, cada resultado fica com uma "assinatura" própria, o que ajuda a reduzir detecção de conteúdo duplicado entre posts/contas.
                    </p>

                    <div className="flex items-center justify-between px-3 py-2.5 rounded-[8px]" style={{ background: "rgba(255,255,255,0.03)" }}>
                      <div>
                        <p className="text-xs font-medium text-[#f0f0f5]">Variação de zoom e cor</p>
                        <p className="text-[10px] text-[#55556a] mt-0.5">Zoom (até 2,5%), brilho, contraste e saturação levemente diferentes por vídeo</p>
                      </div>
                      <button type="button" onClick={() => setAntiDuplication(v => !v)}
                        className="w-9 h-5 rounded-full cursor-pointer border-none relative flex-shrink-0 ml-3"
                        style={{ background: antiDuplication ? "#7c6df5" : "rgba(255,255,255,0.15)" }}>
                        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: antiDuplication ? "18px" : "2px" }} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between px-3 py-2.5 rounded-[8px]" style={{ background: "rgba(255,255,255,0.03)" }}>
                      <div>
                        <p className="text-xs font-medium text-[#f0f0f5]">Variação de velocidade</p>
                        <p className="text-[10px] text-[#55556a] mt-0.5">~1.02x mais rápido (vídeo + áudio sincronizados)</p>
                      </div>
                      <button type="button" onClick={() => setSpeedVariation(v => !v)}
                        className="w-9 h-5 rounded-full cursor-pointer border-none relative flex-shrink-0 ml-3"
                        style={{ background: speedVariation ? "#7c6df5" : "rgba(255,255,255,0.15)" }}>
                        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: speedVariation ? "18px" : "2px" }} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between px-3 py-2.5 rounded-[8px]" style={{ background: "rgba(255,255,255,0.03)" }}>
                      <div>
                        <p className="text-xs font-medium text-[#f0f0f5]">Espelhar vídeos</p>
                        <p className="text-[10px] text-[#55556a] mt-0.5">Inverte horizontalmente — cuidado: também inverte texto/logo já embutido no vídeo original</p>
                      </div>
                      <button type="button" onClick={() => setMirrorVideos(v => !v)}
                        className="w-9 h-5 rounded-full cursor-pointer border-none relative flex-shrink-0 ml-3"
                        style={{ background: mirrorVideos ? "#7c6df5" : "rgba(255,255,255,0.15)" }}>
                        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: mirrorVideos ? "18px" : "2px" }} />
                      </button>
                    </div>
                  </>
                )}

                {batchError && <p className="text-xs text-[#f87171]">{batchError}</p>}

                {batchVideoUrls.length > 0 && (
                  <div className="rounded-[10px] px-3.5 py-2.5 flex items-center justify-between" style={{ background: "rgba(96,165,250,0.08)", border: "0.5px solid rgba(96,165,250,0.2)" }}>
                    <span className="text-[11px] text-[#9090a8]">{batchVideoUrls.length} vídeo{batchVideoUrls.length !== 1 ? "s" : ""} × {BATCH_CREDITS_PER_VIDEO}cr</span>
                    <span className="text-sm font-bold text-[#60a5fa]">{batchVideoUrls.length * BATCH_CREDITS_PER_VIDEO} créditos</span>
                  </div>
                )}

                <button type="button" onClick={startBatchProcess} disabled={batchProcessing}
                  className="w-full h-12 rounded-[10px] text-sm font-semibold cursor-pointer border-none disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff" }}>
                  {batchProcessing ? `Processando... ${batchProgress}%` : `Processar ${batchVideoUrls.length} vídeo${batchVideoUrls.length !== 1 ? "s" : ""} (${batchVideoUrls.length * BATCH_CREDITS_PER_VIDEO} cr)`}
                </button>
                <p className="text-[10px] text-[#55556a] text-center -mt-2">Cobra só na hora de processar — baixar depois é sempre grátis, quantas vezes quiser.</p>
              </div>
            </div>

            {/* Resultados do lote */}
            {batchResults.length > 0 && (
              <div className="rounded-2xl p-5" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">Resultado do lote</p>
                  {batchResults.some(r => r.status === "done" && r.final_url) && (
                    <button type="button" disabled={downloadingAll}
                      onClick={async () => {
                        const items = batchResults
                          .filter(r => r.status === "done" && r.final_url)
                          .map((r, i) => ({ url: r.final_url as string, filename: `video-lote-${i + 1}.mp4` }));
                        setDownloadingAll(true);
                        setDownloadAllProgress({ done: 0, total: items.length });
                        try {
                          await downloadAllAsZip(items, `clipforge-lote-${Date.now()}.zip`, (done, total) => setDownloadAllProgress({ done, total }));
                        } catch (e: any) {
                          setBatchError(e.message || "Erro ao baixar o ZIP com todos os vídeos.");
                        }
                        setDownloadingAll(false);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium cursor-pointer border-none disabled:opacity-50"
                      style={{ background: "rgba(62,207,142,0.15)", color: "#3ecf8e", border: "0.5px solid rgba(62,207,142,0.3)" }}>
                      {downloadingAll ? "⏳ Gerando ZIP..." : "⬇️ Baixar todos (.zip)"}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {batchResults.map((r, i) => (
                    <div key={i} className="rounded-xl overflow-hidden" style={{ border: "0.5px solid rgba(255,255,255,0.1)" }}>
                      {r.status === "done" && r.final_url ? (
                        <>
                          <video src={r.final_url} className="w-full" style={{ aspectRatio: "9/16" }} controls />
                          <button type="button" onClick={() => downloadVideoBlob(r.final_url as string, `video-lote-${i + 1}.mp4`)}
                            className="block w-full text-center py-2 text-xs cursor-pointer border-none" style={{ background: "transparent", color: "#3ecf8e" }}>⬇️ Baixar</button>
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

      {/* Modal de título por vídeo (Editor em Massa) */}
      {showTitleModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={() => setShowTitleModal(false)}>
          <div className="rounded-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[85vh] flex flex-col" style={{ background: "#131318", border: "1px solid rgba(255,255,255,0.1)" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)" }}>
              <div>
                <p className="text-sm font-bold text-[#f0f0f5]">Título de cada vídeo</p>
                <p className="text-[10px] text-[#55556a]">{batchItems.length} vídeo{batchItems.length !== 1 ? "s" : ""} nesse lote</p>
              </div>
              <button onClick={() => setShowTitleModal(false)} className="w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer text-[#55556a]" style={{ background: "rgba(255,255,255,0.05)" }}>✕</button>
            </div>

            {titleBlocks.length > 0 && (
              <div className="px-5 py-3 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)", background: "rgba(124,109,245,0.05)" }}>
                <span className="text-[11px] text-[#9090a8] flex-shrink-0">Repetir tema a cada</span>
                <select value={repeatEveryN} onChange={e => setRepeatEveryN(Number(e.target.value))}
                  className="h-8 px-2 rounded-[6px] text-xs outline-none cursor-pointer"
                  style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.08)", border: "0.5px solid rgba(255,255,255,0.15)" }}>
                  {[1, 2, 3, 4, 5, 10].map(n => <option key={n} value={n} style={{ background: "#131318" }}>{n}</option>)}
                </select>
                <span className="text-[11px] text-[#9090a8] flex-shrink-0">vídeo{repeatEveryN !== 1 ? "s" : ""}</span>
                <button type="button" onClick={() => applyRepeatPattern(repeatEveryN)}
                  className="ml-auto px-3 py-1.5 rounded-[6px] text-[11px] font-medium cursor-pointer border-none flex-shrink-0"
                  style={{ background: "#7c6df5", color: "#fff" }}>
                  Aplicar
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
              {batchItems.map((item, idx) => {
                const defaultTitle = titleBlocks.length > 0 ? titleBlocks[idx % titleBlocks.length] : "";
                return (
                  <div key={item.key} className="flex items-center gap-2">
                    <span className="text-[10px] text-[#55556a] w-14 flex-shrink-0">Vídeo {idx + 1}</span>
                    <input type="text" value={titleOverrides[item.key] || ""}
                      onChange={e => setTitleOverrides(prev => ({ ...prev, [item.key]: e.target.value }))}
                      placeholder={defaultTitle || "(sem título)"}
                      className="flex-1 h-9 px-2.5 rounded-[6px] text-xs outline-none placeholder-[#3a3a4a]"
                      style={{ color: "#f0f0f5", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)" }} />
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: "0.5px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[10px] text-[#55556a] mb-2">Campo vazio usa o ciclo normal do campo principal (placeholder mostrado em cinza).</p>
              <button type="button" onClick={() => setShowTitleModal(false)} className="w-full h-10 rounded-[8px] text-sm font-semibold cursor-pointer border-none" style={{ background: "#7c6df5", color: "#fff" }}>Concluído</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de créditos insuficientes (Editor em Massa) */}
      {batchInsufficientCredits && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="rounded-2xl p-7 max-w-sm w-full mx-4" style={{ background: "#131318", border: "1px solid rgba(255,255,255,0.1)" }}>
            <h3 className="text-[17px] font-bold text-[#f0f0f5] text-center mb-2">Créditos insuficientes</h3>
            <p className="text-[13px] text-[#9090a8] text-center leading-relaxed mb-5">
              Precisa de <strong className="text-[#f87171]">{batchInsufficientCredits.needed} créditos</strong>, você tem <strong className="text-[#f0f0f5]">{batchInsufficientCredits.have}</strong>.
            </p>
            <div className="flex flex-col gap-2">
              <a href="/dashboard/settings" className="w-full h-11 rounded-[10px] text-sm font-semibold flex items-center justify-center gap-2 no-underline" style={{ background: "#7c6df5", color: "#fff" }}>⚡ Recarregar créditos</a>
              <button type="button" onClick={() => setBatchInsufficientCredits(null)} className="w-full h-10 rounded-[10px] text-sm cursor-pointer border-none" style={{ background: "rgba(255,255,255,0.05)", color: "#9090a8" }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

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
