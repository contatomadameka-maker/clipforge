"use client";

// frontend/app/page.tsx
// Landing page pública — versão completa, tema claro.
// Redireciona pro dashboard automaticamente se já estiver logado.

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

const PURPLE = "#7c6df5";
const GREEN = "#3ecf8e";

const PLANS = [
  {
    id: "starter", name: "Starter", desc: "Pra testar o poder da IA",
    price: 49, credits: 500, color: PURPLE, badge: null,
    checkout: "https://pay.cakto.com.br/37qk5nq_969571",
    features: ["500 créditos/mês", "Vídeo de Produto (TikTok Shop)", "1 workflow", "200 MB de armazenamento"],
  },
  {
    id: "pro", name: "Pro", desc: "Pra criar todo dia",
    price: 97, credits: 1100, color: GREEN, badge: "Mais popular",
    checkout: "https://pay.cakto.com.br/33f66ou_969606",
    features: ["1.100 créditos/mês", "+ Studio YouTube (em breve)", "3 workflows", "500 MB de armazenamento", "Prioridade na fila"],
  },
  {
    id: "creator", name: "Creator", desc: "Pra criadores e pequenos negócios",
    price: 197, credits: 2500, color: "#3b82f6", badge: null,
    checkout: "https://pay.cakto.com.br/x7zi962_969646",
    features: ["2.500 créditos/mês", "Avatares próprios (3)", "20 workflows", "3 GB de armazenamento", "Suporte prioritário"],
  },
  {
    id: "agency", name: "Agency", desc: "Pra agências e times",
    price: 349, credits: 5000, color: "#f59e0b", badge: "Melhor custo-benefício",
    checkout: "https://pay.cakto.com.br/38dwjqd_969649",
    features: ["5.000 créditos/mês", "Avatares próprios (5)", "Workflows ilimitados", "5 GB de armazenamento", "Gerente de conta"],
  },
];

const COMPARE_ROWS = [
  { label: "Créditos/mês", values: ["500", "1.100", "2.500", "5.000"] },
  { label: "Engine de vídeo com IA", values: ["✓", "✓", "✓", "✓"] },
  { label: "Avatares próprios inclusos", values: ["✕", "1", "3", "5"] },
  { label: "Workflows", values: ["1", "3", "20", "Ilimitados"] },
  { label: "Armazenamento", values: ["200 MB", "500 MB", "3 GB", "5 GB"] },
  { label: "Suporte prioritário", values: ["✕", "✕", "✓", "✓"] },
];

const TOOLS = [
  {
    icon: "🛍️",
    title: "Vídeo de Produto — TikTok, Kwai, Reels e TikTok Shop",
    desc: "Envie a foto do produto, descreva a persona (com ou sem foto de referência) e a cena. Em minutos, receba um vídeo com avatar realista falando, segurando o produto, com áudio nativo — pronto pra postar no TikTok, Kwai, Reels ou direto no TikTok Shop.",
    status: "live",
    statusLabel: "Disponível agora",
    color: PURPLE,
  },
  {
    icon: "🎬",
    title: "Studio — YouTube",
    desc: "Pipeline completo de 9 agentes de IA: pesquisa, roteiro, storyboard, narração, cenas, música, legendas e edição. De um tema a um vídeo documentário pronto, sem gravar nada.",
    status: "soon",
    statusLabel: "Em breve",
    color: GREEN,
  },
  {
    icon: "🌙",
    title: "Instagram Dark",
    desc: "Cole o link de um perfil, escolha os Reels que quiser baixar, crie uma capa nova pro seu perfil — o sistema aplica automaticamente em todos os vídeos baixados. Pra quem cria contas de nicho pra vender produtos.",
    status: "soon",
    statusLabel: "Em breve",
    color: "#f59e0b",
  },
];

const FAQ = [
  { q: "Preciso saber editar vídeo?", a: "Não. Você envia a foto do produto, escreve (ou gera com IA) o que quer que o avatar fale, escolhe a cena, e o sistema gera o vídeo inteiro — cena, avatar, produto na mão e fala, tudo junto, numa geração só." },
  { q: "Como funcionam os créditos?", a: "Cada vídeo consome créditos, calculados pela duração e pela resolução escolhida (480p ou 720p). Os créditos renovam todo mês, conforme seu plano." },
  { q: "Quanto tempo demora pra gerar um vídeo?", a: "Entre 1 e 3 minutos, dependendo da duração e resolução. Você acompanha o progresso em tempo real, direto na tela." },
  { q: "Posso usar os vídeos comercialmente?", a: "Sim — todo vídeo gerado é seu, livre pra usar em anúncios, TikTok Shop, redes sociais, onde precisar." },
  { q: "Preciso de foto do avatar?", a: "Não necessariamente. Você pode descrever a persona em texto (idade, cabelo, corpo, roupa) e o sistema gera a pessoa inteira — ou, se preferir manter um rosto consistente, envie uma foto de referência." },
  { q: "Como cancelo minha assinatura?", a: "Direto no painel, sem multa e sem burocracia. Você mantém acesso até o fim do período já pago." },
  { q: "O Studio YouTube e o Instagram Dark já estão disponíveis?", a: "Estão em desenvolvimento e chegam em breve. Assinantes ativos são avisados automaticamente assim que cada um for lançado." },
];

