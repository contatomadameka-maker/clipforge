"use client";

// ─────────────────────────────────────────────────────────────
// frontend/app/(dashboard)/studio/page.tsx
// ClipForge Studio — geração de vídeos longos para YouTube
// Pipeline de 9 agentes de IA em sequência
// ─────────────────────────────────────────────────────────────

import { useState } from "react";

// ── Tipos ─────────────────────────────────────────────────────

type AgentStatus = "idle" | "active" | "done" | "error";

interface Agent {
  id: number;
  name: string;
  api: string;
  desc: string;
  descActive?: string;
  descDone?: string;
}

// ── Dados dos 9 agentes ───────────────────────────────────────

const agents: Agent[] = [
  {
    id: 1,
    name: "Pesquisa",
    api: "Tavily API",
    desc: "Coleta fontes, contexto histórico, dados e referências sobre o tema",
    descActive: "Coletando fontes e referências...",
    descDone: "34 fontes coletadas — contexto histórico, Bíblia, arqueologia",
  },
  {
    id: 2,
    name: "Roteiro",
    api: "Claude API",
    desc: "Cria título, gancho, cenas, narração e estrutura narrativa completa",
    descActive: "Escrevendo roteiro com 8 cenas...",
    descDone: "8 cenas criadas — gancho, narrativa, clímax, conclusão",
  },
  {
    id: 3,
    name: "Storyboard",
    api: "GPT-4o",
    desc: "Define câmera, emoção, iluminação e duração de cada cena",
    descActive: "Detalhando cena 4 de 8...",
    descDone: "Storyboard completo — câmera e emoção definidos por cena",
  },
  {
    id: 4,
    name: "Prompts visuais",
    api: "GPT-4o",
    desc: "Gera 1 prompt cinematográfico detalhado por cena para geração de vídeo",
    descActive: "Criando prompts visuais...",
    descDone: "8 prompts visuais criados e otimizados",
  },
  {
    id: 5,
    name: "Narração",
    api: "ElevenLabs",
    desc: "Converte a narração de cada cena em áudio com entonação e emoção",
    descActive: "Gerando áudio por cena em PT-BR...",
    descDone: "8 faixas de áudio geradas — 7m 42s total",
  },
  {
    id: 6,
    name: "Vídeos por cena",
    api: "Runway Gen-4",
    desc: "Gera clipes de vídeo em paralelo a partir dos prompts visuais",
    descActive: "Gerando 8 clipes em paralelo...",
    descDone: "8 clipes de vídeo prontos",
  },
  {
    id: 7,
    name: "Música",
    api: "Suno API",
    desc: "Compõe trilha sonora original no estilo e tom do vídeo",
    descActive: "Compondo trilha épica...",
    descDone: "Trilha de 8 min gerada no estilo documentário",
  },
  {
    id: 8,
    name: "Legendas",
    api: "Whisper",
    desc: "Transcreve e sincroniza as legendas com o áudio da narração",
    descActive: "Sincronizando legendas...",
    descDone: "Legendas sincronizadas — PT-BR",
  },
  {
    id: 9,
    name: "Edição e export",
    api: "Shotstack · GPT-4o-mini",
    desc: "Monta e renderiza o vídeo final com título, descrição e SEO",
    descActive: "Renderizando vídeo final...",
    descDone: "MP4 pronto · thumbnail · título · descrição · SEO",
  },
];

// ── Ícones por agente ─────────────────────────────────────────

