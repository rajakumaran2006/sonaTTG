-- Update the check constraint on subjects table to allow 'open elective' type
-- First drop the existing constraint
ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_type_check;

-- Add the new constraint with 'open elective' included
ALTER TABLE public.subjects ADD CONSTRAINT subjects_type_check 
CHECK (type IN ('theory', 'lab', 'elective', 'open elective'));