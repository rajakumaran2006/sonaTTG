-- Create faculty_period_schedule table for individual faculty timetables
CREATE TABLE public.faculty_period_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES public.faculty_members(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  year text NOT NULL,
  section text NOT NULL,
  day smallint NOT NULL CHECK (day >= 0 AND day <= 6),
  period smallint NOT NULL CHECK (period >= 0 AND period <= 10),
  subject_name text,
  is_special boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(faculty_id, department_id, year, section, day, period)
);

-- Enable RLS
ALTER TABLE public.faculty_period_schedule ENABLE ROW LEVEL SECURITY;

-- Create policies for faculty_period_schedule
CREATE POLICY "faculty_period_schedule are publicly readable"
  ON public.faculty_period_schedule FOR SELECT
  USING (true);

CREATE POLICY "faculty_period_schedule are publicly insertable"
  ON public.faculty_period_schedule FOR INSERT
  WITH CHECK (true);

CREATE POLICY "faculty_period_schedule are publicly updatable"
  ON public.faculty_period_schedule FOR UPDATE
  USING (true);

CREATE POLICY "faculty_period_schedule are publicly deletable"
  ON public.faculty_period_schedule FOR DELETE
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_faculty_schedule_faculty_id ON public.faculty_period_schedule(faculty_id);
CREATE INDEX IF NOT EXISTS idx_faculty_schedule_dept_year_section ON public.faculty_period_schedule(department_id, year, section);
CREATE INDEX IF NOT EXISTS idx_faculty_schedule_day_period ON public.faculty_period_schedule(day, period);

-- Maintain updated_at trigger
CREATE TRIGGER trg_faculty_period_schedule_updated_at
  BEFORE UPDATE ON public.faculty_period_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample data for testing (optional - remove if not needed)
-- This assumes you have faculty members in your database
DO $$
DECLARE
  sample_faculty_id uuid;
  sample_dept_id uuid;
BEGIN
  -- Get a sample faculty member (first one found)
  SELECT id INTO sample_faculty_id FROM public.faculty_members LIMIT 1;
  SELECT department_id INTO sample_dept_id FROM public.faculty_members WHERE id = sample_faculty_id;
  
  IF sample_faculty_id IS NOT NULL THEN
    -- Insert sample schedule for testing
    INSERT INTO public.faculty_period_schedule (faculty_id, department_id, year, section, day, period, subject_name, is_special) VALUES
      (sample_faculty_id, sample_dept_id, 'III', 'A', 0, 0, 'Machine Learning', false),
      (sample_faculty_id, sample_dept_id, 'III', 'A', 0, 1, 'Database Systems', false),
      (sample_faculty_id, sample_dept_id, 'III', 'B', 1, 2, 'AI Lab', false),
      (sample_faculty_id, sample_dept_id, 'III', 'A', 2, 3, 'Data Mining', false),
      (sample_faculty_id, sample_dept_id, 'II', 'A', 3, 4, 'Programming', false),
      (sample_faculty_id, sample_dept_id, 'III', 'A', 4, 5, 'Student Counselling', true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
