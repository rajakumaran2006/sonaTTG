-- Add departments field to labs table to support multiple departments per lab
-- This enables configuring which departments can use each lab facility

-- Add departments column as array of UUIDs
ALTER TABLE public.labs ADD COLUMN IF NOT EXISTS departments uuid[] DEFAULT '{}';

-- Add index for better performance when filtering by departments
CREATE INDEX IF NOT EXISTS idx_labs_departments ON public.labs USING GIN (departments);

-- Update existing labs to have at least one department (first department in the table)
-- This is a temporary fix until proper department assignment is implemented in the UI
UPDATE public.labs SET departments = ARRAY[(SELECT id FROM public.departments ORDER BY created_at LIMIT 1)] WHERE departments = '{}';

-- Add constraint to ensure at least one department is assigned (optional - can be removed if needed)
-- ALTER TABLE public.labs ADD CONSTRAINT labs_departments_not_empty CHECK (array_length(departments, 1) > 0);
