-- ============================================================
-- Migration: Add Missing CBC Metric Columns to report_analysis
-- ============================================================
-- Run this script in Supabase SQL Editor to add the missing columns:
-- MCH, MCHC, MCV, Neutrophils, Lymphocytes, ESR

-- Add missing columns to report_analysis table
ALTER TABLE public.report_analysis
ADD COLUMN IF NOT EXISTS mcv numeric,
ADD COLUMN IF NOT EXISTS mch numeric,
ADD COLUMN IF NOT EXISTS mchc numeric,
ADD COLUMN IF NOT EXISTS neutrophils numeric,
ADD COLUMN IF NOT EXISTS lymphocytes numeric,
ADD COLUMN IF NOT EXISTS esr numeric;

-- Verify the columns were added
SELECT 
  column_name, 
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'report_analysis'
ORDER BY ordinal_position;
