# ─────────────────────────────────────────────────────────────
# backend/routers/batch_editor.py
# Editor em Massa (Instagram Dark) — Fase 1: Bordas/Enquadramento.
# Recebe uma lista de vídeos (já no R2, sejam de Reels selecionados
# ou upload novo) + UMA config única de zoom/posição/cor/corte, e
# aplica a MESMA edição em todos. Se o usuário quiser um vídeo
# diferente, ele processa separado (1 vídeo por vez) — decisão
# tomada de propósito pra manter a v1 simples.
#
# Fases futuras (não implementadas ainda): Título, Texto inferior,
# Overlay/marca d'água, Modo anti-duplicidade.
# ─────────────────────────────────────────────────────────────

import asyncio
import json
import logging
import os
import tempfile
import uuid
from io import BytesIO
from typing import List, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont

from config import get_settings
from routers.storage import get_r2_client

router = APIRouter()
settings = get_settings()
logger = logging.getLogger("batch_editor")

CANVAS_W = 1080
CANVAS_H = 1920

# Fonte padrão ("Sistema") — arquivo incluído no repo em backend/assets/fonts/,
# pra não depender de fontes instaladas no sistema do Render.
_FONT_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "fonts", "DejaVuSans-Bold.ttf")

# Outras fontes — baixadas SOB DEMANDA do Google Fonts (repo oficial no
# GitHub) na primeira vez que forem usadas, e cacheadas em disco depois
# disso. Evita precisar commitar um arquivo de fonte por opção no repo.
FONT_SOURCES: dict[str, str] = {
    "poppins": "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Bold.ttf",
    "anton": "https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
    "bebas_neue": "https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf",
    "montserrat": "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf",
    "raleway": "https://raw.githubusercontent.com/google/fonts/main/ofl/raleway/Raleway%5Bwght%5D.ttf",
    "oswald": "https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf",
}
_font_file_cache: dict[str, str] = {}   # nome da fonte -> caminho local já baixado
_font_cache: dict[str, "ImageFont.FreeTypeFont"] = {}  # "caminho:tamanho" -> objeto de fonte pronto

# Estado dos jobs em memória — mesmo padrão já usado no resto do backend
# (kling_elements.py, etc). Em produção com múltiplos workers isso devia
# ir pro Redis, mas roda bem com WEB_CONCURRENCY=1.
_job_state: dict[str, dict] = {}


