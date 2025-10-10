-- Create labs management system
-- labs: physical lab rooms/facilities
create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  capacity integer not null check (capacity > 0),
  max_slots integer not null check (max_slots > 0) default 3,
  description text,
  building text,
  floor text,
  room_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- lab_schedules: time slots and class details for labs
create table if not exists public.lab_schedules (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  day_of_week integer not null check (day_of_week >= 1 and day_of_week <= 7), -- 1=Monday, 7=Sunday
  start_time time not null,
  end_time time not null,
  max_capacity integer not null check (max_capacity > 0),
  slot_number integer not null check (slot_number > 0),
  is_available boolean not null default true,
  semester text, -- e.g., 'I', 'II', 'III', etc.
  academic_year text, -- e.g., '2024-2025'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lab_id, day_of_week, start_time, slot_number)
);

-- Enable RLS
alter table public.labs enable row level security;
alter table public.lab_schedules enable row level security;

-- Create policies for labs (public read, authenticated write)
do $$
begin
  if not exists (select 1 from pg_policies where polname = 'labs are publicly readable') then
    create policy "labs are publicly readable" on public.labs for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'labs are publicly manageable') then
    create policy "labs are publicly manageable" on public.labs for all using (true);
  end if;
end $$;

-- Create policies for lab_schedules (public read, authenticated write)
do $$
begin
  if not exists (select 1 from pg_policies where polname = 'lab_schedules are publicly readable') then
    create policy "lab_schedules are publicly readable" on public.lab_schedules for select using (true);
  end if;
  if not exists (select 1 from pg_policies where polname = 'lab_schedules are publicly manageable') then
    create policy "lab_schedules are publicly manageable" on public.lab_schedules for all using (true);
  end if;
end $$;

-- Create indexes for better performance
create index if not exists idx_labs_active on public.labs(is_active);
create index if not exists idx_lab_schedules_lab on public.lab_schedules(lab_id);
create index if not exists idx_lab_schedules_day_time on public.lab_schedules(day_of_week, start_time);

-- Create triggers for updated_at if helper function exists
do $$
begin
  if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
    drop trigger if exists trg_labs_updated_at on public.labs;
    create trigger trg_labs_updated_at
    before update on public.labs
    for each row execute procedure public.update_updated_at_column();

    drop trigger if exists trg_lab_schedules_updated_at on public.lab_schedules;
    create trigger trg_lab_schedules_updated_at
    before update on public.lab_schedules
    for each row execute procedure public.update_updated_at_column();
  end if;
end $$;

-- Insert some sample labs
insert into public.labs (name, capacity, max_slots, description, building, floor, room_number) values
  ('Computer Lab 1', 60, 3, 'Main computer laboratory with 60 workstations', 'Tech Building', '2nd Floor', '201'),
  ('Computer Lab 2', 45, 2, 'Secondary computer lab with 45 workstations', 'Tech Building', '2nd Floor', '202'),
  ('Electronics Lab', 30, 2, 'Electronics and circuits laboratory', 'Engineering Building', '1st Floor', '101'),
  ('Physics Lab', 25, 2, 'Physics experiments laboratory', 'Science Building', 'Ground Floor', 'G01'),
  ('Chemistry Lab', 20, 1, 'Chemistry experiments laboratory', 'Science Building', '1st Floor', '102')
on conflict (name) do nothing;
