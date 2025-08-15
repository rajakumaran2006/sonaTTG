-- Add global settings table for system-wide configuration
create extension if not exists pgcrypto;

-- global_settings: system-wide configuration for all departments
create table if not exists public.global_settings (
  id uuid primary key default gen_random_uuid(),
  working_days integer not null default 6,
  periods_per_day integer not null default 7,
  period_duration integer not null default 50,
  max_weekly_hours integer not null default 42,
  allow_lab_afternoon boolean not null default true,
  enable_seminar_slots boolean not null default true,
  enable_library_slots boolean not null default true,
  enable_counselling_slots boolean not null default true,
  default_lab_duration integer not null default 2,
  max_consecutive_labs integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Insert default settings
insert into public.global_settings (
  working_days, periods_per_day, period_duration, max_weekly_hours,
  allow_lab_afternoon, enable_seminar_slots, enable_library_slots, enable_counselling_slots,
  default_lab_duration, max_consecutive_labs
) values (
  6, 7, 50, 42, true, true, true, true, 2, 3
) on conflict do nothing;

alter table public.global_settings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where polname = 'global_settings are publicly readable') then
    create policy "global_settings are publicly readable" on public.global_settings for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'global_settings are publicly insertable') then
    create policy "global_settings are publicly insertable" on public.global_settings for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'global_settings are publicly updatable') then
    create policy "global_settings are publicly updatable" on public.global_settings for update using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'global_settings are publicly deletable') then
    create policy "global_settings are publicly deletable" on public.global_settings for delete using (true);
  end if;
end $$;

-- Trigger updated_at if helper exists
do $$
begin
  if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
    drop trigger if exists trg_global_settings_updated on public.global_settings;
    create trigger trg_global_settings_updated
    before update on public.global_settings
    for each row execute procedure public.update_updated_at_column();
  end if;
end $$;