function AgentIcon({ id, status }: { id: number; status: AgentStatus }) {
  const icons: Record<number, React.ReactNode> = {
    1: ( // pesquisa
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
      </svg>
    ),
    2: ( // roteiro
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    3: ( // storyboard
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
      </svg>
    ),
    4: ( // prompts
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      </svg>
    ),
    5: ( // narração
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
      </svg>
    ),
    6: ( // vídeos
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
      </svg>
    ),
    7: ( // música
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
      </svg>
    ),
    8: ( // legendas
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="15" rx="2" /><path d="M17 2l-5 5-5-5" />
      </svg>
    ),
    9: ( // export
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
    ),
  };

  const colorMap: Record<AgentStatus, string> = {
    idle: "bg-surface-3 text-text-3",
    active: "bg-purple-dim text-purple-light",
    done: "bg-green-dim text-green",
    error: "bg-red-dim text-red-400",
  };

  return (
    <div className={`w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0 ${colorMap[status]}`}>
      {icons[id]}
    </div>
  );
}

// ── Componente de agente ──────────────────────────────────────

function AgentRow({ agent, status, progress }: { agent: Agent; status: AgentStatus; progress?: number }) {
  const borderMap: Record<AgentStatus, string> = {
    idle: "border-border bg-surface",
    active: "border-purple-border bg-purple-dim/30",
    done: "border-green-border bg-green-dim/30",
    error: "border-red-400/20 bg-red-dim",
  };

  const desc =
    status === "active" && agent.descActive
      ? agent.descActive
      : status === "done" && agent.descDone
      ? agent.descDone
      : agent.desc;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-[8px] border transition-all duration-200 ${borderMap[status]}`}>
      {/* Número / check */}
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 mt-2
        ${status === "done" ? "bg-green text-white" : status === "active" ? "bg-purple text-white" : "bg-surface-3 text-text-3 border border-border"}`}>
        {status === "done" ? (
          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          agent.id
        )}
      </div>

      <AgentIcon id={agent.id} status={status} />

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className={`text-[13px] font-medium ${status === "idle" ? "text-text-3" : "text-text"}`}>
            {agent.name}
          </span>
          <span className={`text-[10px] font-mono ${status === "done" ? "text-green" : status === "active" ? "text-purple-light" : "text-text-3"}`}>
            {agent.api}
          </span>
        </div>
        <p className={`text-[11px] leading-snug ${status === "idle" ? "text-text-3" : "text-text-2"}`}>
          {desc}
        </p>
        {status === "active" && typeof progress === "number" && (
          <div className="mt-2 h-[2px] bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-purple rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Status dot */}
      <div className="flex-shrink-0 mt-2.5">
        {status === "active" && (
          <div className="w-2 h-2 rounded-full bg-purple shadow-[0_0_0_3px_rgba(124,109,245,0.2)] animate-pulse" />
        )}
        {status === "done" && (
          <div className="w-2 h-2 rounded-full bg-green" />
        )}
        {status === "idle" && (
          <div className="w-2 h-2 rounded-full bg-surface-3 border border-border" />
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function StudioPage() {
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState("8");
  const [style, setStyle] = useState("documentary");
  const [voice, setVoice] = useState("male-deep");
  const [language, setLanguage] = useState("pt-BR");

  // Simulação de estado do pipeline (substituir por WebSocket real)
  // 0 = não iniciado, 1-9 = agente ativo, 10 = concluído
  const [currentAgent, setCurrentAgent] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  function getAgentStatus(agentId: number): AgentStatus {
    if (currentAgent === 0) return "idle";
    if (agentId < currentAgent) return "done";
    if (agentId === currentAgent) return "active";
    return "idle";
  }

  const creditCost: Record<string, number> = {
    "5": 40, "8": 65, "12": 90, "15": 110,
  };

  const estimatedTime: Record<string, string> = {
    "5": "~8 min", "8": "~12 min", "12": "~18 min", "15": "~22 min",
  };

  // Simulação local (remover quando integrar WebSocket real)
  function handleGenerate() {
    if (!topic.trim()) return;
    setIsRunning(true);
    setCurrentAgent(1);

    let agent = 1;
    const interval = setInterval(() => {
      agent += 1;
      if (agent > 9) {
        setCurrentAgent(10);
        setIsRunning(false);
        clearInterval(interval);
      } else {
        setCurrentAgent(agent);
      }
    }, 2000); // 2s por agente na simulação
  }

  const isDone = currentAgent === 10;
  const activeAgentLabel = currentAgent > 0 && currentAgent <= 9
    ? `Gerando · etapa ${currentAgent} de 9`
    : isDone ? "Vídeo pronto!" : null;

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>

      {/* ── Área principal ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-tight text-[20px] font-bold text-text tracking-tight">
              ClipForge Studio
            </h1>
            <p className="text-[12px] text-text-2">
              Digite um tema e receba um documentário completo pronto para o YouTube
            </p>
          </div>
          {activeAgentLabel && (
            <span className={`ml-auto text-[11px] font-medium px-3 py-1.5 rounded-full border
              ${isDone
                ? "bg-green-dim text-green border-green-border"
                : "bg-purple-dim text-purple-light border-purple-border"
              }`}>
              {isDone ? "✓ " : "● "}{activeAgentLabel}
            </span>
          )}
        </div>

        {/* Input de tema */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-3 mb-2">
            Tema do vídeo
          </p>
          <div className={`bg-surface-2 border rounded-[10px] overflow-hidden transition-colors ${topic ? "border-purple-border" : "border-border"} focus-within:border-purple-border`}>
            <div className="p-3.5 pb-0">
              <textarea
                className="w-full bg-transparent border-none outline-none text-[14px] text-text placeholder:text-text-3 resize-none leading-relaxed"
                rows={3}
                placeholder="Ex: Davi e Golias — a história de como um jovem pastor derrotou o guerreiro mais temido de Israel com fé e coragem..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={isRunning}
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
              {["Bíblico", "Motivacional", "Documentário", "Educativo"].map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTopic((prev) => prev ? prev : tag + " — ")}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-surface text-text-3 hover:text-text-2 hover:border-border-strong transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Configurações */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-3 mb-2">
            Configurações
          </p>
          <div className="grid grid-cols-4 gap-2">
            {[
              {
                label: "Duração",
                value: duration,
                onChange: setDuration,
                options: [
                  { value: "5", label: "5 minutos" },
                  { value: "8", label: "8 minutos" },
                  { value: "12", label: "12 minutos" },
                  { value: "15", label: "15 minutos" },
                ],
              },
              {
                label: "Estilo",
                value: style,
                onChange: setStyle,
                options: [
                  { value: "documentary", label: "Documentário" },
                  { value: "biblical", label: "Bíblico / Educativo" },
                  { value: "motivational", label: "Motivacional" },
                  { value: "narrative", label: "Narrativo" },
                ],
              },
              {
                label: "Narrador",
                value: voice,
                onChange: setVoice,
                options: [
                  { value: "male-deep", label: "Masculino grave" },
                  { value: "female-soft", label: "Feminino suave" },
                  { value: "male-young", label: "Masculino jovem" },
                ],
              },
              {
                label: "Idioma",
                value: language,
                onChange: setLanguage,
                options: [
                  { value: "pt-BR", label: "Português (BR)" },
                  { value: "en", label: "Inglês" },
                  { value: "es", label: "Espanhol" },
                ],
              },
            ].map((field) => (
              <div key={field.label} className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-3">
                  {field.label}
                </label>
                <select
                  className="bg-surface-2 border border-border rounded-[6px] text-[12px] text-text px-2.5 py-2 outline-none cursor-pointer hover:border-border-strong transition-colors"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  disabled={isRunning}
                >
                  {field.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Botão gerar */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={isRunning || !topic.trim()}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-[8px] text-[13px] font-medium transition-all
              ${isRunning || !topic.trim()
                ? "bg-surface-2 text-text-3 border border-border cursor-not-allowed"
                : "bg-purple text-white hover:opacity-90 cursor-pointer"
              }`}
          >
            {isRunning ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Gerar vídeo
              </>
            )}
          </button>
          <span className="text-[12px] text-text-3">
            ≈ <span className="text-purple-light font-medium">{creditCost[duration]} créditos</span>
            {" · "}{estimatedTime[duration]}
          </span>
        </div>

        {/* Pipeline */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-3 mb-3">
            Pipeline de produção
          </p>
          <div className="flex flex-col gap-2">
            {agents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                status={getAgentStatus(agent.id)}
                progress={agent.id === currentAgent ? 48 : undefined}
              />
            ))}
          </div>
        </div>

      </div>

      {/* ── Painel direito ───────────────────────────────── */}
      <aside className="w-[260px] flex-shrink-0 border-l border-border bg-surface flex flex-col overflow-y-auto">

        {/* Preview */}
        <div className="p-4 border-b border-border">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-3 mb-3">
            Preview
          </p>
          <div className="bg-surface-2 border border-border rounded-[8px] flex flex-col items-center justify-center gap-2 text-text-3"
            style={{ aspectRatio: "9/16", maxHeight: 180 }}>
            {isDone ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-green-dim border border-green-border flex items-center justify-center">
                  <svg className="w-5 h-5 stroke-green fill-none stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </div>
                <span className="text-[11px] text-green">Pronto para download</span>
              </div>
            ) : (
              <>
                <svg className="w-8 h-8 stroke-border-strong fill-none stroke-[1.5]" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span className="text-[11px]">Disponível após render</span>
              </>
            )}
          </div>

          {isDone && (
            <button className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-[6px] bg-green text-[#0c1a13] text-[12px] font-medium hover:opacity-90 transition-opacity">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Baixar MP4
            </button>
          )}
        </div>

        {/* Vídeos recentes */}
        <div className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-3 mb-3">
            Recentes no Studio
          </p>
          {[
            { title: "Noé e o dilúvio", meta: "8 min · ontem" },
            { title: "Moisés no Egito", meta: "12 min · 3 dias" },
            { title: "Propósito de vida", meta: "5 min · 5 dias" },
          ].map((v) => (
            <div
              key={v.title}
              className="flex items-center gap-2.5 py-2.5 border-b border-border last:border-0 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="w-8 h-8 rounded-[5px] bg-surface-3 border border-border flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 stroke-text-3 fill-none stroke-[1.75]" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-text truncate">{v.title}</p>
                <p className="text-[10px] text-text-3">{v.meta}</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-dim text-green border border-green-border flex-shrink-0">
                Pronto
              </span>
            </div>
          ))}
        </div>

      </aside>
    </div>
  );
}
