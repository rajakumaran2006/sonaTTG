import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { useDarkMode } from "@/context/DarkModeContext";
import { Compass, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const { isDark } = useDarkMode();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className={`min-h-screen relative overflow-hidden flex items-center justify-center p-6 transition-colors duration-300 ${
      isDark ? "bg-[#060814] text-white" : "bg-[#f8faff] text-slate-900"
    }`}>
      {/* Ambient background light orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {isDark ? (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-600/15 via-purple-600/10 to-transparent blur-3xl opacity-70" />
            <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-gradient-to-tr from-purple-600/12 via-indigo-600/08 to-transparent blur-3xl opacity-60" />
          </>
        ) : (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-200/50 via-purple-200/35 to-transparent blur-3xl opacity-75" />
            <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-gradient-to-tr from-indigo-100/50 via-purple-100/40 to-transparent blur-3xl opacity-65" />
          </>
        )}
      </div>

      <div className={`relative z-10 max-w-md w-full p-8 md:p-10 rounded-3xl backdrop-blur-2xl border text-center transition-all duration-300 ${
        isDark ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_30px_rgba(0,0,0,0.5)]" : "bg-white/80 border-indigo-200/70 shadow-[0_4px_30px_rgba(99,102,241,0.08)]"
      }`}>
        <div className="w-16 h-16 rounded-2xl mx-auto mb-6 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-500">
          <Compass className="w-8 h-8 animate-spin duration-3000" />
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent mb-2">
          404
        </h1>
        <h2 className="text-xl font-bold mb-2">Page Not Found</h2>
        <p className="text-sm text-muted-foreground mb-8">
          The requested page <code className="px-2 py-0.5 rounded bg-muted text-xs font-mono">{location.pathname}</code> does not exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold shadow-md shadow-indigo-500/25">
            <Link to="/">
              <Home className="w-4 h-4 mr-2" />
              Return to Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
