-- Migration: Relax check constraints on subjects table to allow Project Work (up to 42 hours/week) and higher credits
-- Issue: Year IV (Semester VIII) Project Work requires 37 hours/week, which violated subjects_hours_per_week_check (limited to 10).

ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_hours_per_week_check;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_hours_per_week_check CHECK (hours_per_week >= 0 AND hours_per_week <= 42);

ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_credits_check;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_credits_check CHECK (credits >= 0 AND credits <= 20);
