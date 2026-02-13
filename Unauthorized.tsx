import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

const Unauthorized = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-md rounded-3xl border-white/50 shadow-apple-xl bg-white/80 backdrop-blur-xl">
        <CardHeader className="space-y-4 pb-6">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-center text-slate-900">
            Access Denied
          </CardTitle>
          <p className="text-sm text-slate-500 text-center">
            You don't have permission to access this resource.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={handleLogout}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-olive-600 to-teal-600 hover:from-olive-700 hover:to-teal-700 text-white font-semibold"
          >
            Back to Login
          </Button>
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className="w-full h-11 rounded-xl"
          >
            Go Back
          </Button>
        </CardContent>
      </Card>
    </main>
  );
};

export default Unauthorized;
