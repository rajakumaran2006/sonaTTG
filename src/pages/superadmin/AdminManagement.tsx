import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/navbar/Navbar";
import { Plus, Edit, Trash2, UserCheck, UserX } from "lucide-react";

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
      navigate("/super-admin-login", { replace: true });
      return;
    }

    document.title = "Admin Management - Super Admin";
    loadData();

    // Listen for storage changes (in case user logs in/out in another tab)
    const handleStorageChange = () => {
      if (!checkAuth()) {
        navigate("/super-admin-login", { replace: true });
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
        navigate("/super-admin-login", { replace: true });
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
          .select('*')
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
    if (!formData.name || !formData.email || !formData.department_id || !formData.password) {
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
        department_id: formData.department_id,
        password_hash: hashResult ? '[HASHED]' : '[NO HASH]'
      });

      // First check if department exists
      console.log('Checking if department exists:', formData.department_id);
      const { data: deptCheck, error: deptError } = await (supabase as any)
        .from('departments')
        .select('id, name')
        .eq('id', formData.department_id)
        .single();

      if (deptError || !deptCheck) {
        console.error('Department not found:', formData.department_id, deptError);
        toast.error(`Selected department does not exist: ${formData.department_id}`);
        return;
      }

      console.log('Department verified:', deptCheck);

      const { error } = await (supabase as any)
        .from('admin_users')
        .insert({
          name: formData.name,
          email: formData.email,
          department_id: formData.department_id,
          password_hash: hashResult,
          is_active: true
        });

      if (error) {
        console.error('Supabase error creating admin:', error);
        console.error('Error details:', error.details, error.message, error.hint);
        toast.error(`Failed to create admin: ${error.message || error.details || 'Unknown error'}`);
        return;
      }

      console.log('Admin created successfully');

      // Wait a moment before reloading to ensure database commit
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('Admin created successfully, reloading data...');
      toast.success('Admin created successfully');
      setOpenCreate(false);
      resetForm();

      console.log('About to reload data after admin creation...');
      await loadData(); // Ensure data is reloaded
      console.log('Data reloaded after admin creation');

      // Verify the admin exists in the loaded data
      console.log('Checking if admin exists in current admins array...');
      console.log('Current admins count:', admins.length);
      console.log('Looking for email:', formData.email);

      const createdAdmin = admins.find(a => a.email === formData.email);
      if (createdAdmin) {
        console.log('Admin creation verified in loaded data:', createdAdmin);
        toast.success(`Admin ${createdAdmin.name} created and verified`);
      } else {
        console.warn('Admin creation may have failed - admin not found in loaded data');
        console.log('Current admins in state:', admins);
        console.log('Available admin emails:', admins.map(a => a.email));
        toast.error('Admin created but not found in list. Please refresh the page.');
      }
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
        department_id: formData.department_id,
      };

      if (formData.password) {
        updateData.password_hash = formData.password;
      }

      const { error } = await (supabase as any)
        .from('admin_users')
        .update(updateData)
        .eq('id', editingAdmin.id);

      if (error) {
        toast.error('Failed to update admin');
        return;
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
        .update({ is_active: false })
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
      password: ""
    });
  };

  const openEditDialog = (admin: AdminUser) => {
    setEditingAdmin(admin);
    setFormData({
      name: admin.name,
      email: admin.email,
      department_id: admin.department_id,
      password: ""
    });
  };

  if (!isLoggedIn) return null;

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <section className="container py-10 md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 md:pt-16">
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
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="department">Department</Label>
                  <Select
                    value={formData.department_id}
                    onValueChange={(value) => setFormData({...formData, department_id: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={departments.length === 0 ? "No departments available" : "Select department"} />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
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
              <div className="space-y-4">
                {admins.map((admin) => (
                  <div key={admin.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold">{admin.name}</h3>
                        <Badge variant={admin.is_active ? "default" : "secondary"}>
                          {admin.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">{admin.email}</p>
                      <p className="text-sm text-muted-foreground">
                        Department: {(() => {
                          const dept = departments.find(d => d.id === admin.department_id);
                          return dept?.name || 'Unknown';
                        })()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created: {new Date(admin.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(admin)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleStatus(admin.id, admin.is_active)}
                      >
                        {admin.is_active ? (
                          <UserX className="h-4 w-4" />
                        ) : (
                          <UserCheck className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteAdmin(admin.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-department">Department</Label>
                <Select
                  value={formData.department_id}
                  onValueChange={(value) => setFormData({...formData, department_id: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-password">New Password (leave blank to keep current)</Label>
                <Input
                  id="edit-password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
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
    </main>
  );
};

export default AdminManagement;
