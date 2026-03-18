-- ============================================================
-- ARISE — Diagnostic + Fix Script
-- Paste this ENTIRE block into Supabase SQL Editor and Run All
-- ============================================================

-- Step 1: Check if reports table exists (must exist first)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'reports'
  ) THEN
    RAISE EXCEPTION 'ERROR: The reports table does not exist. Run reports_table.sql FIRST, then re-run this file.';
  END IF;
END $$;

-- Step 2: Drop report_analysis table if it exists (clean slate)
DROP TABLE IF EXISTS public.report_analysis CASCADE;

-- Step 3: Create the report_analysis table fresh
CREATE TABLE public.report_analysis (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  hemoglobin   numeric,
  rbc          numeric,
  wbc          numeric,
  platelets    numeric,
  health_score integer,
  ai_summary   text,
  analyzed_at  timestamptz NOT NULL DEFAULT now()
);

-- Step 4: Enable RLS
ALTER TABLE public.report_analysis ENABLE ROW LEVEL SECURITY;

-- Step 5: Drop any old policies
DROP POLICY IF EXISTS "Users can insert their own analysis" ON public.report_analysis;
DROP POLICY IF EXISTS "Users can select their own analysis" ON public.report_analysis;
DROP POLICY IF EXISTS "Users can delete their own analysis" ON public.report_analysis;

-- Step 6: Create RLS policies
CREATE POLICY "Users can insert their own analysis"
ON public.report_analysis FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = report_analysis.report_id
      AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can select their own analysis"
ON public.report_analysis FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = report_analysis.report_id
      AND reports.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own analysis"
ON public.report_analysis FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE reports.id = report_analysis.report_id
      AND reports.user_id = auth.uid()
  )
);

-- Step 7: Verify table was created
SELECT
  table_name,
  'EXISTS ✓' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'report_analysis';
