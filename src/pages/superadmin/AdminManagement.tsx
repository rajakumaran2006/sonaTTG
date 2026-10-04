import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/navbar/Navbar";
import { Plus, Edit, Trash2, UserCheck, UserX, UserCog, Shield } from "lucide-react";
import { CustomTable } from "@/components/ui/CustomTable";
import { Checkbox } from "@/components/ui/checkbox";
import { useDarkMode } from "@/context/DarkModeContext";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  department_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  department?: {
    name: string;
  };
  admin_departments?: { department_id: string }[];
}

interface Department {
  id: string;
  name: string;
}

const AdminManagement = () => {
  const navigate = useNavigate();
  const { isDark } = useDarkMode();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    department_id: "",
    department_ids: [] as string[],
    password: ""
  });

  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try {
      return localStorage.getItem("superAdmin") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const checkAuth = () => {
      try {
        const loggedIn = localStorage.getItem("superAdmin") === "true";
        setIsLoggedIn(loggedIn);
        return loggedIn;
      } catch {
        return false;
      }
    };

    if (!checkAuth()) {
      navigate("/", { replace: true });
      return;
    }

    document.title = "Admin Management - Super Admin";
    loadData();

    // Listen for storage changes (in case user logs in/out in another tab)
    const handleStorageChange = () => {
      if (!checkAuth()) {
        navigate("/", { replace: true });
      } else {
        loadData();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      console.log('Starting to load admin data...');
      console.log('Current auth state - isLoggedIn:', isLoggedIn);
      console.log('localStorage superAdmin value:', localStorage.getItem("superAdmin"));

      // Check if user is authenticated
      if (!isLoggedIn) {
        console.log('User not authenticated, redirecting to login');
        navigate("/", { replace: true });
        return;
      }

      // Test database connection
      console.log('Testing database connection...');
      const { data: testData, error: testError } = await (supabase as any)
        .from('departments')
        .select('count')
        .limit(1);

      if (testError) {
        console.error('Database connection test failed:', testError);
        toast.error('Database connection failed. Please check your connection.');
        setLoading(false);
        return;
      }

      console.log('Database connection test successful');

      const [adminsRes, deptsRes] = await Promise.all([
        (supabase as any)
          .from('admin_users')
          .select('*, admin_departments(department_id)')
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('departments')
          .select('*')
          .order('name')
      ]);

      console.log('Raw admins response:', adminsRes);
      console.log('Raw departments response:', deptsRes);

      // Check for connection issues
      if (adminsRes.error?.message?.includes('relation') && adminsRes.error?.message?.includes('does not exist')) {
        console.error('admin_users table does not exist');
        toast.error('Database setup incomplete. Please ensure migrations are applied.');
        setLoading(false);
        return;
      }

      if (deptsRes.error?.message?.includes('relation') && deptsRes.error?.message?.includes('does not exist')) {
        console.error('departments table does not exist');
        toast.error('Database setup incomplete. Please ensure migrations are applied.');
        setLoading(false);
        return;
      }

      const adminsData = adminsRes.data || [];
      const deptsData = deptsRes.data || [];

      console.log('Processed admins data:', adminsData);
      console.log('Processed departments data:', deptsData);

      // Additional debugging
      if (adminsRes.data) {
        console.log('Admin data structure:', Object.keys(adminsRes.data[0] || {}));
      }
      if (deptsRes.data) {
        console.log('Department data structure:', Object.keys(deptsRes.data[0] || {}));
      }

      // Check if we have departments but no admins
      if (deptsData.length > 0 && adminsData.length === 0) {
        console.log('Departments exist but no admins found');
      }

      // Check for potential schema issues
      if (adminsRes.error) {
        console.error('Admin query error:', adminsRes.error);
        console.error('Admin query error details:', adminsRes.error.details, adminsRes.error.message, adminsRes.error.hint);
      }
      if (deptsRes.error) {
        console.error('Department query error:', deptsRes.error);
        console.error('Department query error details:', deptsRes.error.details, deptsRes.error.message, deptsRes.error.hint);
      }

      // Check if tables exist
      if (adminsRes.status === 404 || deptsRes.status === 404) {
        console.error('One or more tables do not exist');
        toast.error('Database tables not found. Please ensure migrations are applied.');
      }

      setAdmins(adminsData);
      setDepartments(deptsData);

      console.log('Final loaded departments:', deptsData);
      console.log('Final loaded admins:', adminsData);

      // Additional debugging for admin data
      if (adminsData.length === 0 && deptsData.length > 0) {
        console.warn('No admins found but departments exist - this might indicate admin creation issues');
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error(`Failed to load admin data: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAdmin = async () => {
    if (!formData.name || !formData.email || formData.department_ids.length === 0 || !formData.password) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      // Hash the password using the database function
      const { data: hashResult, error: hashError } = await (supabase as any)
        .rpc('hash_password', { password: formData.password });

      if (hashError) {
        console.error('Error hashing password:', hashError);
        toast.error('Failed to hash password');
        return;
      }

      console.log('Creating admin with data:', {
        name: formData.name,
        email: formData.email,
        department_ids: formData.department_ids,
        password_hash: hashResult ? '[HASHED]' : '[NO HASH]'
      });

      // Insert admin user
      const { data: newAdmins, error } = await (supabase as any)
        .from('admin_users')
        .insert({
          name: formData.name,
          email: formData.email,
          department_id: formData.department_ids[0], // fallback primary
          password_hash: hashResult,
          is_active: true
        })
        .select();

      if (error || !newAdmins || newAdmins.length === 0) {
        console.error('Supabase error creating admin:', error);
        toast.error(`Failed to create admin: ${error?.message || 'Unknown error'}`);
        return;
      }

      const newAdmin = newAdmins[0];

      // Insert mappings into admin_departments
      const deptInserts = formData.department_ids.map(deptId => ({
        admin_id: newAdmin.id,
        department_id: deptId
      }));

      const { error: deptError } = await (supabase as any)
        .from('admin_departments')
        .insert(deptInserts);

      if (deptError) {
        console.error('Error mapping departments:', deptError);
        toast.error('Admin created, but department mapping failed.');
      }

      console.log('Admin created successfully');

      // Wait a moment before reloading to ensure database commit
      await new Promise(resolve => setTimeout(resolve, 1000));

      toast.success('Admin created successfully');
      setOpenCreate(false);
      resetForm();
      await loadData();
    } catch (error) {
      console.error('Error creating admin:', error);
      toast.error('Failed to create admin');
    }
  };

  const handleUpdateAdmin = async () => {
    if (!editingAdmin) return;

    try {
      const updateData: any = {
        name: formData.name,
        email: formData.email,
        department_id: formData.department_ids[0] || null,
      };

      if (formData.password) {
        const { data: hashResult, error: hashError } = await (supabase as any)
          .rpc('hash_password', { password: formData.password });

        if (hashError) {
          console.error('Error hashing password:', hashError);
          toast.error('Failed to hash password');
          return;
        }
        updateData.password_hash = hashResult;
      }

      const { error } = await (supabase as any)
        .from('admin_users')
        .update(updateData)
        .eq('id', editingAdmin.id);

      if (error) {
        toast.error('Failed to update admin');
        return;
      }

      // Sync admin_departments: delete old and insert new
      await (supabase as any)
        .from('admin_departments')
        .delete()
        .eq('admin_id', editingAdmin.id);

      if (formData.department_ids.length > 0) {
        const deptInserts = formData.department_ids.map(deptId => ({
          admin_id: editingAdmin.id,
          department_id: deptId
        }));
        const { error: deptError } = await (supabase as any)
          .from('admin_departments')
          .insert(deptInserts);

        if (deptError) {
          console.error('Error updating department mappings:', deptError);
        }
      }

      toast.success('Admin updated successfully');
      setEditingAdmin(null);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error updating admin:', error);
      toast.error('Failed to update admin');
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    if (!confirm('Are you sure you want to delete this admin?')) return;

    try {
      const { error } = await (supabase as any)
        .from('admin_users')
        .delete()
        .eq('id', adminId);

      if (error) {
        toast.error('Failed to delete admin');
        return;
      }

      toast.success('Admin deleted successfully');
      loadData();
    } catch (error) {
      console.error('Error deleting admin:', error);
      toast.error('Failed to delete admin');
    }
  };

  const handleToggleStatus = async (adminId: string, currentStatus: boolean) => {
    try {
      const { error } = await (supabase as any)
        .from('admin_users')
        .update({ is_active: !currentStatus })
        .eq('id', adminId);

      if (error) {
        toast.error('Failed to update admin status');
        return;
      }

      toast.success(`Admin ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      loadData();
    } catch (error) {
      console.error('Error updating admin status:', error);
      toast.error('Failed to update admin status');
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      department_id: "",
      department_ids: [],
      password: ""
    });
  };

  const openEditDialog = (admin: AdminUser) => {
    setEditingAdmin(admin);
    const deptIds = (admin.admin_departments && admin.admin_departments.length > 0)
      ? admin.admin_departments.map(d => d.department_id)
      : (admin.department_id ? [admin.department_id] : []);
    setFormData({
      name: admin.name,
      email: admin.email,
      department_id: admin.department_id || "",
      department_ids: deptIds,
      password: ""
    });
  };

  if (!isLoggedIn) return null;

  const AdminTable = CustomTable<AdminUser>;

  return (
    <div className={`min-h-screen relative overflow-x-hidden transition-colors duration-300 ${
      isDark ? "bg-[#060814] text-white" : "bg-[#f8faff] text-slate-900"
    }`}>
      {/* Ambient background refraction orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {isDark ? (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-600/10 via-purple-600/08 to-transparent blur-3xl opacity-70" />
            <div className="absolute top-1/3 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-cyan-600/08 via-indigo-600/08 to-transparent blur-3xl opacity-60" />
            <div className="absolute -bottom-20 left-1/3 w-96 h-96 rounded-full bg-gradient-to-tr from-purple-600/08 via-indigo-600/06 to-transparent blur-3xl opacity-50" />
          </>
        ) : (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-200/40 via-purple-200/30 to-transparent blur-3xl opacity-75" />
            <div className="absolute top-1/4 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-purple-200/35 via-indigo-100/40 to-transparent blur-3xl opacity-65" />
            <div className="absolute -bottom-20 left-1/3 w-96 h-96 rounded-full bg-gradient-to-tr from-indigo-100/40 via-purple-100/30 to-transparent blur-3xl opacity-50" />
          </>
        )}
      </div>

      <Navbar />

      <main className="md:pl-72 pt-16 md:pt-16 transition-all duration-300 relative z-10">
        <section className="max-w-7xl mx-auto px-6 sm:px-8 py-8 md:py-10 w-full space-y-8">
          {/* Header Banner */}
          <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-5 p-6 rounded-2xl backdrop-blur-2xl border transition-all duration-300 ${
            isDark
              ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
              : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
          }`}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                  isDark
                    ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/25"
                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                }`}>
                  System Access
                </span>
                <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {admins.length} {admins.length === 1 ? 'administrator' : 'administrators'}
                </span>
              </div>
              <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                isDark ? "text-white" : "bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 bg-clip-text text-transparent"
              }`}>
                Administrator Management
              </h1>
              <p className={`text-xs sm:text-sm mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Configure role access, credentials, and department allocations for administrators.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => navigate('/admin')}
                className={`h-10 rounded-xl border text-xs font-semibold px-4 transition-all ${
                  isDark
                    ? "bg-white/5 border-indigo-500/20 text-slate-200 hover:bg-white/10"
                    : "bg-white border-indigo-200/80 text-slate-700 hover:bg-indigo-50"
                }`}
              >
                Admin Console
              </Button>
              <Dialog open={openCreate} onOpenChange={setOpenCreate}>
                <DialogTrigger asChild>
                  <Button className="h-10 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs px-4 shadow-sm shadow-indigo-500/25 border border-indigo-400/30 flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Create Admin
                  </Button>
                </DialogTrigger>
                <DialogContent className={`rounded-2xl border backdrop-blur-2xl shadow-2xl ${
                  isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
                }`}>
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold">Create New Admin</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="name" className="text-xs font-semibold">Name</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="rounded-xl h-10 text-xs"
                        placeholder="e.g. Dr. John Doe"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="email" className="text-xs font-semibold">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="rounded-xl h-10 text-xs"
                        placeholder="admin@college.edu"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs font-semibold">Departments <span className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>(select one or more)</span></Label>
                      <div className={`border rounded-xl p-3 max-h-44 overflow-y-auto space-y-1.5 ${
                        isDark ? "bg-white/[0.03] border-indigo-500/20" : "bg-slate-50 border-slate-200"
                      }`}>
                        {departments.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No departments available</p>
                        ) : departments.map((dept) => {
                          const checked = formData.department_ids.includes(dept.id);
                          return (
                            <label key={dept.id} className={`flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-lg transition-colors text-xs ${
                              isDark ? "hover:bg-white/[0.06]" : "hover:bg-indigo-50/80"
                            }`}>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) => {
                                  const ids = c
                                    ? [...formData.department_ids, dept.id]
                                    : formData.department_ids.filter(id => id !== dept.id);
                                  setFormData({ ...formData, department_ids: ids, department_id: ids[0] || '' });
                                }}
                              />
                              <span className="text-xs font-medium">{dept.name}</span>
                            </label>
                          );
                        })}
                      </div>
                      {formData.department_ids.length > 0 && (
                        <p className="text-[11px] text-indigo-400 font-medium">{formData.department_ids.length} department(s) selected</p>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="password" className="text-xs font-semibold">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="rounded-xl h-10 text-xs"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" className="rounded-xl text-xs" onClick={() => setOpenCreate(false)}>
                      Cancel
                    </Button>
                    <Button className="rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold" onClick={handleCreateAdmin}>
                      Create Admin
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Table Container Card */}
          <div className={`rounded-2xl backdrop-blur-2xl border transition-all duration-300 p-4 md:p-6 shadow-xl ${
            isDark
              ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)] text-white"
              : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)] text-slate-900"
          }`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl font-semibold tracking-tight">Department Administrators</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : departments.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  No departments found. You need to create departments first before creating admins.
                </p>
                <Button
                  variant="outline"
                  onClick={() => navigate('/super-admin')}
                >
                  Go to Dashboard to Create Departments
                </Button>
              </div>
            ) : admins.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No administrators found. Create your first admin to get started.
              </div>
            ) : (
              <AdminTable
                data={admins}
                getRowId={(row) => row.id}
                searchKey={(row) => `${row.name} ${row.email}`}
                searchPlaceholder="Search admins by name or email..."
                exportFileName="administrators-list"
                onDeleteSelected={async (ids) => {
                  for (const id of ids) {
                    await handleDeleteAdmin(id);
                  }
                }}
                 columns={[
                  {
                    key: "name",
                    header: "Name",
                    sortable: true,
                    render: (row) => <span className="font-semibold text-slate-900 dark:text-slate-100">{row.name}</span>
                  },
                  {
                    key: "email",
                    header: "Email",
                    sortable: true,
                    render: (row) => <span className="text-slate-600 dark:text-slate-400 font-mono text-sm">{row.email}</span>
                  },
                  {
                    key: "department",
                    header: "Departments",
                    sortable: true,
                    render: (row) => {
                      const deptIds = (row.admin_departments && row.admin_departments.length > 0)
                        ? row.admin_departments.map((d: any) => d.department_id)
                        : (row.department_id ? [row.department_id] : []);
                      const names = deptIds.map((id: string) => departments.find(d => d.id === id)?.name).filter(Boolean);
                      if (names.length === 0) return <span className="text-slate-400 dark:text-slate-500 text-xs">Not assigned</span>;
                      return (
                        <div className="flex flex-wrap gap-1">
                          {names.map((name: string, i: number) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40">{name}</span>
                          ))}
                        </div>
                      );
                    }
                  },
                  {
                    key: "is_active",
                    header: "Status",
                    sortable: true,
                    render: (row) => (
                      <Badge variant={row.is_active ? "default" : "secondary"} className={row.is_active ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40" : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400 border border-slate-200 dark:border-slate-800"}>
                        {row.is_active ? "Active" : "Inactive"}
                      </Badge>
                    )
                  },
                  {
                    key: "created_at",
                    header: "Created",
                    sortable: true,
                    render: (row) => <span className="text-slate-500 dark:text-slate-400 text-xs font-mono">{new Date(row.created_at).toLocaleDateString()}</span>
                  },
                  {
                    key: "actions",
                    header: "Actions",
                    render: (row) => (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(row)}
                          className="h-8 w-8 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Edit Admin"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleStatus(row.id, row.is_active)}
                          className={`h-8 w-8 ${row.is_active ? 'text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-amber-500 dark:hover:bg-slate-800' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-slate-800'}`}
                          title={row.is_active ? "Deactivate Admin" : "Activate Admin"}
                        >
                          {row.is_active ? (
                            <UserX className="h-4 w-4" />
                          ) : (
                            <UserCheck className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteAdmin(row.id)}
                          className="h-8 w-8 text-slate-500 hover:text-destructive dark:text-slate-400 dark:hover:text-destructive hover:bg-destructive/10"
                          title="Delete Admin"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  }
                ]}
                renderItemCard={(row, isSelected, onToggleSelect) => (
                  <div
                    key={row.id}
                    onClick={onToggleSelect}
                    className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between h-full bg-card ${
                      isSelected
                        ? "border-indigo-500/50 shadow-md shadow-indigo-500/10 bg-indigo-500/[0.04] ring-1 ring-indigo-500/30 text-foreground"
                        : "border-border hover:border-muted-foreground/35 hover:bg-muted/10 text-foreground shadow-sm"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight">{row.name}</h4>
                        <Badge variant={row.is_active ? "default" : "secondary"} className={row.is_active ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40 text-[9px]" : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400 border border-slate-200 dark:border-slate-800 text-[9px]"}>
                          {row.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">{row.email}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                        {(() => {
                          const deptIds = (row.admin_departments && row.admin_departments.length > 0)
                            ? row.admin_departments.map((d: any) => d.department_id)
                            : (row.department_id ? [row.department_id] : []);
                          const names = deptIds.map((id: string) => departments.find(d => d.id === id)?.name).filter(Boolean);
                          if (names.length === 0) return <span>No dept assigned</span>;
                          return names.map((name: string, i: number) => (
                            <span key={i} className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40 px-1.5 py-0.5 rounded">{name}</span>
                          ));
                        })()}
                        <span>•</span>
                        <span>Created: {new Date(row.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect()}
                        onClick={(e) => e.stopPropagation()}
                        className="border-border bg-background data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                      />
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openEditDialog(row)}
                          className="h-7 px-2.5 rounded-lg text-[10px] font-medium transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleStatus(row.id, row.is_active)}
                          className={`h-7 px-2.5 rounded-lg text-[10px] font-medium transition-colors ${row.is_active ? 'bg-amber-100 text-amber-800 dark:bg-amber-955/20 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-955/40' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/60'}`}
                        >
                          {row.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => handleDeleteAdmin(row.id)}
                          className="h-7 px-2.5 rounded-lg text-[10px] font-medium transition-colors bg-destructive/20 hover:bg-destructive/30 text-destructive-foreground"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              />
            )}
            </CardContent>
          </div>

          {/* Edit Admin Dialog */}
          <Dialog open={!!editingAdmin} onOpenChange={() => setEditingAdmin(null)}>
            <DialogContent className={`rounded-2xl border backdrop-blur-2xl shadow-2xl ${
              isDark ? "bg-[#0a0e1e]/95 border-indigo-500/25 text-white" : "bg-white/95 border-indigo-200/80 text-slate-900"
            }`}>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">Edit Admin</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-name" className="text-xs font-semibold">Name</Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="rounded-xl h-10 text-xs"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-email" className="text-xs font-semibold">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="rounded-xl h-10 text-xs"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold">Departments <span className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>(select one or more)</span></Label>
                  <div className={`border rounded-xl p-3 max-h-44 overflow-y-auto space-y-1.5 ${
                    isDark ? "bg-white/[0.03] border-indigo-500/20" : "bg-slate-50 border-slate-200"
                  }`}>
                    {departments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No departments available</p>
                    ) : departments.map((dept) => {
                      const checked = formData.department_ids.includes(dept.id);
                      return (
                        <label key={dept.id} className={`flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-lg transition-colors text-xs ${
                          isDark ? "hover:bg-white/[0.06]" : "hover:bg-indigo-50/80"
                        }`}>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) => {
                              const ids = c
                                ? [...formData.department_ids, dept.id]
                                : formData.department_ids.filter(id => id !== dept.id);
                              setFormData({ ...formData, department_ids: ids, department_id: ids[0] || '' });
                            }}
                          />
                          <span className="text-xs font-medium">{dept.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  {formData.department_ids.length > 0 && (
                    <p className="text-[11px] text-indigo-400 font-medium">{formData.department_ids.length} department(s) selected</p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-password" className="text-xs font-semibold">New Password (leave blank to keep current)</Label>
                  <Input
                    id="edit-password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="rounded-xl h-10 text-xs"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" className="rounded-xl text-xs" onClick={() => setEditingAdmin(null)}>
                  Cancel
                </Button>
                <Button className="rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold" onClick={handleUpdateAdmin}>
                  Update Admin
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      </main>
    </div>
  );
};

export default AdminManagement;
