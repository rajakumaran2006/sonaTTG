-- Open Elective settings per department-year
create table if not exists public.open_elective_settings (
  department_id uuid not null references public.departments(id) on delete cascade,
  year text not null,
  hours integer not null default 0 check (hours >= 0 and hours <= 42),
  updated_at timestamptz not null default now(),
  primary key (department_id, year)
);

alter table public.open_elective_settings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where polname = 'open_elective_settings are publicly readable') then
    create policy "open_elective_settings are publicly readable" on public.open_elective_settings for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'open_elective_settings are publicly upsertable') then
    create policy "open_elective_settings are publicly upsertable" on public.open_elective_settings for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'open_elective_settings are publicly updatable') then
    create policy "open_elective_settings are publicly updatable" on public.open_elective_settings for update using (true);
  end if;
end $$;

-- Trigger updated_at if helper exists
do $$
begin
  if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
    drop trigger if exists trg_open_elective_settings_updated on public.open_elective_settings;
    create trigger trg_open_elective_settings_updated
    before update on public.open_elective_settings
    for each row execute procedure public.update_updated_at_column();
  end if;
end $$;


