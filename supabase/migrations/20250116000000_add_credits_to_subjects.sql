-- Add credits column to subjects table
ALTER TABLE public.subjects 
ADD COLUMN IF NOT EXISTS credits integer DEFAULT 3;

-- Add constraint to ensure credits is between 1 and 6 (typical range for academic credits)
ALTER TABLE public.subjects 
ADD CONSTRAINT subjects_credits_check 
CHECK (credits >= 1 AND credits <= 6);

-- Update existing subjects to have default credits based on hours_per_week
-- Theory subjects: typically 1 credit per hour
-- Lab subjects: typically 0.5 credits per hour (2 hours = 1 credit)
UPDATE public.subjects 
SET credits = CASE 
  WHEN type = 'theory' THEN hours_per_week
  WHEN type = 'lab' THEN CEIL(hours_per_week::float / 2)
  WHEN type = 'elective' THEN hours_per_week
  WHEN type = 'open elective' THEN hours_per_week
  ELSE 3
END
WHERE credits IS NULL;
