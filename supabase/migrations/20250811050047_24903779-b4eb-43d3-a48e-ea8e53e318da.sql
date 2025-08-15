-- Phase 2: Pull Request System Schema
-- Create timetable_pull_requests table
CREATE TABLE IF NOT EXISTS public.timetable_pull_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  department_id UUID REFERENCES public.departments(id),
  year TEXT NOT NULL,
  section TEXT NOT NULL,

  -- Proposed timetable data
  proposed_grid_data JSONB NOT NULL,
  proposed_special_flags JSONB DEFAULT '{}'::jsonb,
  proposed_lab_preferences JSONB DEFAULT '{}'::jsonb,

  -- Current timetable data (for comparison)
  current_grid_data JSONB,
  current_special_flags JSONB,
  current_lab_preferences JSONB,

  -- Metadata
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only one PR per (department, year, section, status)
  UNIQUE(department_id, year, section, status)
);

-- Create pr_comments table
CREATE TABLE IF NOT EXISTS public.pr_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id UUID REFERENCES public.timetable_pull_requests(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pr_status ON public.timetable_pull_requests(status);
CREATE INDEX IF NOT EXISTS idx_pr_department_year_section ON public.timetable_pull_requests(department_id, year, section);

-- Trigger to auto-update updated_at on timetable_pull_requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_timetable_prs_set_updated_at'
  ) THEN
    CREATE TRIGGER trg_timetable_prs_set_updated_at
    BEFORE UPDATE ON public.timetable_pull_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END$$;
