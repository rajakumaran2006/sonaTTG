import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  department_id: string;
  is_active: boolean;
}

const SmartLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    document.title = "Smart Login - Timetable";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Unified login gateway for Super Admin and Department Admins.");
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Priority check for Super Admin
      if (email === "admin" && password === "admin") {
        localStorage.setItem("superAdmin", "true");
        toast.success("Super Admin login successful");
        navigate("/super-admin", { replace: true });
        return;
      }

      // Secondary check for Dept Admin
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
        toast.error("Invalid credentials");
        return;
      }

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
          // Store admin info in localStorage
          const adminData = {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            department_id: admin.department_id,
            is_active: admin.is_active
          };

          localStorage.setItem("adminUser", JSON.stringify(adminData));
          toast.success("Login successful");
          navigate("/admin", { replace: true });
        } else {
          toast.error("Invalid credentials");
        }
      } else {
        toast.error("Invalid credentials");
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
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 relative overflow-hidden">
      {/* Mesh Gradient Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-300/30 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-200/20 rounded-full blur-3xl" />
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-4 left-4 z-10"
        onClick={() => navigate("/")}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Home
      </Button>
      <section className="container py-16 flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md backdrop-blur-md bg-white/80 shadow-xl rounded-2xl border-0">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Smart Login</CardTitle>
            <p className="text-muted-foreground">Access your admin dashboard</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email / Username</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Login"
                )}
              </Button>
            </form>
            <div className="mt-4 text-sm text-muted-foreground text-center">
              <p>Enter your credentials to access the system.</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

export default SmartLogin;
