-- Phase 7: Schema enhancements for sections, assignments, and department settings

-- SECTION SUBJECTS: tracks subject assignments per section
create table if not exists public.section_subjects (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  year text not null,
  section text not null,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uniq_section_subject unique (department_id, year, section, subject_id)
);

alter table public.section_subjects enable row level security;

-- RLS policies (public like other tables in this project)
drop policy if exists "section_subjects are publicly readable" on public.section_subjects;
drop policy if exists "section_subjects are publicly insertable" on public.section_subjects;
drop policy if exists "section_subjects are publicly updatable" on public.section_subjects;
drop policy if exists "section_subjects are publicly deletable" on public.section_subjects;
create policy "section_subjects are publicly readable" on public.section_subjects for select using (true);
create policy "section_subjects are publicly insertable" on public.section_subjects for insert with check (true);
create policy "section_subjects are publicly updatable" on public.section_subjects for update using (true);
create policy "section_subjects are publicly deletable" on public.section_subjects for delete using (true);

create index if not exists idx_section_subjects_department_year_section on public.section_subjects(department_id, year, section);
create index if not exists idx_section_subjects_subject on public.section_subjects(subject_id);

-- Maintain updated_at
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_section_subjects_updated_at on public.section_subjects;
create trigger trg_section_subjects_updated_at
before update on public.section_subjects
for each row execute function public.update_updated_at_column();


-- FACULTY SUBJECT ASSIGNMENTS: which faculty teaches which subject (optionally per section)
create table if not exists public.faculty_subject_assignments (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.faculty_members(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  year text not null,
  section text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.faculty_subject_assignments enable row level security;

drop policy if exists "faculty_subject_assignments are publicly readable" on public.faculty_subject_assignments;
drop policy if exists "faculty_subject_assignments are publicly insertable" on public.faculty_subject_assignments;
drop policy if exists "faculty_subject_assignments are publicly updatable" on public.faculty_subject_assignments;
drop policy if exists "faculty_subject_assignments are publicly deletable" on public.faculty_subject_assignments;
create policy "faculty_subject_assignments are publicly readable" on public.faculty_subject_assignments for select using (true);
create policy "faculty_subject_assignments are publicly insertable" on public.faculty_subject_assignments for insert with check (true);
create policy "faculty_subject_assignments are publicly updatable" on public.faculty_subject_assignments for update using (true);
create policy "faculty_subject_assignments are publicly deletable" on public.faculty_subject_assignments for delete using (true);

create index if not exists idx_fsa_department_year_section on public.faculty_subject_assignments(department_id, year, section);
create index if not exists idx_fsa_faculty on public.faculty_subject_assignments(faculty_id);
create index if not exists idx_fsa_subject on public.faculty_subject_assignments(subject_id);

drop trigger if exists trg_fsa_updated_at on public.faculty_subject_assignments;
create trigger trg_fsa_updated_at
before update on public.faculty_subject_assignments
for each row execute function public.update_updated_at_column();


-- DEPARTMENT SETTINGS: configurable scheduling parameters
create table if not exists public.department_settings (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null unique references public.departments(id) on delete cascade,
  working_days integer not null default 6,
  periods_per_day integer not null default 7,
  period_duration integer not null default 50,
  break_periods jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.department_settings enable row level security;

drop policy if exists "department_settings are publicly readable" on public.department_settings;
drop policy if exists "department_settings are publicly upsertable" on public.department_settings;
drop policy if exists "department_settings are publicly deletable" on public.department_settings;
create policy "department_settings are publicly readable" on public.department_settings for select using (true);
create policy "department_settings are publicly upsertable" on public.department_settings for insert with check (true);
create policy "department_settings are publicly upsertable update" on public.department_settings for update using (true);
create policy "department_settings are publicly deletable" on public.department_settings for delete using (true);

create index if not exists idx_department_settings_department on public.department_settings(department_id);

drop trigger if exists trg_department_settings_updated_at on public.department_settings;
create trigger trg_department_settings_updated_at
before update on public.department_settings
for each row execute function public.update_updated_at_column();
