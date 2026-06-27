-- ─────────────────────────────────────────────────────────────
-- ClipForge — Schema completo do banco de dados
-- Cole este SQL no Supabase SQL Editor e execute
-- ─────────────────────────────────────────────────────────────


-- ── Perfis de usuário ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  plan text NOT NULL DEFAULT 'starter',
  created_at timestamptz DEFAULT now()
);

-- ── Créditos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_credits (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- ── Transações de crédito ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  type text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- ── Custos por operação ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_costs (
  operation text PRIMARY KEY,
  cost integer NOT NULL,
  description text
);

INSERT INTO credit_costs (operation, cost, description) VALUES
  ('studio_5min',  40,  'Studio — vídeo de 5 minutos'),
  ('studio_8min',  65,  'Studio — vídeo de 8 minutos'),
  ('studio_12min', 90,  'Studio — vídeo de 12 minutos'),
  ('studio_15min', 110, 'Studio — vídeo de 15 minutos'),
  ('tiktok_15s',   8,   'TikTok — vídeo de 15 segundos'),
  ('tiktok_30s',   15,  'TikTok — vídeo de 30 segundos'),
  ('tiktok_45s',   20,  'TikTok — vídeo de 45 segundos'),
  ('tiktok_60s',   25,  'TikTok — vídeo de 60 segundos'),
  ('script_ai',    2,   'Geração de script com IA'),
  ('image_static', 1,   'Geração de imagem estática')
ON CONFLICT (operation) DO NOTHING;

-- ── Projetos Studio (YouTube) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS studio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  topic text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 8,
  style text NOT NULL DEFAULT 'documentary',
  voice_id text NOT NULL DEFAULT 'male-deep',
  language text NOT NULL DEFAULT 'pt-BR',
  status text NOT NULL DEFAULT 'queued',
  current_agent integer DEFAULT 0,
  progress integer DEFAULT 0,
  script jsonb,
  storyboard jsonb,
  video_url text,
  thumbnail_url text,
  seo_data jsonb,
  credits_used integer,
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- ── Cenas do Studio ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS studio_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  scene_number integer NOT NULL,
  narration_text text,
  visual_prompt text,
  camera_direction text,
  emotion text,
  duration_seconds integer,
  audio_url text,
  video_clip_url text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- ── Projetos TikTok ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  template text,
  status text NOT NULL DEFAULT 'draft',
  blocks jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Vídeos TikTok gerados ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS generated_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  credits_used integer,
  video_url text,
  thumbnail_url text,
  duration_seconds integer,
  format text DEFAULT '9:16',
  job_id text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- ── Avatares TikTok ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  preview_url text,
  heygen_avatar_id text,
  language text[],
  plan_required text DEFAULT 'starter',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO avatars (name, heygen_avatar_id, language, plan_required) VALUES
  ('Ana',    'heygen_ana_id',    ARRAY['pt-BR', 'en'], 'starter'),
  ('Carlos', 'heygen_carlos_id', ARRAY['pt-BR', 'es'], 'starter'),
  ('Bianca', 'heygen_bianca_id', ARRAY['pt-BR'],       'starter'),
  ('Lucas',  'heygen_lucas_id',  ARRAY['pt-BR', 'en'], 'pro'),
  ('Mel',    'heygen_mel_id',    ARRAY['pt-BR', 'en', 'es'], 'pro'),
  ('Diego',  'heygen_diego_id',  ARRAY['pt-BR'],       'creator')
ON CONFLICT DO NOTHING;


-- ── RLS (Row Level Security) ──────────────────────────────────
-- Garante que cada usuário só vê seus próprios dados

ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_scenes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_videos    ENABLE ROW LEVEL SECURITY;

-- Profiles: usuário vê apenas o próprio perfil
CREATE POLICY "profiles_own" ON profiles
  FOR ALL USING (auth.uid() = id);

-- Créditos: usuário vê apenas o próprio saldo
CREATE POLICY "credits_own" ON user_credits
  FOR ALL USING (auth.uid() = user_id);

-- Transações: usuário vê apenas as próprias
CREATE POLICY "transactions_own" ON credit_transactions
  FOR ALL USING (auth.uid() = user_id);

-- Studio projects: usuário vê apenas os próprios
CREATE POLICY "studio_projects_own" ON studio_projects
  FOR ALL USING (auth.uid() = user_id);

-- Studio scenes: usuário vê apenas as cenas dos próprios projetos
CREATE POLICY "studio_scenes_own" ON studio_scenes
  FOR ALL USING (
    project_id IN (
      SELECT id FROM studio_projects WHERE user_id = auth.uid()
    )
  );

-- TikTok projects: usuário vê apenas os próprios
CREATE POLICY "video_projects_own" ON video_projects
  FOR ALL USING (auth.uid() = user_id);

-- TikTok videos: usuário vê apenas os próprios
CREATE POLICY "generated_videos_own" ON generated_videos
  FOR ALL USING (auth.uid() = user_id);

-- Avatares: todos podem ver (tabela pública)
CREATE POLICY "avatars_public" ON avatars
  FOR SELECT USING (true);

-- Custos: todos podem ver (tabela pública)
ALTER TABLE credit_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_costs_public" ON credit_costs
  FOR SELECT USING (true);


-- ── Índices para performance ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_studio_projects_user    ON studio_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_studio_projects_status  ON studio_projects(status);
CREATE INDEX IF NOT EXISTS idx_studio_scenes_project   ON studio_scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_video_projects_user     ON video_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_videos_user   ON generated_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_user          ON credit_transactions(user_id);
