-- Create faculty_subject_class junction table for precise allocations
create table if not exists public.faculty_subject_class (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  faculty_id uuid not null references public.faculty_members(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  year text not null,
  section text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(department_id, faculty_id, subject_id, year, section)
);

alter table public.faculty_subject_class enable row level security;

-- Open policies (adjust when adding auth)
do $$
begin
  if not exists (select 1 from pg_policies where polname = 'fsc are publicly readable') then
    create policy "fsc are publicly readable" on public.faculty_subject_class for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'fsc are publicly insertable') then
    create policy "fsc are publicly insertable" on public.faculty_subject_class for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'fsc are publicly updatable') then
    create policy "fsc are publicly updatable" on public.faculty_subject_class for update using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'fsc are publicly deletable') then
    create policy "fsc are publicly deletable" on public.faculty_subject_class for delete using (true);
  end if;
end $$;

-- Trigger for updated_at
do $$
begin
  if exists (
    select 1 from pg_proc where proname = 'update_updated_at_column'
  ) then
    drop trigger if exists trg_fsc_updated_at on public.faculty_subject_class;
    create trigger trg_fsc_updated_at
    before update on public.faculty_subject_class
    for each row execute procedure public.update_updated_at_column();
  end if;
end $$;

create index if not exists idx_fsc_department_year_section on public.faculty_subject_class(department_id, year, section);
create index if not exists idx_fsc_faculty on public.faculty_subject_class(faculty_id);
create index if not exists idx_fsc_subject on public.faculty_subject_class(subject_id);


