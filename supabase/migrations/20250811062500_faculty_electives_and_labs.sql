-- Electives and Labs mapping tables
create extension if not exists pgcrypto;

-- faculty_electives: cross-department elective loads
create table if not exists public.faculty_electives (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.faculty_members(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  year text not null,
  section text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(faculty_id, department_id, year, section, subject_id)
);

alter table public.faculty_electives enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where polname = 'faculty_electives are publicly readable') then
    create policy "faculty_electives are publicly readable" on public.faculty_electives for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'faculty_electives are publicly insertable') then
    create policy "faculty_electives are publicly insertable" on public.faculty_electives for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'faculty_electives are publicly updatable') then
    create policy "faculty_electives are publicly updatable" on public.faculty_electives for update using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'faculty_electives are publicly deletable') then
    create policy "faculty_electives are publicly deletable" on public.faculty_electives for delete using (true);
  end if;
end $$;

-- Trigger updated_at if helper exists
do $$
begin
  if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
    drop trigger if exists trg_faculty_electives_updated on public.faculty_electives;
    create trigger trg_faculty_electives_updated
    before update on public.faculty_electives
    for each row execute procedure public.update_updated_at_column();
  end if;
end $$;

create index if not exists idx_fe_faculty on public.faculty_electives(faculty_id);
create index if not exists idx_fe_department_year_section on public.faculty_electives(department_id, year, section);

-- faculty_labs: mapping of faculty to labs by year and section
create table if not exists public.faculty_labs (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.faculty_members(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  year text not null,
  section text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(faculty_id, subject_id, year, section)
);

alter table public.faculty_labs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where polname = 'faculty_labs are publicly readable') then
    create policy "faculty_labs are publicly readable" on public.faculty_labs for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'faculty_labs are publicly insertable') then
    create policy "faculty_labs are publicly insertable" on public.faculty_labs for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'faculty_labs are publicly updatable') then
    create policy "faculty_labs are publicly updatable" on public.faculty_labs for update using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'faculty_labs are publicly deletable') then
    create policy "faculty_labs are publicly deletable" on public.faculty_labs for delete using (true);
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
    drop trigger if exists trg_faculty_labs_updated on public.faculty_labs;
    create trigger trg_faculty_labs_updated
    before update on public.faculty_labs
    for each row execute procedure public.update_updated_at_column();
  end if;
end $$;

create index if not exists idx_fl_faculty on public.faculty_labs(faculty_id);
create index if not exists idx_fl_department_year_section on public.faculty_labs(department_id, year, section);
create index if not exists idx_fl_subject on public.faculty_labs(subject_id);


