# ClipForge

Plataforma SaaS de criação de vídeos com IA — dois produtos integrados, uma infraestrutura compartilhada.

---

## Produtos

### ClipForge Studio — YouTube
O usuário digita um tema e recebe um vídeo longo completo (5–15 min) via pipeline de 9 agentes de IA em sequência: pesquisa → roteiro → storyboard → prompts visuais → narração → vídeos por cena → música → legendas → edição e export com SEO.

**Casos de uso:** documentários bíblicos, motivacional, educativo, YouTube.

### ClipForge TikTok Shop
Canvas de 4 blocos sequenciais: produto → avatar → script → gerar. O usuário sobe a foto de um produto e recebe um vídeo de vendas em 9:16 em até 60 segundos, pronto para publicar no TikTok Shop.

**Casos de uso:** sellers do TikTok Shop Brasil, social media, e-commerce.

---

## Arquitetura geral

```
frontend/          Next.js 14 — App Router + TypeScript + Tailwind
backend/           FastAPI (Python 3.11+)
  ├── routers/     Rotas da API REST
  ├── services/    Integrações com APIs externas
  ├── tasks/       Celery tasks (jobs assíncronos)
  └── models/      Schemas Pydantic
```

### Infraestrutura compartilhada (serve os dois produtos)
- **Auth:** Supabase Auth (email + Google OAuth)
- **Banco:** Supabase PostgreSQL
- **Storage:** Cloudflare R2 (vídeos, áudios, thumbnails)
- **Fila de jobs:** Celery + Redis (Upstash)
- **Progresso em tempo real:** WebSocket (FastAPI)
- **Pagamentos:** Stripe + PIX
- **Deploy frontend:** Vercel
- **Deploy backend:** Render

---

## Stack completa

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Zustand, TanStack Query |
| Canvas TikTok | React Flow (`@xyflow/react`) |
| Backend | FastAPI, Celery, Redis |
| Banco + Auth | Supabase (PostgreSQL + Auth) |
| Storage | Cloudflare R2 |
| Billing | Stripe |

### APIs de IA — Studio (YouTube)
| Agente | API |
|---|---|
| Pesquisa | Tavily (primário) / Perplexity |
| Roteiro | Claude API |
| Storyboard + Prompts | GPT-4o |
| Narração | ElevenLabs |
| Vídeo por cena | Runway Gen-4 (primário) / Kling / LTX |
| Música | Suno (primário) / Mubert |
| Legendas | Whisper |
| Edição + Render | Shotstack |
| SEO + Export | GPT-4o-mini |

### APIs de IA — TikTok Shop
| Finalidade | API |
|---|---|
| Avatar falante | HeyGen |
| Vídeo de produto | Kling AI |
| Imagem estática | Fal.ai (Flux) |
| Script com IA | GPT-4o-mini |
| Legenda | Whisper |

---

## Estrutura de pastas

