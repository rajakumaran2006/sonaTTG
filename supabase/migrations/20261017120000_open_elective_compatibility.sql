-- Migration: Open Elective Settings Compatibility
-- Date: 2026-10-17
-- Purpose: Provide open_elective_settings table/view compatibility for any external tools
-- while primary application data is managed via open_elective_hours.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'open_elective_settings'
  ) THEN
    CREATE TABLE IF NOT EXISTS public.open_elective_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
      year TEXT NOT NULL,
      hours INTEGER DEFAULT 5 NOT NULL,
      group_name TEXT DEFAULT 'Open elective',
      is_shared_slot BOOLEAN DEFAULT true NOT NULL,
      selected_slots JSONB DEFAULT '["Mon-1","Wed-1","Fri-1","Sat-1","Sat-2"]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
      CONSTRAINT open_elective_settings_dept_year_key UNIQUE (department_id, year)
    );
    ALTER TABLE public.open_elective_settings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow all operations on open_elective_settings" ON public.open_elective_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
