-- ==============================================================================
-- SONA TTG (SonaTTG) — COMPLETE SUPABASE DATABASE SCHEMA
-- ==============================================================================
-- INSTRUCTIONS:
-- 1. Create a new Supabase Project under your target organization.
-- 2. Go to the Supabase Dashboard -> SQL Editor -> New query.
-- 3. Paste this ENTIRE file into the SQL editor and click "RUN".
-- 4. After running, copy your new Project URL and Anon/Publishable Key from:
--    Project Settings -> API
-- 5. Update your application in `src/integrations/supabase/client.ts` (or .env).
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. CORE TABLES
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Departments
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Admin Users
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Admin Departments (Multiple department allocation for Admin Users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_departments (
  admin_id UUID REFERENCES public.admin_users(id) ON DELETE CASCADE NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (admin_id, department_id)
);

-- ------------------------------------------------------------------------------
-- Faculty Members
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faculty_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  designation TEXT,
  takes_electives TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Subject Types (Electives, Open Electives, Labs, Theory categories)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subject_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type_category TEXT NOT NULL,
  description TEXT,
  year TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Subjects
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  year TEXT NOT NULL,
  name TEXT NOT NULL,
  hours_per_week NUMERIC DEFAULT 0 NOT NULL,
  type TEXT NOT NULL, -- 'theory', 'lab', 'elective', 'open elective', 'special'
  tags TEXT[] DEFAULT '{}'::text[],
  code TEXT,
  abbreviation TEXT,
  staff TEXT,
  order_id INTEGER,
  subject_type_id UUID REFERENCES public.subject_types(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Subject Type <-> Subjects mapping
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subject_type_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  subject_type_id UUID REFERENCES public.subject_types(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Faculty Subject Assignments
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faculty_subject_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  faculty_id UUID REFERENCES public.faculty_members(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  year TEXT NOT NULL,
  section TEXT, -- Nullable: if null, applies across all sections
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Section Subjects
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.section_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  year TEXT NOT NULL,
  section TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Class Counselors
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_counselors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  faculty_id UUID REFERENCES public.faculty_members(id) ON DELETE CASCADE NOT NULL,
  year TEXT NOT NULL,
  section TEXT NOT NULL,
  batch TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Department Settings
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.department_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL UNIQUE,
  period_duration INTEGER DEFAULT 50 NOT NULL,
  periods_per_day INTEGER DEFAULT 7 NOT NULL,
  working_days INTEGER DEFAULT 6 NOT NULL,
  break_periods JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Special Hours Configuration
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.special_hours_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  year TEXT NOT NULL,
  special_type TEXT NOT NULL,
  total_hours INTEGER DEFAULT 0 NOT NULL,
  weekdays_hours INTEGER DEFAULT 0 NOT NULL,
  weekdays_periods JSONB DEFAULT '[]'::jsonb NOT NULL,
  saturday_hours INTEGER DEFAULT 0 NOT NULL,
  saturday_periods JSONB DEFAULT '[]'::jsonb NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Special Subjects
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.special_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  year TEXT,
  hours_per_week INTEGER NOT NULL,
  weekday_hours INTEGER DEFAULT 0 NOT NULL,
  allocation_type TEXT NOT NULL,
  static_hours JSONB DEFAULT '[]'::jsonb NOT NULL,
  static_day_period JSONB,
  priority INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Lab Preferences
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lab_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  year TEXT NOT NULL,
  section TEXT NOT NULL,
  morning_enabled BOOLEAN DEFAULT true NOT NULL,
  morning_start INTEGER,
  evening_two_hour_start_at_5 BOOLEAN DEFAULT false NOT NULL,
  priority INTEGER,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Labs (Physical Lab Infrastructure)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.labs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  lab_code TEXT NOT NULL,
  capacity INTEGER DEFAULT 30 NOT NULL,
  max_slots INTEGER DEFAULT 3 NOT NULL,
  lab_type TEXT DEFAULT 'computer' NOT NULL,
  description TEXT DEFAULT '',
  building TEXT DEFAULT '',
  floor TEXT DEFAULT '',
  room_number TEXT DEFAULT '',
  departments TEXT[] DEFAULT '{}'::text[] NOT NULL,
  equipment_list JSONB DEFAULT '[]'::jsonb,
  safety_equipment JSONB DEFAULT '[]'::jsonb,
  operating_hours JSONB DEFAULT '{}'::jsonb,
  allowed_classes JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true NOT NULL,
  maintenance_status TEXT DEFAULT 'operational',
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Lab Schedules (Bookings & Allocation)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lab_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id UUID REFERENCES public.labs(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL,
  slot_number INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  semester TEXT,
  year TEXT,
  section TEXT,
  academic_year TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  max_capacity INTEGER DEFAULT 30,
  is_available BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Open Elective Settings
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- Timetables (Active Published / Generated Timetables)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timetables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  year TEXT NOT NULL,
  section TEXT NOT NULL,
  grid_data JSONB DEFAULT '[]'::jsonb NOT NULL,
  special_flags JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT timetables_department_year_section_key UNIQUE (department_id, year, section)
);

-- ------------------------------------------------------------------------------
-- Timetable Pull Requests (Version control & Approval workflows)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timetable_pull_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  year TEXT NOT NULL,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' NOT NULL, -- 'pending', 'approved', 'rejected'
  created_by TEXT NOT NULL,
  proposed_grid_data JSONB NOT NULL,
  proposed_special_flags JSONB,
  proposed_lab_preferences JSONB,
  current_grid_data JSONB,
  current_special_flags JSONB,
  current_lab_preferences JSONB,
  review_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Pull Request Comments
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pr_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id UUID REFERENCES public.timetable_pull_requests(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Timetable Approvals (Audit Log for Applied PRs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timetable_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id UUID REFERENCES public.timetable_pull_requests(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  year TEXT NOT NULL,
  section TEXT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  proposed_grid_data JSONB DEFAULT '[]'::jsonb,
  proposed_special_flags JSONB DEFAULT '{}'::jsonb,
  proposed_lab_preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Faculty Period Schedule (Flattened per-period timetable for Faculty dashboard)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faculty_period_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID REFERENCES public.faculty_members(id) ON DELETE CASCADE NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  year TEXT NOT NULL,
  section TEXT NOT NULL,
  day INTEGER NOT NULL,
  period INTEGER NOT NULL,
  subject_name TEXT,
  is_special BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Faculty Elective Assignments
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faculty_elective_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  faculty_id UUID REFERENCES public.faculty_members(id) ON DELETE CASCADE NOT NULL,
  subject_type_id UUID REFERENCES public.subject_types(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  year TEXT NOT NULL,
  section TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Faculty Electives (Direct mapping)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faculty_electives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID REFERENCES public.faculty_members(id) ON DELETE CASCADE NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  year TEXT NOT NULL,
  section TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Faculty Labs (Direct lab subject allocation mapping)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faculty_labs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID REFERENCES public.faculty_members(id) ON DELETE CASCADE NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  year TEXT NOT NULL,
  section TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 3. INDEXES FOR HIGH PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users (email);
CREATE INDEX IF NOT EXISTS idx_faculty_members_dept ON public.faculty_members (department_id);
CREATE INDEX IF NOT EXISTS idx_faculty_members_email ON public.faculty_members (email);
CREATE INDEX IF NOT EXISTS idx_subjects_dept_year ON public.subjects (department_id, year);
CREATE INDEX IF NOT EXISTS idx_fsa_dept_year_sec ON public.faculty_subject_assignments (department_id, year, section);
CREATE INDEX IF NOT EXISTS idx_fsa_faculty_id ON public.faculty_subject_assignments (faculty_id);
CREATE INDEX IF NOT EXISTS idx_section_subjects_lookup ON public.section_subjects (department_id, year, section);
CREATE INDEX IF NOT EXISTS idx_timetables_lookup ON public.timetables (department_id, year, section);
CREATE INDEX IF NOT EXISTS idx_lab_schedules_lookup ON public.lab_schedules (lab_id, day_of_week, slot_number);
CREATE INDEX IF NOT EXISTS idx_lab_schedules_class ON public.lab_schedules (year, section);
CREATE INDEX IF NOT EXISTS idx_fps_faculty ON public.faculty_period_schedule (faculty_id);
CREATE INDEX IF NOT EXISTS idx_fps_slot ON public.faculty_period_schedule (day, period);
CREATE INDEX IF NOT EXISTS idx_cc_lookup ON public.class_counselors (department_id, year, section);

-- ==============================================================================
-- 4. DATABASE FUNCTIONS / STORED PROCEDURES (RPCs)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- hash_password: Hash plain password using bcrypt
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hash_password(password TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN crypt(password, gen_salt('bf', 8));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- verify_password: Check password against hashed password
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_password(password TEXT, hashed_password TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN hashed_password = crypt(password, hashed_password);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- get_class_counselor_info: Returns faculty id and name for given dept, year, sec
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_class_counselor_info(
  dept_id UUID,
  section_param TEXT,
  year_param TEXT
)
RETURNS TABLE (
  faculty_id UUID,
  faculty_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cc.faculty_id,
    fm.name AS faculty_name
  FROM public.class_counselors cc
  JOIN public.faculty_members fm ON cc.faculty_id = fm.id
  WHERE cc.department_id = dept_id
    AND cc.year = year_param
    AND cc.section = section_param
    AND cc.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- populate_faculty_schedule_from_timetable (RPC placeholder with JS fallback)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.populate_faculty_schedule_from_timetable(
  p_department_id UUID,
  p_year TEXT,
  p_section TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Handled dynamically by application client
  NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- populate_all_faculty_schedules (RPC placeholder with JS fallback)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.populate_all_faculty_schedules()
RETURNS VOID AS $$
BEGIN
  -- Handled dynamically by application client
  NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
-- Enable RLS and grant full CRUD access for anon and authenticated users
-- (SONA TTG manages authentication at the application level).

DO $$ 
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'departments',
    'admin_users',
    'admin_departments',
    'faculty_members',
    'subject_types',
    'subjects',
    'subject_type_subjects',
    'faculty_subject_assignments',
    'section_subjects',
    'class_counselors',
    'department_settings',
    'special_hours_config',
    'special_subjects',
    'lab_preferences',
    'labs',
    'lab_schedules',
    'open_elective_settings',
    'timetables',
    'timetable_pull_requests',
    'pr_comments',
    'timetable_approvals',
    'faculty_period_schedule',
    'faculty_elective_assignments',
    'faculty_electives',
    'faculty_labs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Enable RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    
    -- Drop existing policy if any
    EXECUTE format('DROP POLICY IF EXISTS "Allow all operations" ON public.%I;', tbl);
    
    -- Create permissive policy for full read/write
    EXECUTE format('CREATE POLICY "Allow all operations" ON public.%I FOR ALL USING (true) WITH CHECK (true);', tbl);
  END LOOP;
END $$;

-- ==============================================================================
-- 6. PERMISSIONS
-- ==============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- ==============================================================================
-- 7. INITIAL SEED DATA (OPTIONAL / CONVENIENCE)
-- ==============================================================================
-- Default Department
INSERT INTO public.departments (id, name)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Information Technology'),
  ('22222222-2222-2222-2222-222222222222', 'Artificial Intelligence and Data Science')
ON CONFLICT (name) DO NOTHING;

-- Default Department Settings
INSERT INTO public.department_settings (department_id, period_duration, periods_per_day, working_days, break_periods)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 50, 7, 6, '[{"period": 2, "duration": 15}, {"period": 4, "duration": 60}]'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 50, 7, 6, '[{"period": 2, "duration": 15}, {"period": 4, "duration": 60}]'::jsonb)
ON CONFLICT (department_id) DO NOTHING;

-- Default Admin User (Password: admin123)
-- You can log in with:
-- Super Admin: superadmin / superadmin (Hardcoded in UI)
-- Dept Admin: it_admin@gmail.com / admin123
INSERT INTO public.admin_users (id, name, email, password_hash, department_id, is_active)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  'IT Admin',
  'it_admin@gmail.com',
  public.hash_password('admin123'),
  '11111111-1111-1111-1111-111111111111',
  true
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.admin_departments (admin_id, department_id)
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (admin_id, department_id) DO NOTHING;

-- ==============================================================================
-- DONE! Your new Supabase project is now 100% ready for SONA TTG.
-- ==============================================================================
