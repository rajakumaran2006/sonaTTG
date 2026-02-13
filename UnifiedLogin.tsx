import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Mail, LogIn } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "super_admin";
  department_id: string | null;
  password_hash: string;
}

const UnifiedLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: users, error: queryError } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .eq("is_active", true);

      if (queryError) {
        toast.error(`Database error: ${queryError.message}`);
        return;
      }

      if (!users || users.length === 0) {
        toast.error("Invalid credentials or account not found");
        return;
      }

      const user = users[0] as User;

      if (!user.password_hash) {
        toast.error("Account setup incomplete. Contact administrator.");
        return;
      }

      const { data: isValid, error: verifyError } = await supabase.rpc(
        "verify_password",
        {
          password,
          hashed_password: user.password_hash,
        }
      );

      if (verifyError) {
        toast.error("Password verification failed");
        return;
      }

      if (!isValid) {
        toast.error("Invalid password");
        return;
      }

      const sessionData = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department_id: user.department_id,
      };

      localStorage.setItem("user", JSON.stringify(sessionData));
      toast.success(`Welcome back, ${user.name}!`);

      if (user.role === "super_admin") {
        navigate("/super-admin", { replace: true });
      } else if (user.role === "admin") {
        navigate("/admin", { replace: true });
      } else {
        toast.error("Unauthorized role");
        localStorage.removeItem("user");
      }
    } catch (error) {
      const err = error as Error;
      if (err.message?.includes('relation "users" does not exist')) {
        toast.error("Database not configured. Contact system administrator.");
      } else if (err.message?.includes("verify_password")) {
        toast.error("Password verification system unavailable.");
      } else {
        toast.error("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-slate-50">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full bg-gradient-to-b from-olive-100/40 to-transparent blur-3xl opacity-70" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-t from-teal-100/40 to-transparent blur-3xl opacity-70" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]" />
      </div>

      {/* Hero Section */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4">
        <div className="text-center max-w-4xl mx-auto space-y-6 mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/50 backdrop-blur-md border border-white/60 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-olive-500 animate-pulse" />
            <span className="text-xs font-medium text-slate-600 tracking-wide uppercase">
              Intelligent Scheduling v2.0
            </span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-slate-900 leading-tight">
            Welcome to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-olive-600 via-teal-600 to-olive-600">
              SONA TTG
            </span>
          </h1>

          <p className="text-lg text-slate-500 max-w-xl mx-auto">
            Automated timetable generation with intelligent conflict resolution
          </p>
        </div>

        {/* Login Card */}
        <Card className="w-full max-w-md rounded-3xl border-white/50 shadow-apple-xl bg-white/80 backdrop-blur-xl">
          <CardHeader className="space-y-1 pb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-olive-600 to-teal-600 flex items-center justify-center mx-auto mb-4">
              <LogIn className="w-6 h-6 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-center text-slate-900">
              Sign In
            </CardTitle>
            <p className="text-sm text-slate-500 text-center">
              Enter your credentials to access your portal
            </p>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700 font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-slate-200 focus:border-olive-500 focus:ring-olive-500"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-slate-200 focus:border-olive-500 focus:ring-olive-500"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-olive-600 to-teal-600 hover:from-olive-700 hover:to-teal-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100">
              <p className="text-xs text-slate-500 text-center leading-relaxed">
                Don't have an account? Contact your administrator for access.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="mt-12 text-xs text-slate-400">
          © {new Date().getFullYear()} SONA TTG. All rights reserved.
        </footer>
      </section>
    </main>
  );
};

export default UnifiedLogin;
