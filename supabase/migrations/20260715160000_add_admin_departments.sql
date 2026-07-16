-- Migration to support multiple departments for admin users

CREATE TABLE IF NOT EXISTS public.admin_departments (
  admin_id UUID REFERENCES public.admin_users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (admin_id, department_id)
);

-- Copy existing department allocations to the new table
INSERT INTO public.admin_departments (admin_id, department_id)
SELECT id, department_id 
FROM public.admin_users 
WHERE department_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Make department_id nullable on admin_users, since an admin can be allocated to multiple depts
ALTER TABLE public.admin_users ALTER COLUMN department_id DROP NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.admin_departments ENABLE ROW LEVEL SECURITY;

-- Create policies for admin_departments
CREATE POLICY "Allow all admin_departments operations" ON public.admin_departments
  FOR ALL USING (true) WITH CHECK (true);
