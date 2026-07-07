"use client";

// frontend/app/page.tsx
// Landing page pública — mostra a página de vendas pra visitantes,
// redireciona pro dashboard automaticamente se já estiver logado.

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    desc: "Pra testar o poder da IA",
    price: 49,
    credits: 500,
    color: "#7c6df5",
    badge: null,
    checkout: "https://pay.cakto.com.br/37qk5nq_969571",
    features: ["500 créditos/mês", "Criativo de Produto (TikTok Shop)", "1 workflow", "Suporte por email"],
  },
  {
    id: "pro",
    name: "Pro",
    desc: "Pra começar a criar todo dia",
    price: 97,
    credits: 1100,
    color: "#3ecf8e",
    badge: "Mais popular",
    checkout: "https://pay.cakto.com.br/33f66ou_969606",
    features: ["1.100 créditos/mês", "Criativo + Studio YouTube", "3 workflows", "Prioridade na fila"],
  },
  {
    id: "creator",
    name: "Creator",
    desc: "Pra criadores e pequenos negócios",
    price: 197,
    credits: 2500,
    color: "#60a5fa",
    badge: null,
    checkout: "https://pay.cakto.com.br/x7zi962_969646",
    features: ["2.500 créditos/mês", "Tudo do Pro", "Avatares próprios", "Suporte dedicado"],
  },
  {
    id: "agency",
    name: "Agency",
    desc: "Pra agências e times",
    price: 349,
    credits: 5000,
    color: "#f59e0b",
    badge: "Melhor custo-benefício",
    checkout: "https://pay.cakto.com.br/38dwjqd_969649",
    features: ["5.000 créditos/mês", "Tudo do Creator", "Múltiplos usuários", "Gerente de conta"],
  },
];

const TOOLS = [
  {
    icon: "🛍️",
    title: "Vídeo de Produto (TikTok Shop)",
    desc: "Envie a foto do produto, descreva a persona e a cena — receba um vídeo com avatar realista, falando, segurando o produto, pronto pra postar.",
    status: "live",
  },
  {
    icon: "🎬",
    title: "Studio — YouTube",
    desc: "Pipeline completo de 9 agentes: pesquisa, roteiro, storyboard, narração, cenas, música, legendas e edição. De um tema a um documentário pronto.",
    status: "soon",
  },
  {
    icon: "🌙",
    title: "Instagram Dark",
    desc: "Cole o link de um perfil, escolha os Reels que quiser baixar, crie uma capa nova pro seu Instagram, e o sistema aplica automaticamente em todos os vídeos baixados.",
    status: "soon",
  },
];

const FAQ = [
  {
    q: "Preciso saber editar vídeo?",
    a: "Não. Você envia a foto do produto, escreve (ou gera com IA) o que quer que o avatar fale, escolhe a cena, e o sistema gera o vídeo inteiro — cena, avatar, produto na mão e fala, tudo junto, numa geração só.",
  },
  {
    q: "Como funcionam os créditos?",
    a: "Cada vídeo consome uma quantidade de créditos, calculada pela duração e pela resolução escolhida (480p ou 720p). Os créditos renovam todo mês, de acordo com seu plano.",
  },
  {
    q: "Quanto tempo demora pra gerar um vídeo?",
    a: "Entre 1 e 3 minutos, dependendo da duração e resolução escolhidas. Você acompanha o progresso em tempo real.",
  },
  {
    q: "Posso usar os vídeos comercialmente?",
    a: "Sim — todo vídeo gerado é seu, livre pra usar em anúncios, TikTok Shop, redes sociais, onde precisar.",
  },
  {
    q: "Como cancelo minha assinatura?",
    a: "Direto no painel, sem multa e sem burocracia. Você mantém acesso até o fim do período já pago.",
  },
  {
    q: "O Studio YouTube e o Instagram Dark já estão disponíveis?",
    a: "O Studio YouTube e o Instagram Dark estão em desenvolvimento e chegam em breve. Assinantes ativos são avisados automaticamente assim que cada um for lançado.",
  },
];

