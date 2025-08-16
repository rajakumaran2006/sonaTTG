-- Add max_faculty_count field to subjects table for lab subjects
ALTER TABLE public.subjects 
ADD COLUMN IF NOT EXISTS max_faculty_count integer DEFAULT 1;

-- Add constraint to ensure max_faculty_count is at least 1
ALTER TABLE public.subjects 
ADD CONSTRAINT subjects_max_faculty_count_check 
CHECK (max_faculty_count >= 1);

-- Update existing lab subjects to have max_faculty_count = 1 by default
UPDATE public.subjects 
SET max_faculty_count = 1 
WHERE type = 'lab' AND max_faculty_count IS NULL;
