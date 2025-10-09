import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  department_id: string;
  is_active: boolean;
}

const AdminLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Admin Login - Timetable";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Login as Admin to manage your department's timetable.");
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Query admin_users table to find the user
      const { data: adminUsers, error: queryError } = await (supabase as any)
        .from('admin_users')
        .select('*')
        .eq('email', email)
        .eq('is_active', true);

      if (queryError) {
        console.error('Query error:', queryError);
        toast.error(`Login failed: ${queryError.message || queryError.details || 'Database error'}`);
        return;
      }

      if (!adminUsers || adminUsers.length === 0) {
        console.log('No admin users found for email:', email);
        toast.error("Invalid credentials or account not found");
        return;
      }

      console.log('Found admin user:', adminUsers[0]);

      const admin = adminUsers[0];

      // Verify password using the database function
      if (admin.password_hash) {
        const { data: isValid, error: verifyError } = await (supabase as any)
          .rpc('verify_password', {
            password: password,
            hashed_password: admin.password_hash
          });

        if (verifyError) {
          console.error('Password verification error:', verifyError);
          toast.error('Password verification failed');
          return;
        }

        if (isValid) {
          console.log('Password verified, logging in admin:', admin.email);
          // Store admin info in localStorage
          const adminData = {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            department_id: admin.department_id,
            is_active: admin.is_active
          };

          localStorage.setItem("adminUser", JSON.stringify(adminData));
          console.log('Admin data stored in localStorage:', adminData);

          toast.success("Login successful");
          navigate("/admin", { replace: true });
        } else {
          console.log('Password verification failed for admin:', admin.email);
          toast.error("Invalid password");
        }
      } else {
        console.log('No password hash found for admin:', admin.email);
        toast.error("Account setup incomplete");
      }
    } catch (error) {
      console.error('Login error:', error);
      if (error.message?.includes('relation "admin_users" does not exist') ||
          error.message?.includes('admin_users')) {
        toast.error("Database setup incomplete. Please contact your Super Admin to set up the system.");
      } else {
        toast.error("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <section className="container py-16">
        <div className="max-w-md mx-auto">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Admin Login</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={loading}>
                  {loading ? "Signing in..." : "Login"}
                </Button>
              </form>
              <div className="mt-4 text-sm text-muted-foreground">
                <p>Don't have an account? Contact your Super Admin to get access.</p>
                <p className="mt-1">Use the email and password provided by your Super Admin.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default AdminLogin;
