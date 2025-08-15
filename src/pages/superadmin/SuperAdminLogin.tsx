import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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
    <main className="min-h-screen bg-background">
      <section className="container py-16">
        <div className="max-w-md mx-auto">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Super Admin Login</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" disabled={loading}>{loading ? "Signing in..." : "Login"}</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default SuperAdminLogin;
