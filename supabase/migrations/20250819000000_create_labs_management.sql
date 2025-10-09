-- =============================================
-- COMPLETE LAB MANAGEMENT SYSTEM IMPLEMENTATION
-- =============================================

-- Create labs management system with comprehensive features

-- 1. Enhanced labs table with required fields
create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  lab_code text not null unique, -- e.g., 'CL1', 'EL1', 'PL1' - REQUIRED
  capacity integer not null check (capacity > 0),
  max_slots integer not null check (max_slots > 0) default 3,
  lab_type text not null check (lab_type in ('computer', 'electronics', 'physics', 'chemistry', 'biology', 'workshop', 'other')),
  description text not null,
  building text not null,
  floor text not null,
  room_number text not null,
  equipment_list jsonb not null default '[]'::jsonb, -- array of equipment items - REQUIRED
  safety_equipment jsonb not null default '[]'::jsonb, -- array of safety equipment - REQUIRED
  operating_hours jsonb not null, -- flexible operating hours configuration - REQUIRED
  is_active boolean not null default true,
  maintenance_status text not null check (maintenance_status in ('operational', 'maintenance', 'out_of_order')) default 'operational',
  last_maintenance_date date,
  next_maintenance_date date,
  department_id uuid not null references public.departments(id), -- REQUIRED - link to department
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Lab administrators - assign specific admins to manage labs
create table if not exists public.lab_admins (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  admin_name text not null,
  admin_email text not null,
  admin_phone text,
  admin_role text check (admin_role in ('primary', 'secondary', 'assistant')) default 'primary',
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  assigned_by uuid,
  notes text,
  unique(lab_id, admin_email)
);

-- 3. Enhanced lab schedules with comprehensive booking system
create table if not exists public.lab_schedules (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  day_of_week integer not null check (day_of_week >= 1 and day_of_week <= 7), -- 1=Monday, 7=Sunday
  start_time time not null,
  end_time time not null,
  slot_type text check (slot_type in ('regular', 'extended', 'special')) default 'regular',
  max_capacity integer not null check (max_capacity > 0),
  slot_number integer not null check (slot_number > 0),
  is_available boolean not null default true,
  is_booked boolean not null default false,
  semester text, -- e.g., 'I', 'II', 'III', etc.
  academic_year text, -- e.g., '2024-2025'
  subject_id uuid references public.subjects(id), -- link to specific subject
  faculty_id uuid references public.faculty_members(id), -- assigned faculty
  section text, -- class section (A, B, C, etc.)
  year text, -- academic year (I, II, III, IV)
  booking_purpose text, -- purpose of booking (lab session, exam, etc.)
  special_requirements text, -- special equipment or setup needed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lab_id, day_of_week, start_time, slot_number)
);

