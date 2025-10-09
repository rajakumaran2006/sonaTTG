-- Add department_id to labs table for proper department association
-- This enables filtering labs by department in both admin and super admin interfaces

-- Add department_id column to labs table
ALTER TABLE public.labs ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_labs_department_id ON public.labs(department_id);

-- Update existing labs to have a default department (first department in the table)
-- This is a temporary fix until proper department assignment is implemented
UPDATE public.labs SET department_id = (SELECT id FROM public.departments ORDER BY created_at LIMIT 1) WHERE department_id IS NULL;

-- Make department_id not null after populating existing data
ALTER TABLE public.labs ALTER COLUMN department_id SET NOT NULL;
