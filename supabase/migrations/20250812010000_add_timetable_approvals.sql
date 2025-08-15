-- Create a table to log approved timetable pull requests and what was applied
create table if not exists public.timetable_approvals (
  id uuid primary key default gen_random_uuid(),
  pr_id uuid references public.timetable_pull_requests(id) on delete set null,
  department_id uuid not null references public.departments(id) on delete cascade,
  year text not null,
  section text not null,
  approved_by text,
  approved_at timestamptz not null default now(),
  proposed_grid_data jsonb not null,
  proposed_special_flags jsonb,
  proposed_lab_preferences jsonb
);

alter table public.timetable_approvals enable row level security;

-- liberal RLS policies similar to rest of project
drop policy if exists "timetable_approvals are publicly readable" on public.timetable_approvals;
drop policy if exists "timetable_approvals are publicly insertable" on public.timetable_approvals;
drop policy if exists "timetable_approvals are publicly updatable" on public.timetable_approvals;
drop policy if exists "timetable_approvals are publicly deletable" on public.timetable_approvals;
create policy "timetable_approvals are publicly readable" on public.timetable_approvals for select using (true);
create policy "timetable_approvals are publicly insertable" on public.timetable_approvals for insert with check (true);
create policy "timetable_approvals are publicly updatable" on public.timetable_approvals for update using (true);
create policy "timetable_approvals are publicly deletable" on public.timetable_approvals for delete using (true);

create index if not exists idx_timetable_approvals_dept_year_section on public.timetable_approvals(department_id, year, section);
create index if not exists idx_timetable_approvals_pr on public.timetable_approvals(pr_id);
create index if not exists idx_timetable_approvals_approved_at on public.timetable_approvals(approved_at);


