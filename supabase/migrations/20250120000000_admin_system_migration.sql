-- =====================================================
-- Admin System Migration
-- Comprehensive admin functionality for timetable management
-- =====================================================

-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- =====================================================
-- 1. ADMIN USERS TABLE
-- =====================================================
create table if not exists public.admin_users (
  id uuid primary key default uuid_generate_v4(),
  username text unique not null,
  email text unique not null,
  password_hash text not null,
  full_name text not null,
  role text not null default 'admin' check (role in ('admin', 'super_admin', 'faculty_admin')),
  is_active boolean not null default true,
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.admin_users(id) on delete set null
);

-- =====================================================
-- 2. ADMIN SESSIONS TABLE
-- =====================================================
create table if not exists public.admin_sessions (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid not null references public.admin_users(id) on delete cascade,
  session_token text unique not null,
  expires_at timestamptz not null,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

-- =====================================================
-- 3. ADMIN ACTIVITY LOGS
-- =====================================================
create table if not exists public.admin_activity_logs (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid not null references public.admin_users(id) on delete cascade,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  details jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

-- =====================================================
-- 4. CSV UPLOAD LOGS
-- =====================================================
create table if not exists public.csv_upload_logs (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid not null references public.admin_users(id) on delete cascade,
  table_name text not null,
  file_name text not null,
  total_records integer not null,
  successful_records integer not null default 0,
  failed_records integer not null default 0,
  duplicate_records integer not null default 0,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  error_details jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- =====================================================
-- 5. SYSTEM SETTINGS
-- =====================================================
create table if not exists public.system_settings (
  id uuid primary key default uuid_generate_v4(),
  key text unique not null,
  value jsonb not null,
  description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users(id) on delete set null
);

-- =====================================================
-- 6. NOTIFICATION SYSTEM
-- =====================================================
create table if not exists public.admin_notifications (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid not null references public.admin_users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info' check (type in ('info', 'warning', 'error', 'success')),
  is_read boolean not null default false,
  action_url text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- =====================================================
-- 7. BULK OPERATIONS TRACKING
-- =====================================================
create table if not exists public.bulk_operations (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid not null references public.admin_users(id) on delete cascade,
  operation_type text not null,
  target_table text not null,
  total_items integer not null,
  processed_items integer not null default 0,
  successful_items integer not null default 0,
  failed_items integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  progress_percentage numeric(5,2) not null default 0,
  error_log jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- =====================================================
-- 8. DATA VALIDATION RULES
-- =====================================================
create table if not exists public.data_validation_rules (
  id uuid primary key default uuid_generate_v4(),
  table_name text not null,
  column_name text not null,
  rule_type text not null check (rule_type in ('required', 'format', 'range', 'unique', 'foreign_key')),
  rule_config jsonb not null,
  error_message text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================
-- 9. AUDIT TRAIL FOR CRITICAL TABLES
-- =====================================================
create table if not exists public.audit_trail (
  id uuid primary key default uuid_generate_v4(),
  table_name text not null,
  record_id uuid not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_values jsonb,
  new_values jsonb,
  admin_id uuid references public.admin_users(id) on delete set null,
  ip_address inet,
  created_at timestamptz not null default now()
);

-- =====================================================
-- 10. INDEXES FOR PERFORMANCE
-- =====================================================

-- Admin users indexes
create index if not exists idx_admin_users_email on public.admin_users(email);
create index if not exists idx_admin_users_username on public.admin_users(username);
create index if not exists idx_admin_users_role on public.admin_users(role);
create index if not exists idx_admin_users_active on public.admin_users(is_active);

-- Sessions indexes
create index if not exists idx_admin_sessions_admin_id on public.admin_sessions(admin_id);
create index if not exists idx_admin_sessions_token on public.admin_sessions(session_token);
create index if not exists idx_admin_sessions_expires on public.admin_sessions(expires_at);

-- Activity logs indexes
create index if not exists idx_activity_logs_admin_id on public.admin_activity_logs(admin_id);
create index if not exists idx_activity_logs_created_at on public.admin_activity_logs(created_at);
create index if not exists idx_activity_logs_action on public.admin_activity_logs(action);

-- CSV upload logs indexes
create index if not exists idx_csv_logs_admin_id on public.csv_upload_logs(admin_id);
create index if not exists idx_csv_logs_status on public.csv_upload_logs(status);
create index if not exists idx_csv_logs_created_at on public.csv_upload_logs(created_at);

-- Notifications indexes
create index if not exists idx_notifications_admin_id on public.admin_notifications(admin_id);
create index if not exists idx_notifications_unread on public.admin_notifications(admin_id, is_read) where is_read = false;
create index if not exists idx_notifications_created_at on public.admin_notifications(created_at);

-- Bulk operations indexes
create index if not exists idx_bulk_ops_admin_id on public.bulk_operations(admin_id);
create index if not exists idx_bulk_ops_status on public.bulk_operations(status);
create index if not exists idx_bulk_ops_created_at on public.bulk_operations(created_at);

-- Audit trail indexes
create index if not exists idx_audit_trail_table_record on public.audit_trail(table_name, record_id);
create index if not exists idx_audit_trail_created_at on public.audit_trail(created_at);
create index if not exists idx_audit_trail_admin_id on public.audit_trail(admin_id);

-- =====================================================
-- 11. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on all tables
alter table public.admin_users enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_activity_logs enable row level security;
alter table public.csv_upload_logs enable row level security;
alter table public.system_settings enable row level security;
alter table public.admin_notifications enable row level security;
alter table public.bulk_operations enable row level security;
alter table public.data_validation_rules enable row level security;
alter table public.audit_trail enable row level security;

-- Admin users policies
create policy "Admin users are publicly readable" on public.admin_users for select using (true);
create policy "Admin users are publicly insertable" on public.admin_users for insert with check (true);
create policy "Admin users are publicly updatable" on public.admin_users for update using (true);

-- Sessions policies
create policy "Sessions are publicly accessible" on public.admin_sessions for all using (true);

-- Activity logs policies
create policy "Activity logs are publicly accessible" on public.admin_activity_logs for all using (true);

-- CSV upload logs policies
create policy "CSV logs are publicly accessible" on public.csv_upload_logs for all using (true);

-- System settings policies
create policy "Public settings are readable" on public.system_settings for select using (is_public = true);
create policy "All settings are accessible to admins" on public.system_settings for all using (true);

-- Notifications policies
create policy "Notifications are accessible to owner" on public.admin_notifications for all using (true);

-- Bulk operations policies
create policy "Bulk operations are publicly accessible" on public.bulk_operations for all using (true);

-- Data validation rules policies
create policy "Validation rules are publicly accessible" on public.data_validation_rules for all using (true);

-- Audit trail policies
create policy "Audit trail is publicly readable" on public.audit_trail for select using (true);

-- =====================================================
-- 12. TRIGGERS FOR UPDATED_AT
-- =====================================================

-- Create updated_at trigger function if it doesn't exist
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at triggers
create trigger trg_admin_users_updated_at
  before update on public.admin_users
  for each row execute procedure public.update_updated_at_column();

create trigger trg_system_settings_updated_at
  before update on public.system_settings
  for each row execute procedure public.update_updated_at_column();

create trigger trg_data_validation_rules_updated_at
  before update on public.data_validation_rules
  for each row execute procedure public.update_updated_at_column();

-- =====================================================
-- 13. AUDIT TRIGGERS FOR CRITICAL TABLES
-- =====================================================

-- Function to create audit triggers
create or replace function public.create_audit_trigger(table_name text)
returns void as $$
begin
  execute format('
    create trigger trg_%I_audit
      after insert or update or delete on public.%I
      for each row execute procedure public.audit_trigger_function()',
    table_name, table_name);
end;
$$ language plpgsql;

-- Audit trigger function
create or replace function public.audit_trigger_function()
returns trigger as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_trail (table_name, record_id, operation, old_values)
    values (tg_table_name, old.id, tg_op, row_to_json(old));
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_trail (table_name, record_id, operation, old_values, new_values)
    values (tg_table_name, new.id, tg_op, row_to_json(old), row_to_json(new));
    return new;
  elsif tg_op = 'INSERT' then
    insert into public.audit_trail (table_name, record_id, operation, new_values)
    values (tg_table_name, new.id, tg_op, row_to_json(new));
    return new;
  end if;
  return null;
end;
$$ language plpgsql;

-- Apply audit triggers to critical tables
select public.create_audit_trigger('faculty_members');
select public.create_audit_trigger('subjects');
select public.create_audit_trigger('departments');
select public.create_audit_trigger('timetables');

-- =====================================================
-- 14. DEFAULT SYSTEM SETTINGS
-- =====================================================

insert into public.system_settings (key, value, description, is_public) values
('max_upload_size', '10485760', 'Maximum file upload size in bytes (10MB)', true),
('allowed_file_types', '["csv", "xlsx", "xls"]', 'Allowed file types for uploads', true),
('session_timeout', '3600', 'Admin session timeout in seconds', false),
('max_faculty_per_subject', '5', 'Maximum number of faculty per subject', true),
('backup_retention_days', '30', 'Number of days to retain backups', false),
('notification_retention_days', '90', 'Number of days to retain notifications', false)
on conflict (key) do nothing;

-- =====================================================
-- 15. DEFAULT VALIDATION RULES
-- =====================================================

insert into public.data_validation_rules (table_name, column_name, rule_type, rule_config, error_message) values
('faculty_members', 'email', 'format', '{"pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"}', 'Invalid email format'),
('faculty_members', 'name', 'required', '{}', 'Name is required'),
('faculty_members', 'department_id', 'foreign_key', '{"table": "departments", "column": "id"}', 'Invalid department'),
('subjects', 'name', 'required', '{}', 'Subject name is required'),
('subjects', 'hours_per_week', 'range', '{"min": 1, "max": 20}', 'Hours per week must be between 1 and 20'),
('departments', 'name', 'required', '{}', 'Department name is required')
on conflict do nothing;

-- =====================================================
-- 16. UTILITY FUNCTIONS
-- =====================================================

-- Function to log admin activity
create or replace function public.log_admin_activity(
  p_admin_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid default null,
  p_details jsonb default null,
  p_ip_address inet default null
)
returns void as $$
begin
  insert into public.admin_activity_logs (admin_id, action, resource_type, resource_id, details, ip_address)
  values (p_admin_id, p_action, p_resource_type, p_resource_id, p_details, p_ip_address);
end;
$$ language plpgsql;

-- Function to create notification
create or replace function public.create_admin_notification(
  p_admin_id uuid,
  p_title text,
  p_message text,
  p_type text default 'info',
  p_action_url text default null,
  p_metadata jsonb default null
)
returns uuid as $$
declare
  notification_id uuid;
begin
  insert into public.admin_notifications (admin_id, title, message, type, action_url, metadata)
  values (p_admin_id, p_title, p_message, p_type, p_action_url, p_metadata)
  returning id into notification_id;
  return notification_id;
end;
$$ language plpgsql;

-- Function to validate CSV data
create or replace function public.validate_csv_data(
  p_table_name text,
  p_data jsonb
)
returns jsonb as $$
declare
  validation_result jsonb := '{"valid": true, "errors": []}';
  rule_record record;
  error_count integer := 0;
begin
  for rule_record in 
    select * from public.data_validation_rules 
    where table_name = p_table_name and is_active = true
  loop
    -- Implementation would depend on specific validation rules
    -- This is a placeholder for the validation logic
    null;
  end loop;
  
  return validation_result;
end;
$$ language plpgsql;

-- =====================================================
-- 17. CLEANUP AND MAINTENANCE FUNCTIONS
-- =====================================================

-- Function to clean up expired sessions
create or replace function public.cleanup_expired_sessions()
returns integer as $$
declare
  deleted_count integer;
begin
  delete from public.admin_sessions where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql;

-- Function to clean up old notifications
create or replace function public.cleanup_old_notifications()
returns integer as $$
declare
  deleted_count integer;
  retention_days integer;
begin
  select (value->>'notification_retention_days')::integer 
  into retention_days 
  from public.system_settings 
  where key = 'notification_retention_days';
  
  delete from public.admin_notifications 
  where created_at < now() - (retention_days || ' days')::interval;
  
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql;

-- =====================================================
-- 18. INITIAL ADMIN USER (if needed)
-- =====================================================

-- Uncomment and modify if you need a default admin user
-- insert into public.admin_users (username, email, password_hash, full_name, role)
-- values ('admin', 'admin@college.edu', '$2a$10$...', 'System Administrator', 'super_admin')
-- on conflict (username) do nothing;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Log the migration completion
do $$
begin
  raise notice 'Admin system migration completed successfully';
  raise notice 'Created tables: admin_users, admin_sessions, admin_activity_logs, csv_upload_logs, system_settings, admin_notifications, bulk_operations, data_validation_rules, audit_trail';
  raise notice 'Applied RLS policies and triggers';
  raise notice 'Created utility functions for admin operations';
end $$;