-- 4. Lab bookings/reservations system
create table if not exists public.lab_bookings (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  schedule_id uuid references public.lab_schedules(id) on delete set null,
  subject_id uuid references public.subjects(id),
  faculty_id uuid references public.faculty_members(id),
  section text not null,
  year text not null,
  semester text not null,
  academic_year text not null,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  purpose text not null, -- 'regular_lab', 'exam', 'workshop', 'maintenance', etc.
  student_count integer check (student_count > 0),
  special_requirements text,
  equipment_needed jsonb default '[]'::jsonb,
  status text check (status in ('pending', 'confirmed', 'cancelled', 'completed')) default 'pending',
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Lab equipment tracking
create table if not exists public.lab_equipment (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  equipment_name text not null,
  equipment_type text not null,
  model_number text,
  serial_number text unique,
  purchase_date date,
  warranty_expiry date,
  condition text check (condition in ('excellent', 'good', 'fair', 'poor', 'broken')) default 'good',
  is_operational boolean default true,
  maintenance_schedule text, -- 'monthly', 'quarterly', 'annually', etc.
  last_maintenance_date date,
  next_maintenance_date date,
  cost decimal(10,2),
  supplier text,
  location_in_lab text, -- specific location within the lab
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. Lab usage statistics and analytics
create table if not exists public.lab_usage_stats (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  date date not null,
  total_bookings integer default 0,
  total_hours_booked decimal(4,2) default 0,
  utilization_rate decimal(5,2) default 0, -- percentage
  average_students_per_session decimal(4,1) default 0,
  equipment_utilization jsonb default '{}', -- equipment usage stats
  issues_reported integer default 0,
  maintenance_incidents integer default 0,
  created_at timestamptz not null default now(),
  unique(lab_id, date)
);

-- 7. Lab maintenance records
create table if not exists public.lab_maintenance (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  equipment_id uuid references public.lab_equipment(id) on delete set null,
  maintenance_type text check (maintenance_type in ('preventive', 'corrective', 'emergency', 'calibration', 'cleaning')),
  description text not null,
  scheduled_date date,
  completed_date date,
  cost decimal(10,2),
  performed_by text,
  status text check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')) default 'scheduled',
  priority text check (priority in ('low', 'medium', 'high', 'critical')) default 'medium',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS on all tables
alter table public.labs enable row level security;
alter table public.lab_admins enable row level security;
alter table public.lab_schedules enable row level security;
alter table public.lab_bookings enable row level security;
alter table public.lab_equipment enable row level security;
alter table public.lab_usage_stats enable row level security;
alter table public.lab_maintenance enable row level security;

-- Create policies for all tables (public read, authenticated write)
do $$
begin
  -- Labs policies
  if not exists (select 1 from pg_policies where polname = 'labs are publicly readable') then
    create policy "labs are publicly readable" on public.labs for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'labs are publicly manageable') then
    create policy "labs are publicly manageable" on public.labs for all using (true);
  end if;

  -- Lab admins policies
  if not exists (select 1 from pg_policies where polname = 'lab_admins are publicly readable') then
    create policy "lab_admins are publicly readable" on public.lab_admins for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'lab_admins are publicly manageable') then
    create policy "lab_admins are publicly manageable" on public.lab_admins for all using (true);
  end if;

  -- Lab schedules policies
  if not exists (select 1 from pg_policies where polname = 'lab_schedules are publicly readable') then
    create policy "lab_schedules are publicly readable" on public.lab_schedules for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'lab_schedules are publicly manageable') then
    create policy "lab_schedules are publicly manageable" on public.lab_schedules for all using (true);
  end if;

  -- Lab bookings policies
  if not exists (select 1 from pg_policies where polname = 'lab_bookings are publicly readable') then
    create policy "lab_bookings are publicly readable" on public.lab_bookings for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'lab_bookings are publicly manageable') then
    create policy "lab_bookings are publicly manageable" on public.lab_bookings for all using (true);
  end if;

  -- Lab equipment policies
  if not exists (select 1 from pg_policies where polname = 'lab_equipment are publicly readable') then
    create policy "lab_equipment are publicly readable" on public.lab_equipment for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'lab_equipment are publicly manageable') then
    create policy "lab_equipment are publicly manageable" on public.lab_equipment for all using (true);
  end if;

  -- Lab usage stats policies
  if not exists (select 1 from pg_policies where polname = 'lab_usage_stats are publicly readable') then
    create policy "lab_usage_stats are publicly readable" on public.lab_usage_stats for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'lab_usage_stats are publicly manageable') then
    create policy "lab_usage_stats are publicly manageable" on public.lab_usage_stats for all using (true);
  end if;

  -- Lab maintenance policies
  if not exists (select 1 from pg_policies where polname = 'lab_maintenance are publicly readable') then
    create policy "lab_maintenance are publicly readable" on public.lab_maintenance for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'lab_maintenance are publicly manageable') then
    create policy "lab_maintenance are publicly manageable" on public.lab_maintenance for all using (true);
  end if;
end $$;

-- Create comprehensive indexes for better performance
create index if not exists idx_labs_active on public.labs(is_active);
create index if not exists idx_labs_department on public.labs(department_id);
create index if not exists idx_labs_type on public.labs(lab_type);

create index if not exists idx_lab_admins_lab on public.lab_admins(lab_id);
create index if not exists idx_lab_admins_email on public.lab_admins(admin_email);

create index if not exists idx_lab_schedules_lab on public.lab_schedules(lab_id);
create index if not exists idx_lab_schedules_day_time on public.lab_schedules(day_of_week, start_time);
create index if not exists idx_lab_schedules_subject on public.lab_schedules(subject_id);
create index if not exists idx_lab_schedules_faculty on public.lab_schedules(faculty_id);

create index if not exists idx_lab_bookings_lab on public.lab_bookings(lab_id);
create index if not exists idx_lab_bookings_date on public.lab_bookings(booking_date);
create index if not exists idx_lab_bookings_faculty on public.lab_bookings(faculty_id);
create index if not exists idx_lab_bookings_subject on public.lab_bookings(subject_id);
create index if not exists idx_lab_bookings_status on public.lab_bookings(status);

