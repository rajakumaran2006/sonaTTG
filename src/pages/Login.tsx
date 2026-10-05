import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/navbar/Navbar";
import { LogIn, ShieldCheck, Building2, School, Eye, EyeOff, Sun, Moon } from "lucide-react";
import { useDarkMode } from "@/context/DarkModeContext";

const Login = () => {
  const navigate = useNavigate();
  const { isDark, toggleDarkMode } = useDarkMode();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    try {
      // 1. Check for Super Admin (Hardcoded)
      const isSuperAdmin = 
        (trimmedEmail === "super admin" || trimmedEmail === "superadmin") && 
        (trimmedPassword.toLowerCase() === "super admin" || trimmedPassword.toLowerCase() === "superadmin");

      if (isSuperAdmin) {
        localStorage.setItem("superAdmin", "true");
        toast.success("Super Admin login successful");
        navigate("/super-admin", { replace: true });
        return;
      }

      // 2. Check for Admin in database
      const adminSearchEmail = trimmedEmail === "admin@gmail.com" ? "admin" : trimmedEmail;
      const { data: adminUsers, error: adminError } = await (supabase as any)
        .from('admin_users')
        .select('*, admin_departments(department_id)')
        .or(`email.eq.${trimmedEmail},name.eq.${trimmedEmail},email.eq.${adminSearchEmail},name.eq.${adminSearchEmail}`)
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
              password: trimmedPassword,
              hashed_password: admin.password_hash
            });

          if (!verifyError && isValid) {
            const deptIds = (admin.admin_departments && admin.admin_departments.length > 0)
              ? admin.admin_departments.map((d: any) => d.department_id)
              : (admin.department_id ? [admin.department_id] : []);

            const adminData = {
              id: admin.id,
              name: admin.name,
              email: admin.email,
              department_id: deptIds[0] || admin.department_id || "",
              department_ids: deptIds,
              is_active: admin.is_active
            };
            localStorage.setItem("adminUser", JSON.stringify(adminData));
            toast.success("Admin login successful");
            navigate("/admin", { replace: true });
            return;
          }
        }
      }

      // 3. Check for Faculty (email is both username and password)
      const { data: facultyMembers, error: facultyError } = await (supabase as any)
        .from('faculty_members')
        .select('*')
        .or(`email.eq.${trimmedEmail},name.eq.${trimmedEmail}`);

      if (facultyError) {
        console.error('Faculty query error:', facultyError);
        toast.error(`Database error during faculty lookup: ${facultyError.message}`);
      }

      if (facultyMembers && facultyMembers.length > 0) {
        const faculty = facultyMembers[0];
        
        // Verify password: password must match the faculty's email
        const facultyEmail = (faculty.email || '').trim().toLowerCase();
        if (trimmedPassword === facultyEmail) {
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
    <main className="min-h-screen relative overflow-hidden bg-slate-50 dark:bg-[#080b14] text-slate-900 dark:text-slate-100 selection:bg-indigo-500/30 transition-colors duration-300">
      {/* Floating Animated Backdrop Spheres */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-indigo-500/5 dark:bg-indigo-500/10 blur-3xl animate-float" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-purple-500/5 dark:bg-purple-500/10 blur-3xl animate-pulse duration-4000" />
        <div className="absolute top-[40%] left-[20%] w-[300px] h-[300px] rounded-full bg-indigo-600/5 dark:bg-indigo-600/5 blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
      </div>

      <Navbar />

      {/* Top Bar with Brand & Theme Toggle */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-3">
        <button
          onClick={toggleDarkMode}
          className="p-2.5 rounded-full border border-indigo-500/20 bg-white/70 dark:bg-[#0c1020]/80 backdrop-blur-xl text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-500/40 shadow-sm transition-all"
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-indigo-600" />}
        </button>
      </div>

      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pt-16 pb-10">
        <div className="w-full max-w-md animate-scale-up duration-500">
          <div className="rounded-[2.5rem] border border-slate-200/80 dark:border-indigo-500/20 bg-white/80 dark:bg-[#0f1527]/90 backdrop-blur-xl shadow-[0_20px_50px_rgba(15,23,42,0.06)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-300 hover:border-slate-300/50 dark:hover:border-indigo-500/35">
            <CardHeader className="text-center pt-10 pb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg shadow-indigo-500/25 flex items-center justify-center mx-auto mb-6 transform hover:rotate-6 transition-transform cursor-pointer">
                <LogIn className="w-8 h-8 text-white font-bold" />
              </div>
              <CardTitle className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">
                Welcome Back
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400 mt-2">
                Access your OptiTime dashboard securely
              </CardDescription>
            </CardHeader>
            <CardContent className="px-8 pb-12">
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold text-slate-700 dark:text-slate-200 ml-1">
                    Email or Username
                  </Label>
                  <Input 
                    id="email" 
                    type="text" 
                    placeholder="name@college.edu" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-2xl border-slate-200 dark:border-indigo-500/20 bg-slate-50/50 dark:bg-[#141c33] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500 transition-all"
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <Label htmlFor="password" title="Required for Admins" className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Password
                    </Label>
                  </div>
                  <div className="relative">
                    <Input 
                      id="password" 
                      type={showPassword ? "text" : "password"} 
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 pr-10 rounded-2xl border-slate-200 dark:border-indigo-500/20 bg-slate-50/50 dark:bg-[#141c33] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500 transition-all w-full"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 ml-1">
                    * Password required for all roles. Faculty: use your email as password.
                  </p>
                </div>
                <Button 
                  type="submit" 
                  disabled={loading}
                  className="w-full h-12 rounded-2xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98]"
                >
                  {loading ? "Authenticating..." : "Sign In"}
                </Button>
              </form>

              <div className="mt-10 grid grid-cols-3 gap-3 pt-8 border-t border-slate-100 dark:border-indigo-500/15">
                <div 
                  className="flex flex-col items-center gap-2 group cursor-pointer transition-all duration-300 hover:scale-105"
                  onClick={() => {
                    setEmail("super admin");
                    setPassword("super admin");
                    toast.info("Super Admin credentials filled: super admin / super admin");
                  }}
                >
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#141c33] text-slate-500 dark:text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-sm border border-slate-100 dark:border-indigo-500/20">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-indigo-300 uppercase tracking-wider text-center transition-colors">Super Admin</span>
                </div>
                <div 
                  className="flex flex-col items-center gap-2 group cursor-pointer transition-all duration-300 hover:scale-105"
                  onClick={() => {
                    setEmail("admin");
                    setPassword("admin");
                    toast.info("Admin credentials filled: admin / admin");
                  }}
                >
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#141c33] text-slate-500 dark:text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-sm border border-slate-100 dark:border-indigo-500/20">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 uppercase tracking-wider text-center transition-colors">Admin</span>
                </div>
                <div 
                  className="flex flex-col items-center gap-2 group cursor-pointer transition-all duration-300 hover:scale-105"
                  onClick={() => toast.info("Faculty: enter your email as both username and password")}
                >
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#141c33] text-slate-500 dark:text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-sm border border-slate-100 dark:border-indigo-500/20">
                    <School className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 uppercase tracking-wider text-center transition-colors">Faculty</span>
                </div>
              </div>
            </CardContent>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Login;
