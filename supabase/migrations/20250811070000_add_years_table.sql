-- Add years table for managing academic years
create extension if not exists pgcrypto;

-- years: academic years available for all departments
create table if not exists public.years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_order integer not null,
  is_active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Insert default years (I, II, III, IV)
insert into public.years (name, display_order) values 
  ('I', 1),
  ('II', 2), 
  ('III', 3),
  ('IV', 4)
on conflict (name) do nothing;

alter table public.years enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where polname = 'years are publicly readable') then
    create policy "years are publicly readable" on public.years for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'years are publicly insertable') then
    create policy "years are publicly insertable" on public.years for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'years are publicly updatable') then
    create policy "years are publicly updatable" on public.years for update using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'years are publicly deletable') then
    create policy "years are publicly deletable" on public.years for delete using (true);
  end if;
end $$;

-- Trigger updated_at if helper exists
do $$
begin
  if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
    drop trigger if exists trg_years_updated on public.years;
    create trigger trg_years_updated
    before update on public.years
    for each row execute procedure public.update_updated_at_column();
  end if;
end $$;

create index if not exists idx_years_display_order on public.years(display_order);
create index if not exists idx_years_active on public.years(is_active);