class BatchEditRequest(BaseModel):
    videos: List[str]              # URLs já públicas no R2 (Reels selecionados OU upload novo)
    zoom: float = 100.0            # % — usado só quando border_mode="manual"
    pos_x: float = 50.0            # % — posição horizontal (0=esquerda, 50=centro, 100=direita)
    pos_y: float = 50.0            # % — posição vertical (0=topo, 50=centro, 100=rodapé)
    border_color: str = "#ffffff"  # cor de preenchimento das bordas, em hex
    fill_top_pct: float = 0.0      # % do vídeo ORIGINAL cortado no topo (remove legenda/marca antiga)
    fill_bottom_pct: float = 0.0   # % do vídeo ORIGINAL cortado no rodapé
    fill_mode: str = "manual"      # "automatico" ainda não implementado nessa fase — cai pro manual

    # "manual" = usa o campo `zoom` literalmente pra todos (pode gerar
    # bordas de tamanhos diferentes se os vídeos tiverem proporções
    # diferentes). "automatico" = calcula o zoom SEPARADAMENTE pra cada
    # vídeo, de forma que a borda final bata sempre com `border_target_pct`,
    # não importa a proporção original de cada vídeo.
    border_mode: str = "manual"
    border_target_pct: float = 10.0  # % de borda desejada (topo+rodapé juntos), só usado no modo automático

    # ── Fase 2: Título (cicla 1 linha por vídeo) + Texto inferior (fixo em todos) ──
    # Cada um pode ser TEXTO ou IMAGEM — se a URL de imagem vier preenchida,
    # ela tem prioridade sobre o texto correspondente.
    title_lines: List[str] = []        # cada bloco vira o título de 1 vídeo, na ordem; cicla se faltar bloco
    title_overrides: List[Optional[str]] = []  # título ESPECÍFICO por vídeo (index-alinhado com `videos`) — tem prioridade sobre title_lines quando preenchido
    title_image_url: Optional[str] = None
    title_x_pct: float = 50.0
    title_y_pct: float = 12.0
    title_font_size_pct: float = 6.0   # também usado como LARGURA da imagem (% do canvas) quando title_image_url está setado
    title_color: str = "#ffffff"
    title_font: str = "sistema"        # chave de FONT_SOURCES, ou "sistema" pra DejaVu (padrão)

    bottom_text: Optional[str] = None  # mesmo texto em TODOS os vídeos do lote
    bottom_image_url: Optional[str] = None
    bottom_x_pct: float = 50.0
    bottom_y_pct: float = 88.0
    bottom_font_size_pct: float = 4.5  # também usado como LARGURA da imagem quando bottom_image_url está setado
    bottom_color: str = "#ffffff"
    bottom_font: str = "sistema"

    # ── Fase 3: Overlay (marca/logotipo) — igual em todos os vídeos, pode
    # ficar em qualquer lugar do quadro (não só topo/rodapé como Título/
    # Inferior), com opacidade ajustável (marca d'água de verdade). ──
    overlay_image_url: Optional[str] = None
    overlay_position: str = "custom"  # "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center" | "custom"
    overlay_x_pct: float = 85.0       # só usado quando overlay_position="custom"
    overlay_y_pct: float = 90.0
    overlay_margin_px: float = 20.0   # só usado nos presets de canto (top_left, etc)
    overlay_width_pct: float = 20.0   # largura da marca, % da largura do canvas
    overlay_opacity_pct: float = 100.0


async def _run(cmd: list[str]) -> tuple[int, bytes, bytes]:
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    out, err = await proc.communicate()
    return proc.returncode, out, err


async def _probe_dimensions(url: str) -> tuple[int, int]:
    """Descobre largura/altura do vídeo de origem via ffprobe, direto na
    URL pública do R2 — sem precisar baixar o arquivo manualmente antes."""
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "json", url,
    ]
    code, out, err = await _run(cmd)
    if code != 0:
        raise RuntimeError(f"ffprobe falhou: {err.decode(errors='ignore')[-500:]}")
    data = json.loads(out)
    if not data.get("streams"):
        raise RuntimeError(f"ffprobe não encontrou stream de vídeo: {out.decode(errors='ignore')}")
    stream = data["streams"][0]
    return int(stream["width"]), int(stream["height"])


def _hex_to_ffmpeg_color(hex_color: str) -> str:
    """FFmpeg espera 0xRRGGBB — converte a partir de '#rrggbb'."""
    h = (hex_color or "").lstrip("#")
    if len(h) != 6:
        h = "ffffff"
    return f"0x{h}"


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = (hex_color or "").lstrip("#")
    if len(h) != 6:
        h = "ffffff"
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore


async def _ensure_font_downloaded(client: httpx.AsyncClient, font_name: str) -> str:
    """Garante que a fonte escolhida está disponível localmente. 'Sistema'
    já vem no repo; as outras são baixadas do Google Fonts na primeira vez
    e ficam cacheadas em disco pras próximas chamadas."""
    key = (font_name or "sistema").strip().lower()
    if key not in FONT_SOURCES:
        return _FONT_PATH  # "sistema" ou nome desconhecido -> fonte padrão

    if key in _font_file_cache:
        return _font_file_cache[key]

    url = FONT_SOURCES[key]
    local_path = os.path.join(tempfile.gettempdir(), f"font_{key}.ttf")
    try:
        res = await client.get(url, timeout=20)
        if res.status_code == 200 and res.content:
            with open(local_path, "wb") as f:
                f.write(res.content)
            _font_file_cache[key] = local_path
            return local_path
        logger.error(f"[batch_editor] falha ao baixar fonte '{key}' (HTTP {res.status_code}) — usando Sistema")
    except Exception as e:
        logger.error(f"[batch_editor] erro ao baixar fonte '{key}': {e} — usando Sistema")
    return _FONT_PATH


