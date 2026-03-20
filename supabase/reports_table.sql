-- ============================================================
-- ARISE — CBC Reports Table + Storage Setup (Fixed Version)
-- ============================================================

-- 1️⃣ Create reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  analysis_status text NOT NULL DEFAULT 'uploaded',
  uploaded_at timestamptz DEFAULT now()
);

-- Ensure status column exists for older deployments.
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS analysis_status text;

-- Backfill and enforce lifecycle-safe status values.
UPDATE public.reports
SET analysis_status = 'uploaded'
WHERE analysis_status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reports_analysis_status_check'
  ) THEN
    ALTER TABLE public.reports
    ADD CONSTRAINT reports_analysis_status_check
    CHECK (analysis_status IN ('uploaded', 'analysis_pending', 'analysis_complete', 'analysis_failed'));
  END IF;
END $$;

ALTER TABLE public.reports
ALTER COLUMN analysis_status SET DEFAULT 'uploaded';

ALTER TABLE public.reports
ALTER COLUMN analysis_status SET NOT NULL;

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- DROP OLD POLICIES (prevents duplicate errors)
-- ============================================================

DROP POLICY IF EXISTS "Users can insert their own reports" ON public.reports;
DROP POLICY IF EXISTS "Users can select their own reports" ON public.reports;
DROP POLICY IF EXISTS "Users can delete their own reports" ON public.reports;

-- ============================================================
-- CREATE NEW RLS POLICIES
-- ============================================================

-- INSERT
CREATE POLICY "Users can insert their own reports"
ON public.reports
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- SELECT
CREATE POLICY "Users can select their own reports"
ON public.reports
FOR SELECT
USING (auth.uid() = user_id);

-- DELETE
CREATE POLICY "Users can delete their own reports"
ON public.reports
FOR DELETE
USING (auth.uid() = user_id);

-- ============================================================
-- STORAGE BUCKET SETUP
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('cbc-reports', 'cbc-reports', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STORAGE POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Users can upload their own reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own reports" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own reports" ON storage.objects;

-- INSERT FILE
CREATE POLICY "Users can upload their own reports"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cbc-reports'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- READ FILE
CREATE POLICY "Users can read their own reports"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'cbc-reports'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- DELETE FILE
CREATE POLICY "Users can delete their own reports"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'cbc-reports'
  AND auth.uid()::text = (storage.foldername(name))[2]
);