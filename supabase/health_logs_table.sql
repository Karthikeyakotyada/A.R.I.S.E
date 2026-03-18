-- ============================================================
--  ARISE – Health Logs table
--  Run this in the Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.health_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  heart_rate    INTEGER,
  blood_pressure TEXT,
  blood_sugar   NUMERIC,
  temperature   NUMERIC,
  symptoms      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helpful index for per-user history queries
CREATE INDEX IF NOT EXISTS health_logs_user_created_at_idx
  ON public.health_logs (user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;

-- Policies: users can only access their own logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'health_logs'
      AND policyname = 'Users can view own health logs'
  ) THEN
    CREATE POLICY "Users can view own health logs"
      ON public.health_logs
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'health_logs'
      AND policyname = 'Users can insert own health logs'
  ) THEN
    CREATE POLICY "Users can insert own health logs"
      ON public.health_logs
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'health_logs'
      AND policyname = 'Users can update own health logs'
  ) THEN
    CREATE POLICY "Users can update own health logs"
      ON public.health_logs
      FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'health_logs'
      AND policyname = 'Users can delete own health logs'
  ) THEN
    CREATE POLICY "Users can delete own health logs"
      ON public.health_logs
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- Done!
-- ============================================================