```
clipforge/
├── frontend/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── register/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                  ← Dashboard home (os dois produtos)
│   │   │   ├── studio/
│   │   │   │   └── page.tsx              ← ClipForge Studio (YouTube)
│   │   │   ├── tiktok/
│   │   │   │   └── page.tsx              ← ClipForge TikTok (canvas 4 blocos)
│   │   │   ├── videos/
│   │   │   │   └── page.tsx              ← Biblioteca de vídeos
│   │   │   ├── templates/
│   │   │   │   └── page.tsx
│   │   │   └── settings/
│   │   │       └── page.tsx
│   │   ├── admin/
│   │   │   └── page.tsx                  ← Painel admin (só você)
│   │   └── layout.tsx
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── CreateCards.tsx
│   │   │   ├── VideoList.tsx
│   │   │   ├── StatsRow.tsx
│   │   │   └── NewsFeed.tsx
│   │   ├── studio/
│   │   │   ├── AgentPipeline.tsx         ← Pipeline dos 9 agentes
│   │   │   ├── AgentRow.tsx
│   │   │   └── ProgressBar.tsx
│   │   ├── tiktok/
│   │   │   ├── WorkflowCanvas.tsx        ← React Flow wrapper
│   │   │   └── blocks/
│   │   │       ├── ProductBlock.tsx
│   │   │       ├── AvatarBlock.tsx
│   │   │       ├── ScriptBlock.tsx
│   │   │       └── GenerateBlock.tsx
│   │   ├── shared/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Topbar.tsx
│   │   │   ├── CreditsBadge.tsx
│   │   │   └── VideoCard.tsx
│   │   └── ui/                           ← Componentes base (button, input, etc.)
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── api.ts                        ← Chamadas ao backend
│   │   └── store.ts                      ← Zustand store global
│   ├── types/
│   │   └── index.ts
│   └── public/
│
├── backend/
│   ├── main.py                           ← App FastAPI + registro de routers
│   ├── routers/
│   │   ├── auth.py
│   │   ├── projects.py                   ← CRUD de projetos (Studio + TikTok)
│   │   ├── studio.py                     ← Endpoints do Studio
│   │   ├── tiktok.py                     ← Endpoints do TikTok
│   │   ├── credits.py
│   │   ├── videos.py
│   │   └── webhooks.py                   ← Stripe webhooks
│   ├── services/
│   │   ├── studio/
│   │   │   ├── research_agent.py         ← Agente 1: Tavily
│   │   │   ├── script_agent.py           ← Agente 2: Claude
│   │   │   ├── storyboard_agent.py       ← Agente 3: GPT-4o
│   │   │   ├── prompt_agent.py           ← Agente 4: GPT-4o
│   │   │   ├── narration_agent.py        ← Agente 5: ElevenLabs
│   │   │   ├── video_agent.py            ← Agente 6: Runway
│   │   │   ├── music_agent.py            ← Agente 7: Suno
│   │   │   ├── caption_agent.py          ← Agente 8: Whisper
│   │   │   └── editor_agent.py           ← Agente 9: Shotstack
│   │   ├── tiktok/
│   │   │   ├── heygen_service.py
│   │   │   ├── kling_service.py
│   │   │   ├── fal_service.py
│   │   │   └── openai_service.py
│   │   ├── shared/
│   │   │   ├── storage_service.py        ← Cloudflare R2
│   │   │   ├── credit_service.py         ← Débito, estorno, reserva
│   │   │   └── whisper_service.py
│   ├── tasks/
│   │   ├── studio_tasks.py               ← Celery: pipeline Studio
│   │   └── tiktok_tasks.py               ← Celery: jobs TikTok
│   ├── models/
│   │   └── schemas.py                    ← Schemas Pydantic
│   ├── db/
│   │   └── database.py                   ← Conexão Supabase
│   └── requirements.txt
│
├── docs/
│   └── mockups/                          ← Protótipos HTML de referência
│       ├── clipforge-dashboard.html
│       ├── clipforge-studio.html
│       └── clipforge-admin.html
│
└── README.md
```

---

## Banco de dados — schema principal