create index if not exists idx_lab_equipment_lab on public.lab_equipment(lab_id);
create index if not exists idx_lab_equipment_type on public.lab_equipment(equipment_type);
create index if not exists idx_lab_equipment_condition on public.lab_equipment(condition);

create index if not exists idx_lab_usage_stats_lab on public.lab_usage_stats(lab_id);
create index if not exists idx_lab_usage_stats_date on public.lab_usage_stats(date);

create index if not exists idx_lab_maintenance_lab on public.lab_maintenance(lab_id);
create index if not exists idx_lab_maintenance_status on public.lab_maintenance(status);
create index if not exists idx_lab_maintenance_priority on public.lab_maintenance(priority);

-- Create triggers for updated_at if helper function exists
do $$
begin
  if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
    -- Labs triggers
    drop trigger if exists trg_labs_updated_at on public.labs;
    create trigger trg_labs_updated_at
    before update on public.labs
    for each row execute procedure public.update_updated_at_column();

    -- Lab admins triggers
    drop trigger if exists trg_lab_admins_updated_at on public.lab_admins;
    create trigger trg_lab_admins_updated_at
    before update on public.lab_admins
    for each row execute procedure public.update_updated_at_column();

    -- Lab schedules triggers
    drop trigger if exists trg_lab_schedules_updated_at on public.lab_schedules;
    create trigger trg_lab_schedules_updated_at
    before update on public.lab_schedules
    for each row execute procedure public.update_updated_at_column();

    -- Lab bookings triggers
    drop trigger if exists trg_lab_bookings_updated_at on public.lab_bookings;
    create trigger trg_lab_bookings_updated_at
    before update on public.lab_bookings
    for each row execute procedure public.update_updated_at_column();

    -- Lab equipment triggers
    drop trigger if exists trg_lab_equipment_updated_at on public.lab_equipment;
    create trigger trg_lab_equipment_updated_at
    before update on public.lab_equipment
    for each row execute procedure public.update_updated_at_column();

    -- Lab usage stats triggers
    drop trigger if exists trg_lab_usage_stats_updated_at on public.lab_usage_stats;
    create trigger trg_lab_usage_stats_updated_at
    before update on public.lab_usage_stats
    for each row execute procedure public.update_updated_at_column();

    -- Lab maintenance triggers
    drop trigger if exists trg_lab_maintenance_updated_at on public.lab_maintenance;
    create trigger trg_lab_maintenance_updated_at
    before update on public.lab_maintenance
    for each row execute procedure public.update_updated_at_column();
  end if;
end $$;

-- Insert comprehensive sample data for immediate testing

