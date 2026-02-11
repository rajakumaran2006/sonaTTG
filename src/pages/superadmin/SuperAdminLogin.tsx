import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, User, Lock, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SuperAdminLogin = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Super Admin Login - Timetable";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Login as Super Admin to manage departments and academic data.");
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (username === "admin" && password === "admin") {
        localStorage.setItem("superAdmin", "true");
        toast.success("Login successful");
        navigate("/super-admin", { replace: true });
      } else {
        toast.error("Invalid credentials");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 bg-grid-black/[0.02] bg-grid-16"></div>
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl"></div>

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
            <div className="h-2 bg-gradient-to-r from-primary via-accent to-primary"></div>
            
            <CardHeader className="text-center pt-10 pb-6">
              {/* Icon */}
              <div className="mx-auto mb-6 w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
                <ShieldCheck className="w-10 h-10 text-white" />
              </div>
              
              {/* Title */}
              <CardTitle className="text-3xl font-bold mb-2">Super Admin Login</CardTitle>
              <Badge variant="secondary" className="mx-auto text-xs px-3 py-1">
                Master Control
              </Badge>
            </CardHeader>

            <CardContent className="px-8 pb-10">
              <form onSubmit={handleLogin} className="space-y-6">
                {/* Username Input */}
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-sm font-medium">
                    Username
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      className="pl-11 h-12 rounded-xl border-2 focus:border-primary transition-all"
                      placeholder="Enter username"
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
                    Full system access with administrative privileges
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Default: admin / admin
                  </p>
                </div>
              </div>
            </CardContent>

            {/* Decorative Bottom Element */}
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-br from-accent/10 to-transparent rounded-full -translate-y-16 -translate-x-16"></div>
          </Card>

          {/* Footer Text */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Protected area - Authorized personnel only
          </p>
        </div>
      </section>
    </main>
  );
};

export default SuperAdminLogin;
