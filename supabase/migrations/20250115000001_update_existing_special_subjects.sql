-- Update any existing subjects with 'special' type to 'theory' type
UPDATE public.subjects 
SET type = 'theory' 
WHERE type = 'special';
