-- Add takes_electives column to faculty_members
alter table if exists public.faculty_members
  add column if not exists takes_electives boolean not null default false;


