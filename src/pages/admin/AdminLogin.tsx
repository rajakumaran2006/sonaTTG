import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Mail, Lock, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 bg-grid-black/[0.02] bg-grid-16"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl"></div>

      <section className="container relative py-16 flex items-center justify-center min-h-screen">
        <div className="w-full max-w-md">
          {/* Back Button */}
          <Button
            variant="ghost"
            className="mb-6 group"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Home
          </Button>

          {/* Login Card */}
          <Card className="rounded-3xl border-0 shadow-2xl backdrop-blur-sm bg-card/50 overflow-hidden">
            {/* Gradient Header */}
            <div className="h-2 bg-gradient-to-r from-primary via-primary/80 to-accent"></div>
            
            <CardHeader className="text-center pt-10 pb-6">
              {/* Icon */}
              <div className="mx-auto mb-6 w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
                <Building2 className="w-10 h-10 text-white" />
              </div>
              
              {/* Title */}
              <CardTitle className="text-3xl font-bold mb-2">Admin Login</CardTitle>
              <Badge variant="secondary" className="mx-auto text-xs px-3 py-1">
                Department Management
              </Badge>
            </CardHeader>

            <CardContent className="px-8 pb-10">
              <form onSubmit={handleLogin} className="space-y-6">
                {/* Email Input */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-11 h-12 rounded-xl border-2 focus:border-primary transition-all"
                      placeholder="admin@example.com"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pl-11 h-12 rounded-xl border-2 focus:border-primary transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <Button 
                  type="submit" 
                  disabled={loading}
                  className="w-full h-12 text-base font-semibold rounded-xl bg-gradient-to-r from-primary to-primary/90 hover:shadow-lg hover:scale-[1.02] transition-all duration-300"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Signing in...
                    </span>
                  ) : (
                    "Login"
                  )}
                </Button>
              </form>

              {/* Help Text */}
              <div className="mt-8 pt-6 border-t border-border/50">
                <div className="space-y-2 text-center">
                  <p className="text-sm text-muted-foreground">
                    Don't have an account?
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Contact your <span className="font-semibold text-foreground">Super Admin</span> to get access.
                  </p>
                </div>
              </div>
            </CardContent>

            {/* Decorative Bottom Element */}
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-full -translate-y-16 translate-x-16"></div>
          </Card>

          {/* Footer Text */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Secure login powered by Supabase
          </p>
        </div>
      </section>
    </main>
  );
};

export default AdminLogin;
