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
        toast.error("Login failed. Please try again.");
        return;
      }

      if (!adminUsers || adminUsers.length === 0) {
        toast.error("Invalid credentials");
        return;
      }

      const admin = adminUsers[0];

      // For now, we'll use a simple password check since we don't have proper hashing set up
      // In production, you should use proper password hashing and verification
      if (password === "admin123") { // Temporary default password
        // Store admin info in localStorage
        localStorage.setItem("adminUser", JSON.stringify({
          id: admin.id,
          name: admin.name,
          email: admin.email,
          department_id: admin.department_id
        }));

        toast.success("Login successful");
        navigate("/admin", { replace: true });
      } else {
        toast.error("Invalid credentials");
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error("Login failed. Please try again.");
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
                <p>Don't have an account? Contact your Super Admin.</p>
                <p className="mt-1">Default password: admin123 (change after first login)</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default AdminLogin;