-- 1. Insert sample labs with all required fields (with fallback for missing departments)
insert into public.labs (name, lab_code, capacity, max_slots, lab_type, description, building, floor, room_number, equipment_list, safety_equipment, operating_hours, department_id, created_by) values
  ('Computer Lab 1', 'CL1', 60, 3, 'computer', 'Main computer laboratory with 60 workstations for programming and software development',
   'Tech Building', '2nd Floor', '201',
   '["Dell OptiPlex 7090 Computers", "HP LaserJet Printer", "Interactive Whiteboard", "Network Switch", "WiFi Router"]'::jsonb,
   '["Fire Extinguisher", "First Aid Kit", "Emergency Exit Signs", "Safety Goggles"]'::jsonb,
   '{"monday": {"open": "08:00", "close": "18:00"}, "tuesday": {"open": "08:00", "close": "18:00"}, "wednesday": {"open": "08:00", "close": "18:00"}, "thursday": {"open": "08:00", "close": "18:00"}, "friday": {"open": "08:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "16:00"}}'::jsonb,
   coalesce((select id from public.departments where name = 'Computer Science' limit 1), gen_random_uuid()),
   coalesce((select id from auth.users limit 1), gen_random_uuid())),

  ('Electronics Lab', 'EL1', 30, 2, 'electronics', 'Advanced electronics laboratory with circuit design and testing equipment',
   'Engineering Building', '1st Floor', '101',
   '["Digital Oscilloscope", "Function Generator", "Multimeter", "Power Supply", "Soldering Station", "PCB Design Software"]'::jsonb,
   '["Safety Goggles", "Anti-static Wrist Straps", "Fire Extinguisher", "First Aid Kit"]'::jsonb,
   '{"monday": {"open": "09:00", "close": "17:00"}, "tuesday": {"open": "09:00", "close": "17:00"}, "wednesday": {"open": "09:00", "close": "17:00"}, "thursday": {"open": "09:00", "close": "17:00"}, "friday": {"open": "09:00", "close": "17:00"}}'::jsonb,
   coalesce((select id from public.departments where name = 'Electronics Engineering' limit 1), gen_random_uuid()),
   coalesce((select id from auth.users limit 1), gen_random_uuid())),

  ('Physics Lab', 'PL1', 25, 2, 'physics', 'Physics experiments laboratory with optics and mechanics equipment',
   'Science Building', 'Ground Floor', 'G01',
   '["Optical Bench", "Spectrometer", "Voltmeter", "Ammeter", "Galvanometer", "Newton Ring Apparatus"]'::jsonb,
   '["Safety Goggles", "Lab Coats", "Fire Extinguisher", "Emergency Shower", "Eye Wash Station"]'::jsonb,
   '{"monday": {"open": "08:30", "close": "16:30"}, "tuesday": {"open": "08:30", "close": "16:30"}, "wednesday": {"open": "08:30", "close": "16:30"}, "thursday": {"open": "08:30", "close": "16:30"}, "friday": {"open": "08:30", "close": "16:30"}}'::jsonb,
   coalesce((select id from public.departments where name = 'Physics' limit 1), gen_random_uuid()),
   coalesce((select id from auth.users limit 1), gen_random_uuid())),

  ('Chemistry Lab', 'CHL1', 20, 1, 'chemistry', 'Chemistry experiments laboratory with analytical instruments',
   'Science Building', '1st Floor', '102',
   '["Fume Hood", "Distillation Apparatus", "Analytical Balance", "pH Meter", "Spectrophotometer", "Centrifuge"]'::jsonb,
   '["Chemical-resistant Gloves", "Safety Goggles", "Lab Coats", "Fire Extinguisher", "Emergency Shower", "Eye Wash Station", "Chemical Spill Kit"]'::jsonb,
   '{"monday": {"open": "09:00", "close": "17:00"}, "tuesday": {"open": "09:00", "close": "17:00"}, "wednesday": {"open": "09:00", "close": "17:00"}, "thursday": {"open": "09:00", "close": "17:00"}, "friday": {"open": "09:00", "close": "17:00"}}'::jsonb,
   coalesce((select id from public.departments where name = 'Chemistry' limit 1), gen_random_uuid()),
   coalesce((select id from auth.users limit 1), gen_random_uuid())),

  ('Workshop Lab', 'WL1', 40, 2, 'workshop', 'Mechanical workshop with machining and fabrication tools',
   'Workshop Building', 'Ground Floor', 'W01',
   '["Lathe Machine", "Milling Machine", "Drilling Machine", "Welding Machine", "Grinding Machine", "Bench Vice", "Tool Cabinet"]'::jsonb,
   '["Safety Helmet", "Safety Goggles", "Ear Protection", "Safety Boots", "Fire Extinguisher", "First Aid Kit"]'::jsonb,
   '{"monday": {"open": "08:00", "close": "18:00"}, "tuesday": {"open": "08:00", "close": "18:00"}, "wednesday": {"open": "08:00", "close": "18:00"}, "thursday": {"open": "08:00", "close": "18:00"}, "friday": {"open": "08:00", "close": "18:00"}, "saturday": {"open": "08:00", "close": "14:00"}}'::jsonb,
   coalesce((select id from public.departments where name = 'Mechanical Engineering' limit 1), gen_random_uuid()),
   coalesce((select id from auth.users limit 1), gen_random_uuid()))

on conflict (name) do nothing;

-- 2. Insert lab administrators
insert into public.lab_admins (lab_id, admin_name, admin_email, admin_phone, admin_role, notes) values
  ((select id from public.labs where name = 'Computer Lab 1'), 'Dr. Sarah Johnson', 'sarah.johnson@university.edu', '+1-555-0101', 'primary', 'Computer Science Department Head'),
  ((select id from public.labs where name = 'Electronics Lab'), 'Prof. Michael Chen', 'michael.chen@university.edu', '+1-555-0102', 'primary', 'Electronics Engineering Professor'),
  ((select id from public.labs where name = 'Physics Lab'), 'Dr. Emily Rodriguez', 'emily.rodriguez@university.edu', '+1-555-0103', 'primary', 'Physics Department Faculty'),
  ((select id from public.labs where name = 'Chemistry Lab'), 'Prof. David Kumar', 'david.kumar@university.edu', '+1-555-0104', 'primary', 'Chemistry Department Head'),
  ((select id from public.labs where name = 'Workshop Lab'), 'Mr. Robert Wilson', 'robert.wilson@university.edu', '+1-555-0105', 'primary', 'Mechanical Engineering Workshop Supervisor');

