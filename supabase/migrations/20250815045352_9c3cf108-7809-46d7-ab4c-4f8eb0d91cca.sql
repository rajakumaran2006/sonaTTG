-- Add a function to get class counselor details safely
CREATE OR REPLACE FUNCTION get_class_counselor_info(
  dept_id UUID,
  year_param TEXT,
  section_param TEXT
)
RETURNS TABLE (
  faculty_id UUID,
  faculty_name TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cc.faculty_id,
    fm.name as faculty_name
  FROM class_counselors cc
  JOIN faculty_members fm ON cc.faculty_id = fm.id
  WHERE cc.department_id = dept_id
    AND cc.year = year_param
    AND cc.section = section_param
    AND cc.is_active = true
  LIMIT 1;
END;
$$;