function VideoPlaceholder({ label = "Exemplo em breve", aspect = "9/16" }: { label?: string; aspect?: string }) {
  return (
    <div className="rounded-2xl overflow-hidden flex flex-col items-center justify-center gap-2"
      style={{ aspectRatio: aspect, background: "linear-gradient(135deg,#f3f0ff,#eef9f3)", border: "1.5px dashed #d8d3f5" }}>
      <span className="text-2xl">🎬</span>
      <span className="text-xs font-medium" style={{ color: "#9a94c9" }}>{label}</span>
    </div>
  );
}

export default function LandingPage() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  useEffect(() => {
    try {
      const sb = getSupabase();
      sb.auth.getUser().then(({ data }: any) => {
        if (data?.user) window.location.href = "/dashboard";
        else setCheckingAuth(false);
      }).catch(() => setCheckingAuth(false));
    } catch {
      setCheckingAuth(false);
    }
  }, []);

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#fff" }}>
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: `3px solid ${PURPLE}33`, borderTopColor: PURPLE }} />
      </div>
    );
  }

  return (
    <div style={{ background: "#ffffff", color: "#14141c" }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-12 py-4"
        style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid #f0eefb" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: PURPLE }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M5 3l14 9-14 9V3z"/></svg>
          </div>
          <span className="text-lg font-bold" style={{ letterSpacing: "-0.02em" }}>ClipForge</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm" style={{ color: "#6b6b80" }}>
          <a href="#ferramentas" className="no-underline hover:text-black transition-colors">Ferramentas</a>
          <a href="#por-dentro" className="no-underline hover:text-black transition-colors">Tecnologia</a>
          <a href="#como-funciona" className="no-underline hover:text-black transition-colors">Como Funciona</a>
          <a href="#planos" className="no-underline hover:text-black transition-colors">Planos</a>
          <a href="#faq" className="no-underline hover:text-black transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-3">
          <a href="/login" className="text-sm no-underline hover:text-black transition-colors hidden sm:block" style={{ color: "#6b6b80" }}>Já sou cliente</a>
          <a href="#planos" className="px-4 py-2 rounded-[8px] text-sm font-semibold no-underline" style={{ background: PURPLE, color: "#fff" }}>
            Começar Agora
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="px-6 md:px-12 pt-20 pb-16 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs mb-6 font-medium"
          style={{ background: "#f3f0ff", border: "1px solid #e2dcfc", color: PURPLE }}>
          ✨ Feito pra criadores e vendedores do Brasil
        </div>
        <h1 className="text-4xl md:text-6xl font-bold mb-6" style={{ letterSpacing: "-0.03em", lineHeight: 1.08 }}>
          De uma foto a um <span style={{ color: PURPLE }}>vídeo que vende</span>.<br/>Em minutos.
        </h1>
        <p className="text-lg mb-10 max-w-2xl mx-auto" style={{ color: "#6b6b80" }}>
          Envie a foto do produto, descreva a persona e a cena — receba um vídeo com avatar realista falando, segurando o produto, pronto pra postar. Sem equipe, sem equipamento, sem editar nada.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <a href="#planos" className="px-8 py-3.5 rounded-[10px] text-base font-semibold no-underline"
            style={{ background: `linear-gradient(135deg,#8b7cf8,${PURPLE})`, color: "#fff", boxShadow: "0 8px 24px rgba(124,109,245,0.35)" }}>
            Começar Agora
          </a>
          <span className="text-xs" style={{ color: "#9a94b0" }}>Cancele quando quiser · Sem fidelidade</span>
        </div>

        {/* Vídeo institucional — placeholder grande */}
        <div className="rounded-3xl overflow-hidden max-w-3xl mx-auto flex flex-col items-center justify-center gap-3"
          style={{ aspectRatio: "16/9", background: "linear-gradient(135deg,#f3f0ff,#eef9f3)", border: "2px dashed #d8d3f5" }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(124,109,245,0.15)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill={PURPLE}><path d="M8 5v14l11-7z"/></svg>
          </div>
          <span className="text-sm font-medium" style={{ color: "#9a94c9" }}>Vídeo mostrando a plataforma por dentro — em breve</span>
        </div>
      </section>

      {/* ── Showcase de vídeos ── */}
      <section id="ferramentas" className="px-6 md:px-12 py-20" style={{ background: "#faf9ff" }}>
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold text-center mb-3" style={{ color: PURPLE, letterSpacing: "0.1em" }}>RESULTADOS REAIS</p>
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">Tudo isso foi criado com o ClipForge.<br/>Em minutos.</h2>
          <p className="text-center mb-12" style={{ color: "#6b6b80" }}>Nada de banco de imagem — tudo gerado por IA a partir de uma foto real de produto.</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <VideoPlaceholder key={i} />)}
          </div>
        </div>
      </section>

      {/* ── Ferramentas — cards grandes ── */}
      <section className="px-6 md:px-12 py-20">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold text-center mb-3" style={{ color: PURPLE, letterSpacing: "0.1em" }}>PLATAFORMA COMPLETA</p>
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">Tudo que você precisa.<br/>Num só lugar.</h2>
          <p className="text-center mb-14 max-w-2xl mx-auto" style={{ color: "#6b6b80" }}>
            3 ferramentas de IA integradas, construídas em cima do fluxo real de quem vende no TikTok Shop. Sem aprender múltiplos softwares.
          </p>

          <div className="flex flex-col gap-6">
            {TOOLS.map((tool, i) => (
              <div key={tool.title} className="rounded-3xl p-8 md:p-10 grid md:grid-cols-2 gap-8 items-center"
                style={{ background: "#faf9ff", border: "1px solid #f0eefb" }}>
                <div className={i % 2 === 1 ? "md:order-2" : ""}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                      style={{ background: `${tool.color}18` }}>
                      {tool.icon}
                    </div>
                    <span className="text-[11px] font-bold px-3 py-1 rounded-full"
                      style={{ background: tool.status === "live" ? "#e8f9f0" : "#fef3e2", color: tool.status === "live" ? GREEN : "#f59e0b" }}>
                      {tool.statusLabel}
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{tool.title}</h3>
                  <p className="text-[15px] leading-relaxed" style={{ color: "#6b6b80" }}>{tool.desc}</p>
                </div>
                <div className={i % 2 === 1 ? "md:order-1" : ""}>
                  <VideoPlaceholder aspect="4/3" label="Prévia da ferramenta — em breve" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── O que roda por dentro ── */}
      <section id="por-dentro" className="px-6 md:px-12 py-20" style={{ background: "#0c0c14" }}>
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-bold mb-3" style={{ color: "#a99cf8", letterSpacing: "0.1em" }}>TECNOLOGIA DE PONTA</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "#f0f0f5" }}>O que roda por dentro do ClipForge</h2>
          <p className="mb-12 max-w-xl mx-auto" style={{ color: "#9090a8" }}>Motores de IA de geração de vídeo entre os mais avançados do mercado, sem você precisar contratar nada separado.</p>

          <div className="max-w-md mx-auto rounded-3xl p-8" style={{ background: "rgba(124,109,245,0.08)", border: "1px solid rgba(124,109,245,0.3)" }}>
            <span className="text-[10px] font-bold px-3 py-1 rounded-full" style={{ background: "rgba(124,109,245,0.2)", color: "#a99cf8" }}>CARRO-CHEFE</span>
            <h3 className="text-2xl font-bold mt-4 mb-2" style={{ color: "#f0f0f5" }}>Seedance 2.0</h3>
            <p className="text-sm mb-4" style={{ color: "#9090a8" }}>A IA de vídeo mais desejada do momento. Qualidade cinematográfica, áudio nativo com fala sincronizada, e consistência real de cena e personagem numa geração só.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {["Imagem → Vídeo", "Áudio nativo", "480p / 720p"].map(tag => (
                <span key={tag} className="text-[11px] px-3 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "#9090a8" }}>{tag}</span>
              ))}
            </div>
          </div>
          <p className="text-xs mt-8" style={{ color: "#55556a" }}>Novos motores de IA sendo adicionados em breve.</p>
        </div>
      </section>

      {/* ── Um rosto, infinitos vídeos ── */}
      <section className="px-6 md:px-12 py-20">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-bold mb-3" style={{ color: PURPLE, letterSpacing: "0.1em" }}>INCLUSO EM TODOS OS PLANOS</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Um rosto.<br/>Infinitos vídeos.</h2>
            <p className="text-[15px] leading-relaxed mb-4" style={{ color: "#6b6b80" }}>
              Além de vídeos de produto, o ClipForge também cria personas com IA. Descreva a pessoa em texto (idade, cabelo, corpo, roupa) — sem precisar de nenhuma foto — ou envie uma referência pra manter o mesmo rosto em todos os seus vídeos.
            </p>
            <p className="text-[15px] leading-relaxed" style={{ color: "#6b6b80" }}>
              Testado e funcionando sem imagem de rosto: você descreve, a IA cria.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <VideoPlaceholder aspect="3/4" label="Persona 1 — em breve" />
            <VideoPlaceholder aspect="3/4" label="Persona 2 — em breve" />
          </div>
        </div>
      </section>

      {/* ── Como funciona ── */}
      <section id="como-funciona" className="px-6 md:px-12 py-20" style={{ background: "#faf9ff" }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold text-center mb-3" style={{ color: PURPLE, letterSpacing: "0.1em" }}>SIMPLES DE USAR</p>
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-14">3 passos. É sério, só 3.</h2>

          <div className="grid md:grid-cols-3 gap-10">
            {[
              { n: "1", title: "Envie a foto do produto", desc: "Faça upload da imagem, descreva o produto e a categoria." },
              { n: "2", title: "Descreva persona e cena", desc: "Escolha um kit pronto ou escreva do zero quem fala e onde." },
              { n: "3", title: "Gere e baixe", desc: "Em minutos, seu vídeo fica pronto pra postar direto no TikTok Shop." },
            ].map(step => (
              <div key={step.n} className="text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5 text-xl font-bold"
                  style={{ background: "#f3f0ff", color: PURPLE, border: "1px solid #e2dcfc" }}>
                  {step.n}
                </div>
                <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                <p className="text-sm" style={{ color: "#6b6b80" }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Depoimentos (placeholder estrutural, com avatar ilustrado — sem foto/nome fabricados) ── */}
      <section className="px-6 md:px-12 py-20">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold text-center mb-3" style={{ color: PURPLE, letterSpacing: "0.1em" }}>DEPOIMENTOS</p>
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">Quem usa, recomenda.</h2>
          <p className="text-center mb-14" style={{ color: "#6b6b80" }}>Em breve, veja o que nossos primeiros clientes estão dizendo.</p>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: "🛍️", niche: "Loja de moda e acessórios", color: PURPLE },
              { icon: "💄", niche: "Marca de beleza e cosméticos", color: GREEN },
              { icon: "📈", niche: "Gestor de tráfego e criativos", color: "#3b82f6" },
            ].map((card, i) => (
              <div key={i} className="rounded-2xl p-7 relative overflow-hidden" style={{ background: "#faf9ff", border: "1px solid #f0eefb" }}>
                <span className="absolute top-5 right-5 text-[10px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: "#fef3e2", color: "#f59e0b" }}>
                  Em breve
                </span>
                <div className="flex gap-1 mb-4">
                  {[1,2,3,4,5].map(s => <span key={s} style={{ color: "#f5b942" }}>★</span>)}
                </div>
                <p className="text-sm mb-6 leading-relaxed" style={{ color: "#4a4a5c" }}>
                  "Espaço reservado pro depoimento real de um cliente do segmento de {card.niche.toLowerCase()}."
                </p>
                <div className="flex items-center gap-3 pt-4" style={{ borderTop: "1px solid #f0eefb" }}>
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: `${card.color}18` }}>
                    {card.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#14141c" }}>{card.niche}</p>
                    <p className="text-xs" style={{ color: "#9a94b0" }}>Depoimento em breve</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Economia ── */}
      <section className="px-6 md:px-12 py-20" style={{ background: `linear-gradient(135deg,${PURPLE},#5b4fd6)` }}>
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold mb-3" style={{ color: "rgba(255,255,255,0.8)", letterSpacing: "0.1em" }}>ECONOMIA REAL</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "#fff" }}>Tecnologia de ponta, sem complicação.</h2>
          <p className="text-lg" style={{ color: "rgba(255,255,255,0.85)" }}>
            Contratar avatar de IA, geração de vídeo e infraestrutura separadamente custaria caro e exigiria configurar múltiplas APIs. No ClipForge está tudo junto, em reais, sem burocracia técnica.
          </p>
        </div>
      </section>

      {/* ── Preços ── */}
      <section id="planos" className="px-6 md:px-12 py-20">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold text-center mb-3" style={{ color: PURPLE, letterSpacing: "0.1em" }}>PLANOS</p>
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">Planos flexíveis. Sem fidelidade.</h2>
          <p className="text-center mb-14" style={{ color: "#6b6b80" }}>Cancele quando quiser, sem multa.</p>

          <div className="grid md:grid-cols-4 gap-5 mb-16">
            {PLANS.map(plan => (
              <div key={plan.id} className="rounded-2xl p-6 flex flex-col gap-4 relative"
                style={{ background: "#faf9ff", border: plan.badge ? `2px solid ${plan.color}` : "1px solid #f0eefb" }}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap"
                    style={{ background: plan.color, color: "#fff" }}>
                    {plan.badge}
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-bold mb-1" style={{ color: plan.color, letterSpacing: "0.08em" }}>{plan.name.toUpperCase()}</p>
                  <p className="text-xs mb-3" style={{ color: "#9a94b0" }}>{plan.desc}</p>
                  <p className="text-3xl font-bold leading-none">R${plan.price}<span className="text-sm font-normal" style={{ color: "#9a94b0" }}>/mês</span></p>
                  <p className="text-xs mt-2" style={{ color: "#6b6b80" }}>{plan.credits.toLocaleString()} créditos/mês</p>
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-start gap-2">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${plan.color}18` }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={plan.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <span className="text-xs" style={{ color: "#6b6b80" }}>{f}</span>
                    </div>
                  ))}
                </div>
                <a href={plan.checkout} target="_blank" rel="noopener noreferrer"
                  className="w-full h-11 rounded-[8px] text-sm font-semibold flex items-center justify-center no-underline"
                  style={{ background: plan.color, color: "#fff" }}>
                  Assinar {plan.name}
                </a>
              </div>
            ))}
          </div>

          {/* Compare planos */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #f0eefb" }}>
            <h3 className="text-lg font-bold px-6 py-5" style={{ background: "#faf9ff" }}>Compare os planos</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#faf9ff" }}>
                    <th className="text-left px-6 py-3 font-medium" style={{ color: "#9a94b0" }}></th>
                    {PLANS.map(p => (
                      <th key={p.id} className="text-center px-4 py-3 font-bold" style={{ color: p.color }}>{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map((row, i) => (
                    <tr key={row.label} style={{ borderTop: "1px solid #f0eefb", background: i % 2 === 0 ? "#fff" : "#fcfbff" }}>
                      <td className="px-6 py-3 font-medium">{row.label}</td>
                      {row.values.map((v, j) => (
                        <td key={j} className="text-center px-4 py-3" style={{ color: v === "✓" ? GREEN : v === "✕" ? "#d1cee0" : "#14141c" }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="px-6 md:px-12 py-20" style={{ background: "#faf9ff" }}>
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-bold text-center mb-3" style={{ color: PURPLE, letterSpacing: "0.1em" }}>FAQ</p>
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-10">Perguntas frequentes</h2>

          <div className="flex flex-col gap-2">
            {FAQ.map((item, i) => (
              <div key={i} className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #f0eefb" }}>
                <button type="button" onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer border-none bg-transparent">
                  <span className="text-sm font-medium">{item.q}</span>
                  <span className="text-lg" style={{ color: "#9a94b0" }}>{faqOpen === i ? "−" : "+"}</span>
                </button>
                {faqOpen === i && (
                  <div className="px-5 pb-4">
                    <p className="text-sm leading-relaxed" style={{ color: "#6b6b80" }}>{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="px-6 md:px-12 py-24 text-center">
        <h2 className="text-3xl md:text-5xl font-bold mb-5" style={{ letterSpacing: "-0.02em" }}>Seus concorrentes já usam IA.<br/>E você?</h2>
        <p className="mb-9" style={{ color: "#6b6b80" }}>Comece a criar vídeos profissionais hoje, sem equipe e sem complicação.</p>
        <a href="#planos" className="px-9 py-4 rounded-[10px] text-base font-semibold no-underline inline-block"
          style={{ background: `linear-gradient(135deg,#8b7cf8,${PURPLE})`, color: "#fff", boxShadow: "0 8px 24px rgba(124,109,245,0.35)" }}>
          Ver Planos e Começar
        </a>
      </section>

      {/* ── Footer ── */}
      <footer className="px-6 md:px-12 py-10" style={{ borderTop: "1px solid #f0eefb" }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: PURPLE }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M5 3l14 9-14 9V3z"/></svg>
            </div>
            <span className="text-sm font-bold">ClipForge</span>
          </div>
          <p className="text-xs" style={{ color: "#9a94b0" }}>© 2026 ClipForge. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