```sql
-- Perfis de usuário (extende Supabase Auth)
profiles (
  id uuid PRIMARY KEY references auth.users,
  name text,
  email text,
  plan text DEFAULT 'starter',   -- starter | pro | creator | agency
  created_at timestamp DEFAULT now()
)

-- Créditos
user_credits (
  user_id uuid PRIMARY KEY references profiles(id),
  balance integer DEFAULT 0,
  updated_at timestamp DEFAULT now()
)

-- Transações de crédito
credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid references profiles(id),
  amount integer,                -- negativo = débito, positivo = recarga
  type text,                     -- plan_renewal | video_gen | script_ai | bonus | refund
  description text,
  created_at timestamp DEFAULT now()
)

-- Custos por operação (editável sem deploy)
credit_costs (
  operation text PRIMARY KEY,    -- studio_5min | studio_8min | tiktok_15s | etc.
  cost integer,
  description text
)

-- Projetos Studio (YouTube)
studio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid references profiles(id),
  topic text,
  duration_minutes integer,
  style text,
  voice_id text,
  language text DEFAULT 'pt-BR',
  status text DEFAULT 'queued',  -- queued | researching | scripting | storyboarding
                                 -- prompting | narrating | generating | music
                                 -- captions | editing | done | error
  current_agent integer,         -- 1 a 9
  progress integer DEFAULT 0,
  script jsonb,
  storyboard jsonb,
  video_url text,
  thumbnail_url text,
  seo_data jsonb,
  credits_used integer,
  error_message text,
  created_at timestamp DEFAULT now(),
  completed_at timestamp
)

-- Cenas de cada projeto Studio
studio_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid references studio_projects(id),
  scene_number integer,
  narration_text text,
  visual_prompt text,
  camera_direction text,
  emotion text,
  duration_seconds integer,
  audio_url text,
  video_clip_url text,
  status text DEFAULT 'pending'
)

-- Projetos TikTok
video_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid references profiles(id),
  title text,
  template text,
  status text DEFAULT 'draft',   -- draft | processing | done | error
  blocks jsonb,                  -- estado dos 4 blocos serializado
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
)

-- Vídeos TikTok gerados
generated_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid references video_projects(id),
  user_id uuid references profiles(id),
  status text DEFAULT 'queued',  -- queued | processing | done | error
  credits_used integer,
  video_url text,
  thumbnail_url text,
  duration_seconds integer,
  format text,                   -- 9:16 | 1:1 | 16:9
  job_id text,
  error_message text,
  created_at timestamp DEFAULT now(),
  completed_at timestamp
)

-- Avatares disponíveis (TikTok)
avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  preview_url text,
  heygen_avatar_id text,
  language text[],
  plan_required text DEFAULT 'starter',
  active boolean DEFAULT true
)
```

---

## Sistema de créditos

### Custo por operação
| Operação | Créditos | Custo real de API |
|---|---|---|
| Studio 5 min | 40 | ~R$6 |
| Studio 8 min | 65 | ~R$10 |
| Studio 12 min | 90 | ~R$14 |
| Studio 15 min | 110 | ~R$17 |
| TikTok vídeo 15s | 8 | ~R$0,60 |
| TikTok vídeo 30s | 15 | ~R$1,00 |
| TikTok vídeo 60s | 25 | ~R$1,80 |
| Gerar script IA | 2 | ~R$0,03 |

### Regras
- Débito acontece **antes** de chamar qualquer API
- Se a geração falhar, estorno automático via `credit_service.refund()`
- Reserva temporária durante o processamento (evita duplo clique)

### Planos
| Plano | Preço/mês | Créditos | Avatares |
|---|---|---|---|
| Starter | R$49 | 400 | — |
| Pro | R$99 | 1.000 | 1 |
| Creator | R$199 | 2.500 | 3 |
| Agency | R$349 | 5.000 | 10 |

---

## Variáveis de ambiente

```env
# frontend/.env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=https://api.clipforge.com.br

# backend/.env
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
REDIS_URL=
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY=
CLOUDFLARE_R2_SECRET_KEY=
CLOUDFLARE_R2_BUCKET=clipforge-videos
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
RUNWAY_API_KEY=
TAVILY_API_KEY=
SUNO_API_KEY=
SHOTSTACK_API_KEY=
HEYGEN_API_KEY=
KLING_API_KEY=
FAL_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

---

## Roadmap

### Fase 0 — Infraestrutura (semanas 1–3)
Setup completo: Next.js + Supabase + FastAPI + Celery + Redis + R2 + Stripe.
Auth, sistema de créditos, WebSocket de progresso, storage.

### Fase 1 — Studio MVP (semanas 4–10)
Pipeline completo dos 9 agentes funcionando.
Primeiro usuário pagante.

### Fase 2 — TikTok MVP (semanas 11–16)
Canvas de 4 blocos com HeyGen + Kling.
Aproveita toda a infra da Fase 0.

### Fase 3 — Expansão (semanas 17–24)
TikTok Shop API, analytics, avatares customizados, API pública.

---

## Rodar localmente

```bash
# Frontend
cd frontend
npm install
npm run dev        # http://localhost:3000

# Backend
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload  # http://localhost:8000

# Redis (necessário para Celery)
docker run -d -p 6379:6379 redis:alpine

# Celery worker
cd backend
celery -A tasks worker --loglevel=info
```

---

## Domínio
**clipforge.com.br**
