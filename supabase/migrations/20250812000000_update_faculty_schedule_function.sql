
create or replace function public.update_faculty_period_schedule(
  p_department_id uuid,
  p_year text,
  p_section text
)
returns void as $$
declare
  approved_timetable_grid jsonb;
  approved_timetable_flags jsonb;
  class_counselor_id uuid;
  subject_record record;
  faculty_ids uuid[];
begin
  -- Get the approved timetable data for the specified class
  select grid_data, special_flags
  into approved_timetable_grid, approved_timetable_flags
  from public.approved_timetables
  where department_id = p_department_id
    and year = p_year
    and section = p_section;

  -- If no approved timetable is found, exit
  if approved_timetable_grid is null then
    return;
  end if;

  -- Clear any existing schedule for this class to avoid duplicates
  delete from public.faculty_period_schedule
  where department_id = p_department_id
    and year = p_year
    and section = p_section;

  -- Get the class counselor for handling special periods
  select faculty_id
  into class_counselor_id
  from public.class_counselors
  where department_id = p_department_id
    and year = p_year
    and section = p_section
    and is_active = true;

  -- Loop through each period in the timetable grid
  for subject_record in
    select
      (d.value)::smallint as day,
      (p.value)::smallint as period,
      (p.value ->> 'subject')::text as subject_name,
      (p.value ->> 'is_special')::boolean as is_special
    from jsonb_array_elements(approved_timetable_grid) with ordinality d(arr, day)
    cross join jsonb_array_elements(d.arr) with ordinality p(value, period)
  loop
    -- If it's a special period, assign it to the class counselor
    if subject_record.is_special and class_counselor_id is not null then
      insert into public.faculty_period_schedule (
        department_id, year, section, faculty_id, day, period, subject_name, is_special
      ) values (
        p_department_id, p_year, p_section, class_counselor_id, subject_record.day - 1, subject_record.period - 1, subject_record.subject_name, true
      );
    else
      -- Find the faculty assigned to this subject
      select array_agg(faculty_id)
      into faculty_ids
      from (
        -- Prioritize the newer faculty_subject_class table
        select faculty_id from public.faculty_subject_class
        where department_id = p_department_id
          and year = p_year
          and section = p_section
          and subject_id = (select id from public.subjects where name = subject_record.subject_name and department_id = p_department_id and year = p_year)
        union
        -- Fallback to the older faculty_subject_assignments table
        select faculty_id from public.faculty_subject_assignments
        where department_id = p_department_id
          and year = p_year
          and (section is null or section = p_section)
          and subject_id = (select id from public.subjects where name = subject_record.subject_name and department_id = p_department_id and year = p_year)
      ) as assignments;

      -- Insert a record for each assigned faculty member
      if faculty_ids is not null then
        foreach faculty_id in array faculty_ids
        loop
          insert into public.faculty_period_schedule (
            department_id, year, section, faculty_id, day, period, subject_name, is_special
          ) values (
            p_department_id, p_year, p_section, faculty_id, subject_record.day - 1, subject_record.period - 1, subject_record.subject_name, false
          );
        end loop;
      end if;
    end if;
  end loop;
end;
$$ language plpgsql;
