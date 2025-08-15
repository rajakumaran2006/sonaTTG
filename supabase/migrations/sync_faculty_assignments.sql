-- Script to sync faculty assignments with approved timetable data
-- This will create faculty_subject_class entries based on existing timetable data

-- First, let's see what timetable data exists
SELECT 
  t.department_id,
  d.name as department_name,
  t.year,
  t.section,
  t.updated_at,
  jsonb_array_length(t.grid_data) as grid_rows
FROM timetables t
JOIN departments d ON d.id = t.department_id
ORDER BY t.updated_at DESC;

-- Check what faculty members exist
SELECT 
  f.id,
  f.name,
  f.email,
  d.name as department_name
FROM faculty_members f
JOIN departments d ON d.id = f.department_id
ORDER BY f.name;

-- Check what subjects exist for AI&DS Year III
SELECT 
  s.id,
  s.name,
  s.year,
  s.type,
  s.hours_per_week,
  d.name as department_name
FROM subjects s
JOIN departments d ON d.id = s.department_id
WHERE d.name = 'Artificial Intelligence and Data Science' 
  AND s.year = 'III'
ORDER BY s.name;

-- Check existing faculty assignments
SELECT 
  fsc.id,
  f.name as faculty_name,
  s.name as subject_name,
  fsc.year,
  fsc.section,
  d.name as department_name
FROM faculty_subject_class fsc
JOIN faculty_members f ON f.id = fsc.faculty_id
JOIN subjects s ON s.id = fsc.subject_id
JOIN departments d ON d.id = fsc.department_id
ORDER BY f.name, fsc.year, fsc.section, s.name;
