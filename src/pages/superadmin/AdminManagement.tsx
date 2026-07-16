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
import { Plus, Edit, Trash2, UserCheck, UserX } from "lucide-react";
import { CustomTable } from "@/components/ui/CustomTable";
import { Checkbox } from "@/components/ui/checkbox";

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
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 transition-all duration-300">
        <section className="container py-10 md:pt-24">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/admin-login')}>
              Admin Console
            </Button>
            <Dialog open={openCreate} onOpenChange={setOpenCreate}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Admin
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Admin</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Departments <span className="text-muted-foreground text-xs">(select one or more)</span></Label>
                    <div className="border rounded-lg p-3 max-h-44 overflow-y-auto space-y-2">
                      {departments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No departments available</p>
                      ) : departments.map((dept) => {
                        const checked = formData.department_ids.includes(dept.id);
                        return (
                          <label key={dept.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 px-2 py-1 rounded-md transition-colors">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => {
                                const ids = c
                                  ? [...formData.department_ids, dept.id]
                                  : formData.department_ids.filter(id => id !== dept.id);
                                setFormData({ ...formData, department_ids: ids, department_id: ids[0] || '' });
                              }}
                            />
                            <span className="text-sm">{dept.name}</span>
                          </label>
                        );
                      })}
                    </div>
                    {formData.department_ids.length > 0 && (
                      <p className="text-xs text-muted-foreground">{formData.department_ids.length} department(s) selected</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenCreate(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateAdmin}>Create Admin</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>Department Administrators</CardTitle>
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
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">{name}</span>
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
                      <Badge variant={row.is_active ? "default" : "secondary"} className={row.is_active ? "bg-green-100 text-green-800 dark:bg-emerald-950/40 dark:text-emerald-450 border border-green-200 dark:border-emerald-900/30" : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400 border border-slate-200 dark:border-slate-800"}>
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
                          className={`h-8 w-8 ${row.is_active ? 'text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-amber-500 dark:hover:bg-slate-800' : 'text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-emerald-400 dark:hover:bg-slate-800'}`}
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
                        ? "border-emerald-500 shadow-md bg-muted/30 text-foreground"
                        : "border-border hover:border-muted-foreground/35 hover:bg-muted/10 text-foreground shadow-sm"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight">{row.name}</h4>
                        <Badge variant={row.is_active ? "default" : "secondary"} className={row.is_active ? "bg-green-100 text-green-800 dark:bg-emerald-950/40 dark:text-emerald-455 border border-green-200 dark:border-emerald-900/30 text-[9px]" : "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400 border border-slate-200 dark:border-slate-800 text-[9px]"}>
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
                            <span key={i} className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 px-1.5 py-0.5 rounded">{name}</span>
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
                        className="border-border bg-background data-[state=checked]:bg-emerald-500"
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
                          className={`h-7 px-2.5 rounded-lg text-[10px] font-medium transition-colors ${row.is_active ? 'bg-amber-100 text-amber-800 dark:bg-amber-955/20 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-955/40' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-955/20 dark:text-emerald-455 hover:bg-emerald-200 dark:hover:bg-emerald-955/40'}`}
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
        </Card>

        {/* Edit Admin Dialog */}
        <Dialog open={!!editingAdmin} onOpenChange={() => setEditingAdmin(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Admin</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Departments <span className="text-muted-foreground text-xs">(select one or more)</span></Label>
                <div className="border rounded-lg p-3 max-h-44 overflow-y-auto space-y-2">
                  {departments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No departments available</p>
                  ) : departments.map((dept) => {
                    const checked = formData.department_ids.includes(dept.id);
                    return (
                      <label key={dept.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/40 px-2 py-1 rounded-md transition-colors">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => {
                            const ids = c
                              ? [...formData.department_ids, dept.id]
                              : formData.department_ids.filter(id => id !== dept.id);
                            setFormData({ ...formData, department_ids: ids, department_id: ids[0] || '' });
                          }}
                        />
                        <span className="text-sm">{dept.name}</span>
                      </label>
                    );
                  })}
                </div>
                {formData.department_ids.length > 0 && (
                  <p className="text-xs text-muted-foreground">{formData.department_ids.length} department(s) selected</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-password">New Password (leave blank to keep current)</Label>
                <Input
                  id="edit-password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingAdmin(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateAdmin}>Update Admin</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </section>
      </div>
    </main>
  );
};

export default AdminManagement;
