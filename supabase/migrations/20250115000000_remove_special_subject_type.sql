-- Remove special as a valid subject type
ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_type_check;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_type_check CHECK (type IN ('theory', 'lab', 'elective'));
