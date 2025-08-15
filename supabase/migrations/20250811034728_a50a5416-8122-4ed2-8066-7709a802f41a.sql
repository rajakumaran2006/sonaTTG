-- Create faculty_members table and RLS/policies
create table if not exists public.faculty_members (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  name text not null,
  email text,
  designation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.faculty_members enable row level security;

-- Recreate policies idempotently
drop policy if exists "Faculty are publicly readable" on public.faculty_members;
drop policy if exists "Faculty are publicly insertable" on public.faculty_members;
drop policy if exists "Faculty are publicly updatable" on public.faculty_members;
drop policy if exists "Faculty are publicly deletable" on public.faculty_members;

create policy "Faculty are publicly readable"
  on public.faculty_members for select using (true);
create policy "Faculty are publicly insertable"
  on public.faculty_members for insert with check (true);
create policy "Faculty are publicly updatable"
  on public.faculty_members for update using (true);
create policy "Faculty are publicly deletable"
  on public.faculty_members for delete using (true);

create index if not exists idx_faculty_department on public.faculty_members(department_id);

-- Maintain updated_at trigger (idempotent)
drop trigger if exists update_faculty_members_updated_at on public.faculty_members;
create trigger update_faculty_members_updated_at
before update on public.faculty_members
for each row execute function public.update_updated_at_column();

-- Remove subjects 42-hour trigger to shift enforcement to timetables (per department+year+section)
drop trigger if exists trg_enforce_42_hours_subjects on public.subjects;
drop function if exists public.enforce_42_hours_subjects();

-- Enforce 42-hour limit at the timetable level (per department+year+section)
create or replace function public.enforce_42_hours_timetables()
returns trigger
language plpgsql
as $$
declare
  total_slots int;
begin
  -- Count non-empty cells in the 2D grid_data JSONB array
  select count(*)
    into total_slots
  from jsonb_array_elements(coalesce(new.grid_data, '[]'::jsonb)) as r(row)
  cross join lateral jsonb_array_elements(coalesce(r.row, '[]'::jsonb)) as c(cell)
  where c.cell is not null
    and c.cell::text <> 'null'
    and c.cell::text <> '""';

  if total_slots > 42 then
    raise exception 'Weekly timetable exceeds 42 periods for department %, year %, section % (got %)', new.department_id, new.year, new.section, total_slots
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Recreate trigger idempotently
drop trigger if exists trg_enforce_42_hours_timetables on public.timetables;
create trigger trg_enforce_42_hours_timetables
before insert or update on public.timetables
for each row execute function public.enforce_42_hours_timetables();

-- Ensure uniqueness per department+year+section to align with rule scope
create unique index if not exists uniq_timetables_department_year_section on public.timetables(department_id, year, section);

-- Helpful index for queries
create index if not exists idx_subjects_department_year on public.subjects(department_id, year);
