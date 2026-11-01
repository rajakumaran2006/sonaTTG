-- Migration: Allow decimal and zero credits for subjects
-- Date: 2026-11-01
-- Purpose: Support fractional credits (e.g. 1.5, 0.5, 2.5) and non-credit courses (0 credits) in the subjects table.

ALTER TABLE public.subjects ALTER COLUMN credits TYPE NUMERIC(4,1);

ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_credits_check;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_credits_check CHECK (credits >= 0 AND credits <= 20);

