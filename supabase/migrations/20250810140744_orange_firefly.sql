/*
  # Create timetable management schema

  1. New Tables
    - `departments`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `created_at` (timestamp)
    - `subjects`
      - `id` (uuid, primary key)
      - `name` (text)
      - `hours_per_week` (integer)
      - `type` (text, check constraint)
      - `tags` (text array)
      - `code` (text, optional)
      - `abbreviation` (text, optional)
      - `staff` (text, optional)
      - `department_id` (uuid, foreign key)
      - `year` (text)
      - `created_at` (timestamp)
    - `timetables`
      - `id` (uuid, primary key)
      - `department_id` (uuid, foreign key)
      - `year` (text)
      - `section` (text)
      - `grid_data` (jsonb)
      - `special_flags` (jsonb)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    - `lab_preferences`
      - `id` (uuid, primary key)
      - `department_id` (uuid, foreign key)
      - `year` (text)
      - `section` (text)
      - `subject_id` (uuid, foreign key)
      - `morning_enabled` (boolean)
      - `morning_start` (integer)
      - `evening_two_hour_start_at_5` (boolean)
      - `priority` (integer)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their data
*/

-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create subjects table
CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  hours_per_week integer NOT NULL CHECK (hours_per_week >= 1 AND hours_per_week <= 7),
  type text NOT NULL CHECK (type IN ('theory', 'lab', 'special')),
  tags text[] DEFAULT '{}',
  code text,
  abbreviation text,
  staff text,
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
  year text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create timetables table
CREATE TABLE IF NOT EXISTS timetables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE NOT NULL,
  year text NOT NULL,
  section text NOT NULL,
  grid_data jsonb NOT NULL DEFAULT '[]',
  special_flags jsonb NOT NULL DEFAULT '{"seminar": false, "library": false, "counselling": false}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(department_id, year, section)
);

-- Create lab_preferences table
CREATE TABLE IF NOT EXISTS lab_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE NOT NULL,
  year text NOT NULL,
  section text NOT NULL,
  subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
  morning_enabled boolean DEFAULT false,
  morning_start integer CHECK (morning_start >= 1 AND morning_start <= 4),
  evening_two_hour_start_at_5 boolean DEFAULT false,
  priority integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(department_id, year, section, subject_id)
);

-- Enable RLS
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies for departments
CREATE POLICY "Anyone can read departments"
  ON departments
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can manage departments"
  ON departments
  FOR ALL
  TO authenticated
  USING (true);

-- Create policies for subjects
CREATE POLICY "Anyone can read subjects"
  ON subjects
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can manage subjects"
  ON subjects
  FOR ALL
  TO authenticated
  USING (true);

-- Create policies for timetables
CREATE POLICY "Anyone can read timetables"
  ON timetables
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can manage timetables"
  ON timetables
  FOR ALL
  TO authenticated
  USING (true);

-- Create policies for lab_preferences
CREATE POLICY "Anyone can read lab preferences"
  ON lab_preferences
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can manage lab preferences"
  ON lab_preferences
  FOR ALL
  TO authenticated
  USING (true);

-- Insert default departments
INSERT INTO departments (name) VALUES 
  ('Information Technology'),
  ('Artificial Intelligence and Data Science')
ON CONFLICT (name) DO NOTHING;

-- Insert sample subjects for AI&DS Year III
DO $$
DECLARE
  aids_dept_id uuid;
BEGIN
  SELECT id INTO aids_dept_id FROM departments WHERE name = 'Artificial Intelligence and Data Science';
  
  IF aids_dept_id IS NOT NULL THEN
    INSERT INTO subjects (name, hours_per_week, type, tags, department_id, year, code, abbreviation, staff) VALUES
      ('CN', 4, 'theory', '{}', aids_dept_id, 'III', 'U23IT501', 'CN', 'Mr. Network Expert'),
      ('ML', 4, 'theory', '{}', aids_dept_id, 'III', 'U23AI502', 'ML', 'Dr. Machine Learning'),
      ('SSA 3 (A)', 2, 'theory', '{"SSA"}', aids_dept_id, 'III', 'U23SS503A', 'SSA3A', 'Prof. SSA Teacher'),
      ('AIDS', 4, 'theory', '{}', aids_dept_id, 'III', 'U23AI504', 'AIDS', 'Dr. AI Specialist'),
      ('DBMS', 4, 'theory', '{}', aids_dept_id, 'III', 'U23IT505', 'DBMS', 'Mr. Database Expert'),
      ('SSA 3 (SS)', 1, 'theory', '{"SSA"}', aids_dept_id, 'III', 'U23SS506', 'SSA3SS', 'Prof. Soft Skills'),
      ('DWDM', 4, 'theory', '{}', aids_dept_id, 'III', 'U23AI507', 'DWDM', 'Dr. Data Mining'),
      ('SSA 3 (V)', 1, 'theory', '{"SSA"}', aids_dept_id, 'III', 'U23SS508', 'SSA3V', 'Prof. Values'),
      ('NPTEL (IOT)', 3, 'theory', '{}', aids_dept_id, 'III', 'U23IO509', 'IOT', 'Mr. IoT Expert'),
      ('ML LAB', 4, 'lab', '{}', aids_dept_id, 'III', 'U23AI502L', 'MLL', 'Dr. Machine Learning'),
      ('IOT LAB', 2, 'lab', '{}', aids_dept_id, 'III', 'U23IO509L', 'IOTL', 'Mr. IoT Expert'),
      ('DBMS LAB', 2, 'lab', '{}', aids_dept_id, 'III', 'U23IT505L', 'DBMSL', 'Mr. Database Expert'),
      ('AIDS LAB', 2, 'lab', '{}', aids_dept_id, 'III', 'U23AI504L', 'AIDSL', 'Dr. AI Specialist')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;