-- Enable required extension for UUID generation
create extension if not exists pgcrypto;

-- Helper function to auto-update updated_at columns (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'update_updated_at_column'
  ) then
    create or replace function public.update_updated_at_column()
    returns trigger as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$ language plpgsql;
  end if;
end $$;

-- Class Counselors table
create table if not exists public.class_counselors (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  faculty_id uuid not null references public.faculty_members(id) on delete cascade,
  year text not null,
  section text not null,
  batch text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.class_counselors enable row level security;

-- Policies (public access for now; adjust when auth is added)
do $$
begin
  if not exists (
    select 1 from pg_policies where polname = 'class_counselors are publicly readable'
  ) then
    create policy "class_counselors are publicly readable" on public.class_counselors for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where polname = 'class_counselors are publicly insertable'
  ) then
    create policy "class_counselors are publicly insertable" on public.class_counselors for insert with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where polname = 'class_counselors are publicly updatable'
  ) then
    create policy "class_counselors are publicly updatable" on public.class_counselors for update using (true);
  end if;
  if not exists (
    select 1 from pg_policies where polname = 'class_counselors are publicly deletable'
  ) then
    create policy "class_counselors are publicly deletable" on public.class_counselors for delete using (true);
  end if;
end $$;

-- Indexes
create index if not exists idx_cc_department_year_section on public.class_counselors(department_id, year, section);
create index if not exists idx_cc_faculty on public.class_counselors(faculty_id);

-- Only one active CC per department/year/section
create unique index if not exists uq_cc_active
  on public.class_counselors(department_id, year, section)
  where is_active;

-- Trigger: update updated_at on update
drop trigger if exists trg_class_counselors_updated_at on public.class_counselors;
create trigger trg_class_counselors_updated_at
before update on public.class_counselors
for each row execute procedure public.update_updated_at_column();


