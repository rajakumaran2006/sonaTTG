-- Create unified users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'super_admin')),
  department_id UUID REFERENCES departments(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Create verify_password RPC function (if not exists)
CREATE OR REPLACE FUNCTION verify_password(password TEXT, hashed_password TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN crypt(password, hashed_password) = hashed_password;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create hash_password helper function
CREATE OR REPLACE FUNCTION hash_password(password TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN crypt(password, gen_salt('bf'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Example: Insert super admin (password: admin123)
-- INSERT INTO users (name, email, password_hash, role, department_id)
-- VALUES (
--   'Super Admin',
--   'superadmin@example.com',
--   hash_password('admin123'),
--   'super_admin',
--   NULL
-- );

-- Example: Insert department admin (password: admin123)
-- INSERT INTO users (name, email, password_hash, role, department_id)
-- VALUES (
--   'Department Admin',
--   'admin@example.com',
--   hash_password('admin123'),
--   'admin',
--   'your-department-uuid-here'
-- );

-- Migration: Copy existing admin_users to users table (if needed)
-- INSERT INTO users (id, name, email, password_hash, role, department_id, is_active, created_at)
-- SELECT 
--   id,
--   name,
--   email,
--   password_hash,
--   'admin' as role,
--   department_id,
--   is_active,
--   created_at
-- FROM admin_users
-- WHERE NOT EXISTS (SELECT 1 FROM users WHERE users.email = admin_users.email);
