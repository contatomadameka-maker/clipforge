# ClipForge — Setup Local

Guia completo para rodar o projeto pela primeira vez na sua máquina.

---

## Pré-requisitos

Instale antes de começar:

- [Node.js 18+](https://nodejs.org)
- [Python 3.11+](https://python.org)
- [Git](https://git-scm.com)
- [Docker Desktop](https://docker.com/products/docker-desktop) (para o Redis)

---

## 1. Clonar o repositório

```bash
git clone https://github.com/contatomadameka-maker/clipforge.git
cd clipforge
```

---

## 2. Supabase — criar o projeto e as tabelas

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. Clique em **New project**
   - Nome: `clipforge`
   - Senha do banco: guarde em local seguro
   - Região: South America (São Paulo)
3. Aguarde o projeto iniciar (~2 min)
4. Vá em **SQL Editor** → **New query**
5. Cole todo o conteúdo do arquivo `docs/schema.sql`
6. Clique em **Run**
7. Confirme que todas as tabelas foram criadas em **Table Editor**

**Copie as chaves** em Settings → API:
- `Project URL` → `SUPABASE_URL`
- `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` → `SUPABASE_SERVICE_KEY`

---

## 3. Backend — FastAPI

### 3.1 Criar ambiente virtual e instalar dependências

```bash
cd backend
python -m venv venv

# Mac/Linux:
source venv/bin/activate

# Windows:
venv\Scripts\activate

pip install -r requirements.txt
```

### 3.2 Criar o arquivo .env

Crie o arquivo `backend/.env` com suas chaves:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

REDIS_URL=redis://localhost:6379

CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY=
CLOUDFLARE_R2_SECRET_KEY=
CLOUDFLARE_R2_BUCKET=clipforge-videos
CLOUDFLARE_R2_PUBLIC_URL=

ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
ELEVENLABS_API_KEY=
RUNWAY_API_KEY=
SUNO_API_KEY=
SHOTSTACK_API_KEY=

HEYGEN_API_KEY=
KLING_API_KEY=
FAL_API_KEY=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

ENVIRONMENT=development
FRONTEND_URL=http://localhost:3000
```

> ⚠️ Nunca commite o `.env` — já está no `.gitignore`

### 3.3 Rodar o Redis (via Docker)

```bash
# Em um terminal separado:
docker run -d -p 6379:6379 --name clipforge-redis redis:alpine
```

### 3.4 Rodar o backend

```bash
# No diretório backend/ com o venv ativado:
uvicorn main:app --reload --port 8000
```

Acesse: [http://localhost:8000](http://localhost:8000)
Documentação: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3.5 Rodar o worker Celery (em outro terminal)

```bash
cd backend
source venv/bin/activate  # ou venv\Scripts\activate no Windows

celery -A tasks.studio_tasks.celery_app worker --loglevel=info
```

---

## 4. Frontend — Next.js

### 4.1 Instalar dependências

```bash
cd frontend
npm install
```

### 4.2 Criar o arquivo .env.local

Crie o arquivo `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 4.3 Rodar o frontend

```bash
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

## 5. Verificar se tudo está funcionando

Com os 4 processos rodando em paralelo:

| Terminal | Processo | Porta |
|---|---|---|
| 1 | Redis | 6379 |
| 2 | FastAPI backend | 8000 |
| 3 | Celery worker | — |
| 4 | Next.js frontend | 3000 |

**Testes rápidos:**

```bash
# Backend health check
curl http://localhost:8000/health
# Esperado: {"status":"healthy"}

# Documentação da API
# Abrir no browser: http://localhost:8000/docs

# Frontend
# Abrir no browser: http://localhost:3000
```

---

## 6. Primeiro teste de geração

1. Acesse `http://localhost:3000`
2. Crie uma conta (vai receber 50 créditos de bônus)
3. Vá em **Studio — YouTube**
4. Digite um tema: `Davi e Golias`
5. Selecione 5 minutos, estilo Bíblico
6. Clique em **Gerar vídeo**
7. Acompanhe o pipeline de agentes em tempo real

> Na primeira execução, certifique-se de ter saldo nas APIs (Tavily, Claude, ElevenLabs, Runway).

---

## 7. Estrutura de terminais recomendada

```
┌─────────────────┬─────────────────┐
│  Terminal 1     │  Terminal 2     │
│  Redis          │  FastAPI        │
│                 │                 │
│  docker run ... │  uvicorn ...    │
├─────────────────┼─────────────────┤
│  Terminal 3     │  Terminal 4     │
│  Celery worker  │  Next.js        │
│                 │                 │
│  celery ...     │  npm run dev    │
└─────────────────┴─────────────────┘
```

---

## Problemas comuns

**`ModuleNotFoundError`**
→ Verifique se o venv está ativado: `source venv/bin/activate`

**`Connection refused` no Redis**
→ Verifique se o Docker está rodando: `docker ps`

**`Invalid API key` no Supabase**
→ Confira se copiou a `service_role` key (não a `anon`)

**Página em branco no frontend**
→ Verifique o `.env.local` e reinicie com `npm run dev`

**Créditos não debitam**
→ Verifique se o RLS está ativo no Supabase (Settings → Database → RLS)