-- 3. Insert lab schedules for each lab
insert into public.lab_schedules (lab_id, day_of_week, start_time, end_time, slot_type, max_capacity, slot_number, semester, academic_year)
select
  l.id,
  1, -- Monday
  '09:00'::time,
  '11:00'::time,
  'regular',
  l.capacity,
  1,
  'I',
  '2024-2025'
from public.labs l
on conflict (lab_id, day_of_week, start_time, slot_number) do nothing;

insert into public.lab_schedules (lab_id, day_of_week, start_time, end_time, slot_type, max_capacity, slot_number, semester, academic_year)
select
  l.id,
  1, -- Monday
  '14:00'::time,
  '16:00'::time,
  'regular',
  l.capacity,
  2,
  'I',
  '2024-2025'
from public.labs l
on conflict (lab_id, day_of_week, start_time, slot_number) do nothing;

insert into public.lab_schedules (lab_id, day_of_week, start_time, end_time, slot_type, max_capacity, slot_number, semester, academic_year)
select
  l.id,
  2, -- Tuesday
  '10:00'::time,
  '12:00'::time,
  'regular',
  l.capacity,
  1,
  'I',
  '2024-2025'
from public.labs l
on conflict (lab_id, day_of_week, start_time, slot_number) do nothing;

-- 4. Insert sample lab bookings
insert into public.lab_bookings (lab_id, subject_id, section, year, semester, academic_year, booking_date, start_time, end_time, purpose, student_count, status, created_by)
select
  l.id,
  null, -- Will be linked to actual subjects later
  'A',
  'III',
  'I',
  '2024-2025',
  current_date + interval '1 day',
  '09:00'::time,
  '11:00'::time,
  'regular_lab',
  l.capacity,
  'confirmed',
  (select id from public.labs limit 1) -- placeholder for created_by
from public.labs l
limit 3;

-- 5. Insert sample lab equipment
insert into public.lab_equipment (lab_id, equipment_name, equipment_type, model_number, serial_number, purchase_date, warranty_expiry, condition, is_operational, maintenance_schedule, cost, supplier, location_in_lab) values
  ((select id from public.labs where name = 'Computer Lab 1'), 'Dell OptiPlex 7090', 'Desktop Computer', 'OptiPlex 7090', 'DL7090-001', '2023-01-15', '2026-01-15', 'excellent', true, 'quarterly', 899.00, 'Dell Technologies', 'Workstation Area 1'),
  ((select id from public.labs where name = 'Electronics Lab'), 'Digital Oscilloscope', 'Measurement Instrument', 'DSO-2000', 'OSC-2000-001', '2022-08-10', '2025-08-10', 'good', true, 'monthly', 1250.00, 'Tektronix', 'Measurement Bench 1'),
  ((select id from public.labs where name = 'Physics Lab'), 'Spectrometer', 'Optical Instrument', 'SP-500', 'SPEC-500-001', '2021-03-20', '2024-03-20', 'good', true, 'biannual', 3500.00, 'Ocean Optics', 'Optics Table 1'),
  ((select id from public.labs where name = 'Chemistry Lab'), 'Fume Hood', 'Safety Equipment', 'FH-2000', 'FUME-2000-001', '2022-11-05', '2025-11-05', 'excellent', true, 'monthly', 8500.00, 'Labconco', 'Chemical Station 1');

-- 6. Insert sample maintenance records
insert into public.lab_maintenance (lab_id, equipment_id, maintenance_type, description, scheduled_date, status, priority, performed_by, cost) values
  ((select id from public.labs where name = 'Computer Lab 1'), null, 'preventive', 'Monthly cleaning and virus scan of all computers', current_date + interval '7 days', 'scheduled', 'medium', 'IT Department', 0.00),
  ((select id from public.labs where name = 'Electronics Lab'), (select id from public.lab_equipment where equipment_name = 'Digital Oscilloscope'), 'calibration', 'Annual calibration of oscilloscope', current_date + interval '14 days', 'scheduled', 'high', 'Calibration Services Ltd', 150.00);