def _load_font(font_path: str, size_px: int) -> "ImageFont.FreeTypeFont":
    size_px = max(10, size_px)
    cache_key = f"{font_path}:{size_px}"
    if cache_key in _font_cache:
        return _font_cache[cache_key]
    try:
        font = ImageFont.truetype(font_path, size_px)
        # Fontes variáveis (Montserrat/Raleway/Oswald baixadas como um único
        # arquivo [wght]) abrem no peso padrão, que costuma ser mais fino do
        # que "Bold" — tenta forçar o eixo de peso pra 700 (bold). Se a
        # fonte não for variável ou o Pillow/FreeType não suportar, ignora
        # silenciosamente e usa o peso padrão mesmo.
        try:
            font.set_variation_by_axes([700])
        except Exception:
            pass
    except Exception as e:
        logger.error(f"[batch_editor] não consegui carregar a fonte em {font_path}: {e} — usando fonte padrão (vai ficar pequena)")
        font = ImageFont.load_default()
    _font_cache[cache_key] = font
    return font


def _draw_text_block(draw: "ImageDraw.ImageDraw", text: str, x_pct: float, y_pct: float,
                      font_size_pct: float, color_hex: str, font_path: str) -> None:
    """Desenha um bloco de texto centralizado no ponto (x_pct, y_pct) do
    canvas, com contorno preto pra legibilidade em cima de qualquer vídeo.
    NÃO quebra linha automaticamente por largura — respeita só as quebras
    de linha (\\n) que o usuário digitou. Se uma linha for larga demais e
    estourar a lateral do canvas, ela estoura mesmo — controle é manual,
    por decisão do usuário (evita palavras "pulando" de linha sozinhas
    quando o tamanho da fonte aumenta)."""
    if not text or not text.strip():
        return

    font_size = int(CANVAS_H * font_size_pct / 100)
    font = _load_font(font_path, font_size)
    lines = text.split("\n")

    line_height = int(font_size * 1.25)
    total_height = line_height * len(lines)
    cx = CANVAS_W * (x_pct / 100)
    top_y = CANVAS_H * (y_pct / 100) - total_height / 2

    color = _hex_to_rgb(color_hex)
    outline_w = max(2, font_size // 16)

    for i, line in enumerate(lines):
        line_w = draw.textlength(line, font=font)
        lx = cx - line_w / 2
        ly = top_y + i * line_height
        # Contorno preto (desenha o texto deslocado em várias direções antes
        # do texto principal) — garante leitura mesmo em fundo claro/vídeo.
        for dx in (-outline_w, 0, outline_w):
            for dy in (-outline_w, 0, outline_w):
                if dx == 0 and dy == 0:
                    continue
                draw.text((lx + dx, ly + dy), line, font=font, fill=(0, 0, 0, 255))
        draw.text((lx, ly), line, font=font, fill=(*color, 255))


async def _fetch_image(client: httpx.AsyncClient, url: str) -> Optional[Image.Image]:
    """Baixa uma imagem (logo, foto de persona, etc) de uma URL pública do
    R2 pra colar no overlay. Retorna None se falhar, em vez de derrubar o
    processamento inteiro do vídeo por causa de UMA imagem."""
    try:
        res = await client.get(url, timeout=20)
        if res.status_code != 200:
            logger.error(f"[batch_editor] falha ao baixar imagem de overlay ({res.status_code}): {url}")
            return None
        return Image.open(BytesIO(res.content)).convert("RGBA")
    except Exception as e:
        logger.error(f"[batch_editor] erro ao baixar/abrir imagem de overlay {url}: {e}")
        return None


def _paste_image_block(canvas: Image.Image, img: Image.Image, x_pct: float, y_pct: float, width_pct: float) -> None:
    """Cola uma imagem (com transparência preservada) centralizada no ponto
    (x_pct, y_pct), redimensionada pra `width_pct` da largura do canvas,
    mantendo a proporção original da imagem."""
    target_w = max(10, int(CANVAS_W * width_pct / 100))
    ratio = target_w / img.width
    target_h = max(10, int(img.height * ratio))
    resized = img.resize((target_w, target_h), Image.LANCZOS)

    cx = CANVAS_W * (x_pct / 100)
    cy = CANVAS_H * (y_pct / 100)
    px = int(cx - target_w / 2)
    py = int(cy - target_h / 2)

    canvas.alpha_composite(resized, (px, py))


def _resolve_overlay_position(position: str, margin_px: float, img_w_px: int, img_h_px: int) -> tuple[Optional[float], Optional[float]]:
    """Converte um preset de canto no ponto central (x_pct, y_pct) onde a
    marca deve ficar, já contando a margem em pixels a partir da borda do
    canvas. Retorna (None, None) se a posição não for um preset conhecido."""
    margin_x_pct = (margin_px / CANVAS_W) * 100
    margin_y_pct = (margin_px / CANVAS_H) * 100
    half_w_pct = (img_w_px / 2 / CANVAS_W) * 100
    half_h_pct = (img_h_px / 2 / CANVAS_H) * 100

    presets = {
        "top_left": (margin_x_pct + half_w_pct, margin_y_pct + half_h_pct),
        "top_right": (100 - margin_x_pct - half_w_pct, margin_y_pct + half_h_pct),
        "bottom_left": (margin_x_pct + half_w_pct, 100 - margin_y_pct - half_h_pct),
        "bottom_right": (100 - margin_x_pct - half_w_pct, 100 - margin_y_pct - half_h_pct),
        "center": (50.0, 50.0),
    }
    return presets.get(position, (None, None))


async def _apply_overlay_mark(client: httpx.AsyncClient, img: Image.Image, req: BatchEditRequest) -> None:
    """Cola a marca/logo (Fase 3) por cima do PNG de overlay já montado —
    igual em todos os vídeos, com opacidade e posição configuráveis. Pode
    ficar em qualquer canto ou ponto do quadro, diferente de Título/
    Inferior que ficam restritos à faixa de cima/baixo."""
    if not req.overlay_image_url:
        return
    mark = await _fetch_image(client, req.overlay_image_url)
    if not mark:
        return

    # Opacidade — multiplica o canal alfa existente (preserva transparência
    # já presente num PNG, por ex. um logo já recortado).
    opacity = max(0.0, min(req.overlay_opacity_pct, 100.0)) / 100.0
    if opacity < 1.0:
        alpha = mark.split()[-1].point(lambda p: int(p * opacity))
        mark.putalpha(alpha)

    target_w = max(10, int(CANVAS_W * req.overlay_width_pct / 100))
    ratio = target_w / mark.width
    target_h = max(10, int(mark.height * ratio))

    if req.overlay_position == "custom":
        x_pct, y_pct = req.overlay_x_pct, req.overlay_y_pct
    else:
        x_pct, y_pct = _resolve_overlay_position(req.overlay_position, req.overlay_margin_px, target_w, target_h)
        if x_pct is None:
            x_pct, y_pct = req.overlay_x_pct, req.overlay_y_pct

    _paste_image_block(img, mark, x_pct, y_pct, req.overlay_width_pct)


def _cropped_source_dims(src_w: int, src_h: int, req: BatchEditRequest) -> tuple[int, int]:
    """Dimensões do vídeo DEPOIS do corte manual de topo/rodapé (fill_top/
    fill_bottom), mas ANTES de qualquer escala/zoom. Usado tanto no cálculo
    do filtro final quanto no cálculo de zoom automático (border_mode)."""
    top_px = int(src_h * max(0.0, min(req.fill_top_pct, 45.0)) / 100)
    bottom_px = int(src_h * max(0.0, min(req.fill_bottom_pct, 45.0)) / 100)
    cropped_h = max(2, src_h - top_px - bottom_px)
    return src_w, cropped_h


def _compute_auto_zoom_pct(cw: int, ch: int, border_target_pct: float) -> float:
    """Calcula o zoom (%) necessário PRA ESSE VÍDEO ESPECÍFICO de forma que
    a borda final bata com border_target_pct, normalizando a diferença
    entre vídeos de proporções diferentes (é isso que resolve o problema
    de bordas desiguais entre vídeos no mesmo lote)."""
    scale_base = min(CANVAS_W / cw, CANVAS_H / ch)
    rendered_w = cw * scale_base
    rendered_h = ch * scale_base
    slack_w = CANVAS_W - rendered_w
    slack_h = CANVAS_H - rendered_h

    # O eixo com folga (slack positivo) é onde a borda aparece — o outro já
    # encosta nas bordas do canvas quando zoom=100%.
    if slack_h >= slack_w:
        axis_canvas, axis_rendered_at_100 = CANVAS_H, rendered_h
    else:
        axis_canvas, axis_rendered_at_100 = CANVAS_W, rendered_w

    target_total_border = axis_canvas * (border_target_pct * 2 / 100)  # os dois lados somados
    target_total_border = max(0.0, min(target_total_border, axis_canvas * 0.9))  # limite de segurança

    if axis_rendered_at_100 <= 0:
        return 100.0

    z = (axis_canvas - target_total_border) / axis_rendered_at_100
    z_pct = z * 100.0
    return max(20.0, min(z_pct, 400.0))  # limites de segurança pra não gerar um zoom absurdo


def _build_filter(src_w: int, src_h: int, req: BatchEditRequest, effective_zoom_pct: float) -> str:
    """Monta a cadeia de filtros do FFmpeg pra encaixar o vídeo no canvas
    1080x1920 com zoom/posição/bordas. Os números são calculados aqui em
    Python (pixels concretos) em vez de expressões dentro do FFmpeg —
    mais fácil de depurar e logar se algo sair errado.
    `effective_zoom_pct` já vem pronto de fora — pode ser o req.zoom
    literal (modo manual) ou o zoom calculado por vídeo (modo automático)."""

    # 1) Corte manual de topo/rodapé do vídeo ORIGINAL — remove legenda,
    #    marca d'água ou faixa que já veio queimada no vídeo fonte.
    src_w_c, cropped_h = _cropped_source_dims(src_w, src_h, req)
    top_px = int(src_h * max(0.0, min(req.fill_top_pct, 45.0)) / 100)
    crop_source = f"crop={src_w}:{cropped_h}:0:{top_px}"

    # 2) Escala pra caber no canvas ("contain") + fator de zoom por cima.
    scale_base = min(CANVAS_W / src_w, CANVAS_H / cropped_h)
    zoom_factor = max(effective_zoom_pct, 10.0) / 100.0
    scale = scale_base * zoom_factor

    new_w = max(2, int(round(src_w * scale / 2) * 2))   # sempre par — requisito do libx264
    new_h = max(2, int(round(cropped_h * scale / 2) * 2))
    scale_filter = f"scale={new_w}:{new_h}"

    # 3) Preenche até pelo menos o tamanho do canvas (cobre zoom < 100%),
    #    na cor escolhida, deslocado conforme a posição — não sempre
    #    centralizado.
    pad_w = max(new_w, CANVAS_W)
    pad_h = max(new_h, CANVAS_H)
    pad_x = int((pad_w - new_w) * (req.pos_x / 100))
    pad_y = int((pad_h - new_h) * (req.pos_y / 100))
    color = _hex_to_ffmpeg_color(req.border_color)
    pad_filter = f"pad={pad_w}:{pad_h}:{pad_x}:{pad_y}:color={color}"

    # 4) Corta pro tamanho exato do canvas (cobre zoom > 100%, onde o
    #    vídeo escalado ficou maior que 1080x1920 e precisa recortar o
    #    excesso), também respeitando a posição escolhida.
    crop_x = int((pad_w - CANVAS_W) * (req.pos_x / 100))
    crop_y = int((pad_h - CANVAS_H) * (req.pos_y / 100))
    final_crop = f"crop={CANVAS_W}:{CANVAS_H}:{crop_x}:{crop_y}"

    return f"{crop_source},{scale_filter},{pad_filter},{final_crop}"


async def _render_overlay_png(client: httpx.AsyncClient, title_text: Optional[str], req: BatchEditRequest) -> Optional[bytes]:
    """Gera um PNG transparente 1080x1920 com título + texto inferior — cada
    um podendo ser TEXTO ou IMAGEM (logo/foto). Retorna None se não há nada
    pra desenhar, assim o FFmpeg nem precisa do segundo input nesse caso."""
    has_title_text = bool(title_text and title_text.strip())
    has_title_image = bool(req.title_image_url)
    has_bottom_text = bool(req.bottom_text and req.bottom_text.strip())
    has_bottom_image = bool(req.bottom_image_url)
    has_overlay_mark = bool(req.overlay_image_url)

    if not any([has_title_text, has_title_image, has_bottom_text, has_bottom_image, has_overlay_mark]):
        return None

    img = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Imagem tem prioridade sobre texto em cada slot (título / inferior).
    if has_title_image:
        title_img = await _fetch_image(client, req.title_image_url)  # type: ignore
        if title_img:
            _paste_image_block(img, title_img, req.title_x_pct, req.title_y_pct, req.title_font_size_pct)
    elif has_title_text:
        title_font_path = await _ensure_font_downloaded(client, req.title_font)
        _draw_text_block(draw, title_text or "", req.title_x_pct, req.title_y_pct, req.title_font_size_pct, req.title_color, title_font_path)

    if has_bottom_image:
        bottom_img = await _fetch_image(client, req.bottom_image_url)  # type: ignore
        if bottom_img:
            _paste_image_block(img, bottom_img, req.bottom_x_pct, req.bottom_y_pct, req.bottom_font_size_pct)
    elif has_bottom_text:
        bottom_font_path = await _ensure_font_downloaded(client, req.bottom_font)
        _draw_text_block(draw, req.bottom_text or "", req.bottom_x_pct, req.bottom_y_pct, req.bottom_font_size_pct, req.bottom_color, bottom_font_path)

    # Overlay/marca (Fase 3) — sempre por cima do título/inferior, já que é
    # tipicamente um logo/marca-d'água que deve ficar visível acima de tudo.
    if has_overlay_mark:
        await _apply_overlay_mark(client, img, req)

    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def _process_one(job_id: str, index: int, video_url: str, req: BatchEditRequest):
    state = _job_state[job_id]
    out_path = None
    overlay_path = None
    try:
        src_w, src_h = await _probe_dimensions(video_url)

        # Zoom efetivo: literal (manual) ou calculado por vídeo (automático,
        # normaliza a borda entre vídeos de proporções diferentes).
        if req.border_mode == "automatico":
            cw, ch = _cropped_source_dims(src_w, src_h, req)
            effective_zoom = _compute_auto_zoom_pct(cw, ch, req.border_target_pct)
            logger.info(f"[batch_editor] job={job_id} idx={index} border_mode=automatico zoom_calculado={effective_zoom:.1f}%")
        else:
            effective_zoom = req.zoom

        vf = _build_filter(src_w, src_h, req, effective_zoom)
        logger.info(f"[batch_editor] job={job_id} idx={index} filtro={vf}")

        # Título — prioridade: (1) título ESPECÍFICO desse vídeo
        # (title_overrides, definido manualmente pra 1 vídeo só), senão
        # (2) cicla os blocos de title_lines na ordem dos vídeos.
        title_text = None
        if index < len(req.title_overrides) and req.title_overrides[index]:
            title_text = req.title_overrides[index]
        elif req.title_lines:
            title_text = req.title_lines[index % len(req.title_lines)]

        async with httpx.AsyncClient() as client:
            overlay_png = await _render_overlay_png(client, title_text, req)

        out_path = os.path.join(tempfile.gettempdir(), f"batch_{job_id}_{index}.mp4")

        if overlay_png:
            overlay_path = os.path.join(tempfile.gettempdir(), f"batch_{job_id}_{index}_overlay.png")
            with open(overlay_path, "wb") as f:
                f.write(overlay_png)

            cmd = [
                "ffmpeg", "-y", "-i", video_url, "-i", overlay_path,
                "-filter_complex", f"[0:v]{vf}[base];[base][1:v]overlay=0:0[outv]",
                "-map", "[outv]", "-map", "0:a?",
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                "-threads", "1",
                out_path,
            ]
        else:
            cmd = [
                "ffmpeg", "-y", "-i", video_url,
                "-vf", vf,
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                "-threads", "1",
                out_path,
            ]

        code, _, err = await _run(cmd)
        if code != 0:
            raise RuntimeError(f"ffmpeg falhou: {err.decode(errors='ignore')[-800:]}")

        with open(out_path, "rb") as f:
            data = f.read()

        key = f"batch-editor/{job_id}/{index}_{uuid.uuid4().hex[:8]}.mp4"
        r2 = get_r2_client()
        r2.put_object(
            Bucket=settings.r2_bucket_name, Key=key, Body=data,
            ContentType="video/mp4", CacheControl="public, max-age=31536000",
        )
        final_url = f"{settings.r2_public_url}/{key}"

        state["results"][index] = {"original_url": video_url, "final_url": final_url, "status": "done"}
    except Exception as e:
        logger.error(f"[batch_editor] job={job_id} idx={index} falhou: {e}")
        state["results"][index] = {"original_url": video_url, "status": "error", "error": str(e)}
    finally:
        for p in (out_path, overlay_path):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
        state["completed"] += 1
        if state["completed"] >= state["total"]:
            state["status"] = "done"


async def _process_batch(job_id: str, req: BatchEditRequest):
    if req.fill_mode == "automatico":
        # Detecção automática de onde cortar (legenda/marca queimada) ainda
        # não existe — cai pro comportamento manual com os valores
        # informados, em vez de travar o usuário sem processar nada.
        logger.warning(f"[batch_editor] job={job_id} pediu fill_mode=automatico — ainda não implementado, usando manual")

    # Processa em SEQUÊNCIA, não em paralelo — mesmo racional do resto do
    # Instagram Dark: evita estourar CPU/memória do plano do Render com
    # vários ffmpeg simultâneos.
    for i, video_url in enumerate(req.videos):
        await _process_one(job_id, i, video_url, req)


@router.post("/process")
async def start_batch_edit(req: BatchEditRequest, background_tasks: BackgroundTasks):
    if not req.videos:
        raise HTTPException(status_code=400, detail="Nenhum vídeo enviado.")
    if len(req.videos) > 50:
        raise HTTPException(status_code=400, detail="Máximo de 50 vídeos por lote.")

    job_id = uuid.uuid4().hex
    _job_state[job_id] = {
        "total": len(req.videos),
        "completed": 0,
        "results": [None] * len(req.videos),
        "status": "processing",
    }
    background_tasks.add_task(_process_batch, job_id, req)
    return {"job_id": job_id, "total": len(req.videos)}


@router.get("/status/{job_id}")
async def get_batch_status(job_id: str):
    state = _job_state.get(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job não encontrado.")
    progress = int((state["completed"] / state["total"]) * 100) if state["total"] else 100
    return {
        "status": state["status"],
        "progress": progress,
        "completed": state["completed"],
        "total": state["total"],
        "videos": [r for r in state["results"] if r is not None],
    }
