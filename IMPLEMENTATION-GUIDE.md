# Unified Login System - Implementation Guide

## 🎯 Overview

This refactor consolidates separate Admin and Super Admin login pages into a single, intelligent login gateway that automatically detects user roles and redirects to the appropriate portal.

## 📦 Files Created

1. **UnifiedLogin.tsx** - Modern landing page with unified login card
2. **ProtectedRoute.tsx** - Reusable route protection component
3. **Unauthorized.tsx** - Access denied page
4. **App.example.tsx** - Complete route configuration example
5. **database-migration.sql** - Database schema and migration script

## 🚀 Implementation Steps

### Step 1: Database Setup

Run the SQL migration in your Supabase SQL Editor:

```sql
-- See database-migration.sql for complete script
```

This creates:
- `users` table with unified structure
- `verify_password()` RPC function
- `hash_password()` helper function
- Necessary indexes

### Step 2: Create Test Users

```sql
-- Super Admin
INSERT INTO users (name, email, password_hash, role)
VALUES (
  'Super Admin',
  'superadmin@example.com',
  hash_password('admin123'),
  'super_admin'
);

-- Department Admin
INSERT INTO users (name, email, password_hash, role, department_id)
VALUES (
  'John Doe',
  'admin@example.com',
  hash_password('admin123'),
  'admin',
  'your-department-uuid'
);
```

### Step 3: Update Your App.tsx

Replace your current routing with the example from `App.example.tsx`:

```tsx
import UnifiedLogin from "./pages/UnifiedLogin";
import ProtectedRoute from "./components/ProtectedRoute";
import Unauthorized from "./pages/Unauthorized";

// Then wrap protected routes:
<Route
  path="/admin"
  element={
    <ProtectedRoute allowedRoles={["admin"]}>
      <Index />
    </ProtectedRoute>
  }
/>
```

### Step 4: Update Existing Components

Replace any code that reads from `localStorage.getItem("adminUser")` or `localStorage.getItem("superAdmin")` with:

```tsx
const userStr = localStorage.getItem("user");
const user = userStr ? JSON.parse(userStr) : null;

// Access user properties:
// user.id
// user.name
// user.email
// user.role ('admin' | 'super_admin')
// user.department_id
```

### Step 5: Remove Old Files

Delete these obsolete files:
- `AdminLogin.tsx`
- `SuperAdminLogin.tsx`
- `Home.tsx` (role selection page)

### Step 6: Update Route References

Remove these routes from App.tsx:
```tsx
<Route path="/admin-login" element={<AdminLogin />} />
<Route path="/super-admin-login" element={<SuperAdminLogin />} />
<Route path="/" element={<RoleSelect />} />
```

## 🔐 Authentication Flow

```
User enters email + password
         ↓
Query users table (email + is_active)
         ↓
Verify password via RPC
         ↓
Store session in localStorage
         ↓
Redirect based on role:
  - super_admin → /super-admin
  - admin → /admin
```

## 🛡️ Route Protection

```tsx
// Admin-only route
<ProtectedRoute allowedRoles={["admin"]}>
  <AdminDashboard />
</ProtectedRoute>

// Super Admin-only route
<ProtectedRoute allowedRoles={["super_admin"]}>
  <SuperAdminDashboard />
</ProtectedRoute>

// Both roles allowed
<ProtectedRoute allowedRoles={["admin", "super_admin"]}>
  <SharedComponent />
</ProtectedRoute>
```

## 📊 Database Schema

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "admin" | "super_admin";
  department_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

## 🎨 UI Features

- ✅ Glassmorphism login card
- ✅ Gradient background with animations
- ✅ Loading states with spinner
- ✅ Toast notifications for all states
- ✅ Responsive design
- ✅ Icon-enhanced inputs
- ✅ Disabled state handling
- ✅ Premium modern aesthetic

## ⚠️ Error Handling

The system handles:
- User not found
- Inactive accounts
- Wrong passwords
- Missing password_hash
- Database connection errors
- RPC function failures
- Invalid roles
- Unauthorized access attempts

## 🔄 Session Management

```typescript
// Login - stores session
localStorage.setItem("user", JSON.stringify(sessionData));

// Logout - clears session
localStorage.removeItem("user");
navigate("/login", { replace: true });

// Check authentication
const user = JSON.parse(localStorage.getItem("user") || "null");
if (!user) {
  // Redirect to login
}
```

## 🧪 Testing

Test these scenarios:

1. ✅ Valid super admin login → redirects to /super-admin
2. ✅ Valid admin login → redirects to /admin
3. ❌ Invalid email → shows error toast
4. ❌ Invalid password → shows error toast
5. ❌ Inactive account → shows error toast
6. ❌ Access protected route without login → redirects to /login
7. ❌ Admin tries to access super admin route → redirects to /unauthorized

## 📝 Migration Checklist

- [ ] Run database migration SQL
- [ ] Create test users
- [ ] Copy UnifiedLogin.tsx to src/pages/
- [ ] Copy ProtectedRoute.tsx to src/components/
- [ ] Copy Unauthorized.tsx to src/pages/
- [ ] Update App.tsx with new routes
- [ ] Update components reading old localStorage keys
- [ ] Test all login scenarios
- [ ] Test route protection
- [ ] Delete old login files
- [ ] Update navigation links

## 🎯 Benefits

- Single source of truth for authentication
- Cleaner codebase (removed 3 files, added 3 focused files)
- Better UX (no role selection needed)
- Centralized session management
- Reusable route protection
- Type-safe with TypeScript
- Production-ready error handling
- Scalable for future roles

## 🔧 Customization

### Add New Role

1. Update database constraint:
```sql
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('admin', 'super_admin', 'faculty'));
```

2. Update TypeScript types:
```typescript
role: "admin" | "super_admin" | "faculty";
```

3. Add redirect logic in UnifiedLogin.tsx
4. Create protected routes with new role

### Change Redirect Routes

Edit the redirect logic in `UnifiedLogin.tsx`:

```typescript
if (user.role === "super_admin") {
  navigate("/your-super-admin-route", { replace: true });
} else if (user.role === "admin") {
  navigate("/your-admin-route", { replace: true });
}
```

## 📞 Support

If you encounter issues:
1. Check browser console for errors
2. Verify database table exists
3. Confirm RPC function is created
4. Test with SQL directly in Supabase
5. Check localStorage in DevTools

---

**Ready to deploy!** 🚀
