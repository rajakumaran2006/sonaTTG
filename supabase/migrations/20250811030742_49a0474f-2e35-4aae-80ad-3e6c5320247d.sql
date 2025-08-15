-- Enable required extension for UUID generation
create extension if not exists pgcrypto;

-- Helper function to auto-update updated_at columns
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Departments
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.departments enable row level security;

-- Public policies (no auth yet)
create policy "Departments are publicly readable"
  on public.departments for select using (true);
create policy "Departments are publicly insertable"
  on public.departments for insert with check (true);
create policy "Departments are publicly updatable"
  on public.departments for update using (true);
create policy "Departments are publicly deletable"
  on public.departments for delete using (true);

-- Subjects
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  year text not null,
  name text not null,
  hours_per_week integer not null check (hours_per_week >= 1 and hours_per_week <= 7),
  type text not null check (type in ('theory','lab','special')),
  tags text[] default '{}',
  code text,
  abbreviation text,
  staff text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(department_id, year, name)
);

create index if not exists idx_subjects_dept_year on public.subjects(department_id, year);

-- trigger: update updated_at on subjects
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_subjects_updated_at'
  ) then
    create trigger trg_subjects_updated_at
    before update on public.subjects
    for each row execute procedure public.update_updated_at_column();
  end if;
end $$;

alter table public.subjects enable row level security;

create policy "Subjects are publicly readable"
  on public.subjects for select using (true);
create policy "Subjects are publicly insertable"
  on public.subjects for insert with check (true);
create policy "Subjects are publicly updatable"
  on public.subjects for update using (true);
create policy "Subjects are publicly deletable"
  on public.subjects for delete using (true);

-- Timetables
create table if not exists public.timetables (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  year text not null,
  section text not null,
  grid_data jsonb not null,
  special_flags jsonb not null,
  updated_at timestamptz not null default now(),
  unique(department_id, year, section)
);

create index if not exists idx_timetables_dept_year_section on public.timetables(department_id, year, section);

alter table public.timetables enable row level security;

create policy "Timetables are publicly readable"
  on public.timetables for select using (true);
create policy "Timetables are publicly upsertable"
  on public.timetables for insert with check (true);
create policy "Timetables are publicly updatable"
  on public.timetables for update using (true);
create policy "Timetables are publicly deletable"
  on public.timetables for delete using (true);

-- Lab preferences
create table if not exists public.lab_preferences (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  year text not null,
  section text not null,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  morning_enabled boolean not null default false,
  morning_start integer,
  evening_two_hour_start_at_5 boolean not null default false,
  priority integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(department_id, year, section, subject_id)
);

create index if not exists idx_lab_prefs_dept_year_section on public.lab_preferences(department_id, year, section);

-- trigger: update updated_at on lab_preferences
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_lab_prefs_updated_at'
  ) then
    create trigger trg_lab_prefs_updated_at
    before update on public.lab_preferences
    for each row execute procedure public.update_updated_at_column();
  end if;
end $$;

alter table public.lab_preferences enable row level security;

create policy "Lab prefs are publicly readable"
  on public.lab_preferences for select using (true);
create policy "Lab prefs are publicly insertable"
  on public.lab_preferences for insert with check (true);
create policy "Lab prefs are publicly updatable"
  on public.lab_preferences for update using (true);
create policy "Lab prefs are publicly deletable"
  on public.lab_preferences for delete using (true);
