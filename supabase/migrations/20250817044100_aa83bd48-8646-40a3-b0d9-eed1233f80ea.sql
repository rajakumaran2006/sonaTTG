-- Create special_hours_config table for storing special hours configuration by department+year
CREATE TABLE public.special_hours_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  department_id UUID NOT NULL,
  year TEXT NOT NULL,
  special_type TEXT NOT NULL,
  total_hours INTEGER NOT NULL DEFAULT 0,
  saturday_hours INTEGER NOT NULL DEFAULT 0,
  weekdays_hours INTEGER NOT NULL DEFAULT 0,
  saturday_periods JSONB NOT NULL DEFAULT '[]'::jsonb,
  weekdays_periods JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(department_id, year, special_type)
);

-- Enable Row Level Security
ALTER TABLE public.special_hours_config ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "special_hours_config are publicly readable" 
ON public.special_hours_config 
FOR SELECT 
USING (true);

CREATE POLICY "special_hours_config are publicly insertable" 
ON public.special_hours_config 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "special_hours_config are publicly updatable" 
ON public.special_hours_config 
FOR UPDATE 
USING (true);

CREATE POLICY "special_hours_config are publicly deletable" 
ON public.special_hours_config 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_special_hours_config_updated_at
BEFORE UPDATE ON public.special_hours_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default special hours configurations for existing departments
INSERT INTO public.special_hours_config (department_id, year, special_type, total_hours, saturday_hours, weekdays_hours, saturday_periods, weekdays_periods)
SELECT 
  d.id as department_id,
  year_option.year,
  special_type.type,
  special_type.default_hours,
  special_type.default_saturday_hours,
  0 as weekdays_hours,
  special_type.default_saturday_periods,
  '[]'::jsonb as weekdays_periods
FROM departments d
CROSS JOIN (VALUES ('1'), ('2'), ('3'), ('4')) AS year_option(year)
CROSS JOIN (
  VALUES 
    ('seminar', 2, 2, '[2, 3]'::jsonb),
    ('library', 1, 1, '[4]'::jsonb),
    ('counselling', 2, 2, '[5, 6]'::jsonb)
) AS special_type(type, default_hours, default_saturday_hours, default_saturday_periods)
ON CONFLICT (department_id, year, special_type) DO NOTHING;