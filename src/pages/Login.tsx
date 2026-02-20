import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { LogIn, ShieldCheck, Building2, School } from "lucide-react";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Login | SONA TTG";
    
    // Check if user is already logged in
    const adminUser = localStorage.getItem("adminUser");
    const facultyUser = localStorage.getItem("facultyUser");
    const isSuperAdmin = localStorage.getItem("superAdmin") === "true";

    if (isSuperAdmin) {
      navigate("/super-admin", { replace: true });
    } else if (adminUser) {
      navigate("/admin", { replace: true });
    } else if (facultyUser) {
      navigate("/faculty", { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Check for Super Admin (Hardcoded)
      if (email === "admin" && password === "admin") {
        localStorage.setItem("superAdmin", "true");
        toast.success("Super Admin login successful");
        navigate("/super-admin", { replace: true });
        return;
      }

      // 2. Check for Admin in database
      const { data: adminUsers, error: adminError } = await (supabase as any)
        .from('admin_users')
        .select('*')
        .or(`email.eq.${email},name.eq.${email}`)
        .eq('is_active', true);

      if (adminError) {
        console.error('Admin query error:', adminError);
        toast.error(`Database error during admin lookup: ${adminError.message}`);
      }

      if (adminUsers && adminUsers.length > 0) {
        const admin = adminUsers[0];
        
        // Verify password using the database function
        if (admin.password_hash) {
          const { data: isValid, error: verifyError } = await (supabase as any)
            .rpc('verify_password', {
              password: password,
              hashed_password: admin.password_hash
            });

          if (!verifyError && isValid) {
            const adminData = {
              id: admin.id,
              name: admin.name,
              email: admin.email,
              department_id: admin.department_id,
              is_active: admin.is_active
            };
            localStorage.setItem("adminUser", JSON.stringify(adminData));
            toast.success("Admin login successful");
            navigate("/admin", { replace: true });
            return;
          }
        }
      }

      // 3. Check for Faculty (Passwordless flow)
      // Since it's a single page, we check if the search term matches email or name in faculty_members
      const { data: facultyMembers, error: facultyError } = await (supabase as any)
        .from('faculty_members')
        .select('*')
        .or(`email.eq.${email},name.eq.${email}`);

      if (facultyError) {
        console.error('Faculty query error:', facultyError);
        toast.error(`Database error during faculty lookup: ${facultyError.message}`);
      }

      if (facultyMembers && facultyMembers.length > 0) {
        // For faculty, we currently just allow login by email
        // We can add a password check if faculty has passwords in the future
        const faculty = facultyMembers[0];
        localStorage.setItem("facultyUser", JSON.stringify({
          id: faculty.id,
          name: faculty.name,
          email: faculty.email,
          designation: faculty.designation,
          department_id: faculty.department_id
        }));
        toast.success(`Welcome back, ${faculty.name}`);
        navigate("/faculty", { replace: true });
        return;
      }

      // 4. If nothing matched
      toast.error("Invalid credentials or account not found");

    } catch (error: any) {
      console.error('Login error:', error);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-slate-50 selection:bg-olive-200/50">
      {/* Background elements similar to Home page */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full bg-gradient-to-b from-olive-100/40 to-transparent blur-3xl opacity-70" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-t from-teal-100/40 to-transparent blur-3xl opacity-70" />
      </div>

      <Navbar />

      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pt-20 pb-10">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
          <Card className="border-white/50 shadow-apple-xl bg-white/80 backdrop-blur-xl rounded-[2.5rem] overflow-hidden">
            <CardHeader className="text-center pt-10 pb-6">
              <div className="w-16 h-16 bg-olive-600 rounded-2xl shadow-lg flex items-center justify-center mx-auto mb-6 transform hover:rotate-6 transition-transform">
                <LogIn className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-3xl font-bold tracking-tight text-slate-900">Welcome Back</CardTitle>
              <CardDescription className="text-slate-500 mt-2">
                Enter your credentials to access your dashboard
              </CardDescription>
            </CardHeader>
            <CardContent className="px-10 pb-12">
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold text-slate-700 ml-1">Email or Username</Label>
                  <Input 
                    id="email" 
                    type="text" 
                    placeholder="name@college.edu" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-2xl border-slate-200 focus:ring-olive-500 focus:border-olive-500 transition-all bg-white/50"
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <Label htmlFor="password" title="Required for Admins" className="text-sm font-semibold text-slate-700">Password</Label>
                  </div>
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 rounded-2xl border-slate-200 focus:ring-olive-500 focus:border-olive-500 transition-all bg-white/50"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 ml-1">
                    * Password is required for Admin and Super Admin roles.
                  </p>
                </div>
                <Button 
                  type="submit" 
                  disabled={loading}
                  className="w-full h-12 rounded-2xl bg-olive-600 hover:bg-olive-700 text-white font-bold shadow-lg shadow-olive-200 transition-all active:scale-[0.98]"
                >
                  {loading ? "Authenticating..." : "Sign In"}
                </Button>
              </form>

              <div className="mt-10 grid grid-cols-3 gap-4 pt-8 border-t border-slate-100">
                <div 
                  className="flex flex-col items-center gap-2 group cursor-pointer transition-all duration-300 hover:scale-105"
                  onClick={() => {
                    setEmail("admin");
                    setPassword("admin");
                    toast.info("Super Admin credentials filled");
                  }}
                >
                  <div className="p-3 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all duration-500 shadow-sm">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-900 uppercase tracking-widest transition-colors">Super Admin</span>
                </div>
                <div 
                  className="flex flex-col items-center gap-2 group cursor-pointer transition-all duration-300 hover:scale-105"
                  onClick={() => toast.info("Please enter your Admin credentials")}
                >
                  <div className="p-3 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-olive-600 group-hover:text-white transition-all duration-500 shadow-sm">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-olive-600 uppercase tracking-widest transition-colors">Admin</span>
                </div>
                <div 
                  className="flex flex-col items-center gap-2 group cursor-pointer transition-all duration-300 hover:scale-105"
                  onClick={() => toast.info("Faculty login requires only your email/name")}
                >
                  <div className="p-3 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-teal-600 group-hover:text-white transition-all duration-500 shadow-sm">
                    <School className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-teal-600 uppercase tracking-widest transition-colors">Faculty</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default Login;
