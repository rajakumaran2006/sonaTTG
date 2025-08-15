-- Function to populate faculty_period_schedule from approved timetables
CREATE OR REPLACE FUNCTION public.populate_faculty_schedule_from_timetable(
  p_department_id uuid,
  p_year text,
  p_section text
)
RETURNS void AS $$
DECLARE
  timetable_grid jsonb;
  timetable_flags jsonb;
  day_idx int;
  period_idx int;
  cell_content text;
  subject_record record;
  faculty_record record;
  class_counselor_id uuid;
BEGIN
  -- Get the approved timetable
  SELECT grid_data, special_flags
  INTO timetable_grid, timetable_flags
  FROM public.timetables
  WHERE department_id = p_department_id
    AND year = p_year
    AND section = p_section;

  -- If no timetable found, exit
  IF timetable_grid IS NULL THEN
    RAISE NOTICE 'No timetable found for department %, year %, section %', p_department_id, p_year, p_section;
    RETURN;
  END IF;

  -- Clear existing schedule for this class
  DELETE FROM public.faculty_period_schedule
  WHERE department_id = p_department_id
    AND year = p_year
    AND section = p_section;

  -- Get class counselor for special periods
  SELECT faculty_id INTO class_counselor_id
  FROM public.class_counselors
  WHERE department_id = p_department_id
    AND year = p_year
    AND section = p_section
    AND is_active = true
  LIMIT 1;

  -- Process each day (0-5 for Mon-Sat)
  FOR day_idx IN 0..5 LOOP
    -- Process each period (0-6 for P1-P7)
    FOR period_idx IN 0..6 LOOP
      -- Get cell content from grid
      SELECT timetable_grid->day_idx->period_idx INTO cell_content;
      
      -- Skip if cell is empty or null
      IF cell_content IS NULL OR cell_content = 'null' OR cell_content = '""' OR cell_content = '' THEN
        CONTINUE;
      END IF;
      
      -- Remove quotes if present
      cell_content := TRIM(BOTH '"' FROM cell_content);
      
      -- Check if it's a special period (Seminar, Library, Student Counselling)
      IF cell_content IN ('Seminar', 'Library', 'Student Counselling') THEN
        -- Assign to class counselor if available
        IF class_counselor_id IS NOT NULL THEN
          INSERT INTO public.faculty_period_schedule (
            faculty_id, department_id, year, section, day, period, subject_name, is_special
          ) VALUES (
            class_counselor_id, p_department_id, p_year, p_section, 
            day_idx, period_idx, cell_content, true
          ) ON CONFLICT DO NOTHING;
        END IF;
      ELSE
        -- Regular subject - find assigned faculty
        -- Try faculty_subject_class first (more specific)
        FOR faculty_record IN
          SELECT DISTINCT fsc.faculty_id
          FROM public.faculty_subject_class fsc
          JOIN public.subjects s ON fsc.subject_id = s.id
          WHERE fsc.department_id = p_department_id
            AND fsc.year = p_year
            AND fsc.section = p_section
            AND (s.name = cell_content OR s.abbreviation = cell_content OR s.code = cell_content)
        LOOP
          INSERT INTO public.faculty_period_schedule (
            faculty_id, department_id, year, section, day, period, subject_name, is_special
          ) VALUES (
            faculty_record.faculty_id, p_department_id, p_year, p_section,
            day_idx, period_idx, cell_content, false
          ) ON CONFLICT DO NOTHING;
        END LOOP;

        -- If no assignment found in faculty_subject_class, try faculty_subject_assignments
        IF NOT FOUND THEN
          FOR faculty_record IN
            SELECT DISTINCT fsa.faculty_id
            FROM public.faculty_subject_assignments fsa
            JOIN public.subjects s ON fsa.subject_id = s.id
            WHERE fsa.department_id = p_department_id
              AND fsa.year = p_year
              AND (fsa.section IS NULL OR fsa.section = p_section)
              AND (s.name = cell_content OR s.abbreviation = cell_content OR s.code = cell_content)
          LOOP
            INSERT INTO public.faculty_period_schedule (
              faculty_id, department_id, year, section, day, period, subject_name, is_special
            ) VALUES (
              faculty_record.faculty_id, p_department_id, p_year, p_section,
              day_idx, period_idx, cell_content, false
            ) ON CONFLICT DO NOTHING;
          END LOOP;
        END IF;

        -- If still no assignment found, try to match by subject name in staff field
        IF NOT FOUND THEN
          FOR faculty_record IN
            SELECT DISTINCT fm.id as faculty_id
            FROM public.subjects s
            JOIN public.faculty_members fm ON fm.name = s.staff
            WHERE s.department_id = p_department_id
              AND s.year = p_year
              AND (s.name = cell_content OR s.abbreviation = cell_content OR s.code = cell_content)
          LOOP
            INSERT INTO public.faculty_period_schedule (
              faculty_id, department_id, year, section, day, period, subject_name, is_special
            ) VALUES (
              faculty_record.faculty_id, p_department_id, p_year, p_section,
              day_idx, period_idx, cell_content, false
            ) ON CONFLICT DO NOTHING;
          END LOOP;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Faculty schedule populated for department %, year %, section %', p_department_id, p_year, p_section;
END;
$$ LANGUAGE plpgsql;

-- Function to populate all faculty schedules from existing timetables
CREATE OR REPLACE FUNCTION public.populate_all_faculty_schedules()
RETURNS void AS $$
DECLARE
  timetable_record record;
BEGIN
  -- Loop through all approved timetables
  FOR timetable_record IN
    SELECT department_id, year, section
    FROM public.timetables
    ORDER BY updated_at DESC
  LOOP
    PERFORM public.populate_faculty_schedule_from_timetable(
      timetable_record.department_id,
      timetable_record.year,
      timetable_record.section
    );
  END LOOP;
  
  RAISE NOTICE 'All faculty schedules populated successfully';
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically populate faculty schedule when timetable is updated
CREATE OR REPLACE FUNCTION public.trigger_populate_faculty_schedule()
RETURNS trigger AS $$
BEGIN
  -- Populate faculty schedule for the updated timetable
  PERFORM public.populate_faculty_schedule_from_timetable(
    NEW.department_id,
    NEW.year,
    NEW.section
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on timetables table
DROP TRIGGER IF EXISTS trg_timetable_update_faculty_schedule ON public.timetables;
CREATE TRIGGER trg_timetable_update_faculty_schedule
  AFTER INSERT OR UPDATE ON public.timetables
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_populate_faculty_schedule();

-- Populate existing timetables (run once to sync existing data)
SELECT public.populate_all_faculty_schedules();
