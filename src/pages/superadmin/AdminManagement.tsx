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

  const isLoggedIn = localStorage.getItem("superAdmin") === "true";

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/super-admin-login", { replace: true });
      return;
    }

    document.title = "Admin Management - Super Admin";
    loadData();
  }, [isLoggedIn]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [adminsRes, deptsRes] = await Promise.all([
        (supabase as any)
          .from('admin_users')
          .select(`
            *,
            department:departments(name)
          `)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('departments')
          .select('*')
          .order('name')
      ]);

      setAdmins(adminsRes.data || []);
      setDepartments(deptsRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load admin data');
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
      const { error } = await (supabase as any)
        .from('admin_users')
        .insert({
          name: formData.name,
          email: formData.email,
          department_id: formData.department_id,
          password_hash: formData.password, // In production, hash this properly
          is_active: true
        });

      if (error) {
        toast.error('Failed to create admin');
        return;
      }

      toast.success('Admin created successfully');
      setOpenCreate(false);
      resetForm();
      loadData();
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
      <section className="container py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Management</h1>
            <p className="text-sm text-muted-foreground">Manage department administrators</p>
          </div>
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
        </header>

        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>Department Administrators</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
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
                        Department: {admin.department?.name || 'Unknown'}
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