export default function LandingPage() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly">("monthly");

  useEffect(() => {
    try {
      const sb = getSupabase();
      sb.auth.getUser().then(({ data }: any) => {
        if (data?.user) {
          window.location.href = "/dashboard";
        } else {
          setCheckingAuth(false);
        }
      }).catch(() => setCheckingAuth(false));
    } catch {
      setCheckingAuth(false);
    }
  }, []);

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#0a0a0f" }}>
        <div className="w-8 h-8 border-2 border-[#7c6df5]/30 border-t-[#7c6df5] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0a0f", color: "#f0f0f5" }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-12 py-4"
        style={{ background: "rgba(10,10,15,0.9)", backdropFilter: "blur(12px)", borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#7c6df5" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M5 3l14 9-14 9V3z"/></svg>
          </div>
          <span className="text-lg font-bold" style={{ letterSpacing: "-0.02em" }}>ClipForge</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm text-[#9090a8]">
          <a href="#ferramentas" className="no-underline hover:text-[#f0f0f5] transition-colors">Ferramentas</a>
          <a href="#como-funciona" className="no-underline hover:text-[#f0f0f5] transition-colors">Como Funciona</a>
          <a href="#planos" className="no-underline hover:text-[#f0f0f5] transition-colors">Planos</a>
          <a href="#faq" className="no-underline hover:text-[#f0f0f5] transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-3">
          <a href="/login" className="text-sm text-[#9090a8] no-underline hover:text-[#f0f0f5] transition-colors hidden sm:block">Já sou cliente</a>
          <a href="#planos"
            className="px-4 py-2 rounded-[8px] text-sm font-semibold no-underline"
            style={{ background: "#7c6df5", color: "#fff" }}>
            Começar Agora
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="px-6 md:px-12 pt-16 pb-20 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs mb-6"
          style={{ background: "rgba(124,109,245,0.1)", border: "0.5px solid rgba(124,109,245,0.3)", color: "#a99cf8" }}>
          Feito 100% pra TikTok Shop Brasil
        </div>
        <h1 className="text-4xl md:text-6xl font-bold mb-6" style={{ letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          De uma foto do produto a um <span style={{ color: "#7c6df5" }}>vídeo que vende</span>. Em minutos.
        </h1>
        <p className="text-lg text-[#9090a8] mb-8 max-w-2xl mx-auto">
          Envie a foto do produto, descreva a persona e a cena — receba um vídeo com avatar realista falando, segurando o produto, pronto pra postar no TikTok Shop. Sem equipe, sem equipamento, sem editar nada.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href="#planos"
            className="px-8 py-3.5 rounded-[10px] text-base font-semibold no-underline"
            style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff", boxShadow: "0 8px 24px rgba(124,109,245,0.4)" }}>
            Começar Agora
          </a>
          <span className="text-xs text-[#55556a]">Cancele quando quiser · Sem fidelidade</span>
        </div>
      </section>

      {/* ── Showcase (placeholder pra vídeos reais) ── */}
      <section id="ferramentas" className="px-6 md:px-12 py-16" style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold text-center mb-2" style={{ color: "#7c6df5", letterSpacing: "0.08em" }}>RESULTADOS REAIS</p>
          <h2 className="text-3xl font-bold text-center mb-3">Vídeos gerados pelo ClipForge</h2>
          <p className="text-[#9090a8] text-center mb-10">Nada de banco de imagem — tudo gerado por IA a partir de uma foto real de produto.</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="rounded-2xl overflow-hidden flex items-center justify-center"
                style={{ aspectRatio: "9/16", background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)" }}>
                <span className="text-xs text-[#55556a] text-center px-4">Exemplo em breve</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Ferramentas ── */}
      <section className="px-6 md:px-12 py-16" style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold text-center mb-2" style={{ color: "#7c6df5", letterSpacing: "0.08em" }}>PLATAFORMA COMPLETA</p>
          <h2 className="text-3xl font-bold text-center mb-3">Tudo que você precisa, num só lugar</h2>
          <p className="text-[#9090a8] text-center mb-12 max-w-2xl mx-auto">Diferente de ferramentas genéricas, o ClipForge é construído em cima do fluxo real de quem vende no TikTok Shop.</p>

          <div className="grid md:grid-cols-3 gap-6">
            {TOOLS.map(tool => (
              <div key={tool.title} className="rounded-2xl p-6 relative"
                style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                {tool.status === "soon" && (
                  <span className="absolute top-5 right-5 text-[10px] font-semibold px-2 py-1 rounded-full"
                    style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                    Em breve
                  </span>
                )}
                <div className="text-3xl mb-4">{tool.icon}</div>
                <h3 className="text-base font-bold mb-2">{tool.title}</h3>
                <p className="text-sm text-[#9090a8] leading-relaxed">{tool.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Como funciona ── */}
      <section id="como-funciona" className="px-6 md:px-12 py-16" style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold text-center mb-2" style={{ color: "#7c6df5", letterSpacing: "0.08em" }}>SIMPLES DE USAR</p>
          <h2 className="text-3xl font-bold text-center mb-12">3 passos. É sério, só 3.</h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { n: "1", title: "Envie a foto do produto", desc: "Faça upload da imagem, descreva o produto e a categoria." },
              { n: "2", title: "Descreva persona e cena", desc: "Escolha um kit pronto ou escreva do zero quem fala e onde." },
              { n: "3", title: "Gere e baixe", desc: "Em minutos, seu vídeo fica pronto pra postar direto no TikTok Shop." },
            ].map(step => (
              <div key={step.n} className="text-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold"
                  style={{ background: "rgba(124,109,245,0.15)", color: "#a99cf8", border: "0.5px solid rgba(124,109,245,0.3)" }}>
                  {step.n}
                </div>
                <h3 className="text-base font-bold mb-2">{step.title}</h3>
                <p className="text-sm text-[#9090a8]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Preços ── */}
      <section id="planos" className="px-6 md:px-12 py-16" style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold text-center mb-2" style={{ color: "#7c6df5", letterSpacing: "0.08em" }}>PLANOS</p>
          <h2 className="text-3xl font-bold text-center mb-3">Planos flexíveis. Sem fidelidade.</h2>
          <p className="text-[#9090a8] text-center mb-12">Cancele quando quiser, sem multa.</p>

          <div className="grid md:grid-cols-4 gap-5">
            {PLANS.map(plan => (
              <div key={plan.id} className="rounded-2xl p-6 flex flex-col gap-4 relative"
                style={{
                  background: "rgba(16,16,22,0.95)",
                  border: plan.badge ? `1px solid ${plan.color}` : "0.5px solid rgba(255,255,255,0.08)",
                  boxShadow: plan.badge ? `0 0 0 1px ${plan.color}33` : "none",
                }}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap"
                    style={{ background: plan.color, color: "#fff" }}>
                    {plan.badge}
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: plan.color, letterSpacing: "0.08em" }}>{plan.name.toUpperCase()}</p>
                  <p className="text-xs text-[#55556a] mb-3">{plan.desc}</p>
                  <p className="text-3xl font-bold leading-none">R${plan.price}<span className="text-sm font-normal text-[#55556a]">/mês</span></p>
                  <p className="text-xs text-[#9090a8] mt-2">{plan.credits.toLocaleString()} créditos/mês</p>
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  {plan.features.map(f => (
                    <div key={f} className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${plan.color}22` }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={plan.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <span className="text-xs text-[#9090a8]">{f}</span>
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
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="px-6 md:px-12 py-16" style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-2xl mx-auto">
          <p className="text-xs font-semibold text-center mb-2" style={{ color: "#7c6df5", letterSpacing: "0.08em" }}>FAQ</p>
          <h2 className="text-3xl font-bold text-center mb-10">Perguntas frequentes</h2>

          <div className="flex flex-col gap-2">
            {FAQ.map((item, i) => (
              <div key={i} className="rounded-xl overflow-hidden" style={{ background: "rgba(16,16,22,0.95)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
                <button type="button" onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer border-none bg-transparent">
                  <span className="text-sm font-medium">{item.q}</span>
                  <span className="text-[#55556a] text-lg">{faqOpen === i ? "−" : "+"}</span>
                </button>
                {faqOpen === i && (
                  <div className="px-5 pb-4">
                    <p className="text-sm text-[#9090a8] leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="px-6 md:px-12 py-20 text-center" style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
        <h2 className="text-3xl md:text-4xl font-bold mb-4">Seus concorrentes já usam IA. E você?</h2>
        <p className="text-[#9090a8] mb-8">Comece a criar vídeos profissionais hoje, sem equipe e sem complicação.</p>
        <a href="#planos"
          className="px-8 py-3.5 rounded-[10px] text-base font-semibold no-underline inline-block"
          style={{ background: "linear-gradient(135deg,#8b7cf8,#7c6df5)", color: "#fff", boxShadow: "0 8px 24px rgba(124,109,245,0.4)" }}>
          Ver Planos e Começar
        </a>
      </section>

      {/* ── Footer ── */}
      <footer className="px-6 md:px-12 py-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#7c6df5" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M5 3l14 9-14 9V3z"/></svg>
            </div>
            <span className="text-sm font-bold">ClipForge</span>
          </div>
          <p className="text-xs text-[#55556a]">© 2026 ClipForge. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
