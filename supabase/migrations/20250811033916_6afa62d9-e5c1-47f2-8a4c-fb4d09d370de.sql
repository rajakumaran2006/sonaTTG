-- Faculty members table for staff counts and details
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

-- 42-hour enforcement for subjects (per department + year)
create or replace function public.enforce_42_hours_subjects()
returns trigger
language plpgsql
as $$
declare
  current_total int;
  new_total int;
begin
  select coalesce(sum(hours_per_week),0)
    into current_total
  from public.subjects
  where department_id = new.department_id
    and year = new.year
    and (tg_op <> 'UPDATE' or id <> old.id);

  new_total := current_total + new.hours_per_week;

  if new_total > 42 then
    raise exception 'Total weekly hours (%s) exceed 42 for department % and year %', new_total, new.department_id, new.year
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Recreate trigger idempotently
drop trigger if exists trg_enforce_42_hours_subjects on public.subjects;
create trigger trg_enforce_42_hours_subjects
before insert or update on public.subjects
for each row execute function public.enforce_42_hours_subjects();

create index if not exists idx_subjects_department_year on public.subjects(department_id, year);