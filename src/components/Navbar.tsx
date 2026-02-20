import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 transition-all duration-300 bg-white/50 backdrop-blur-xl border-b border-white/20">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-gradient-to-br from-olive-600 to-olive-400 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-olive-500/20">
          S
        </div>
        <span className="text-lg font-semibold tracking-tight text-slate-900">
          SONA TTG
        </span>
      </div>
      
      <div className="flex items-center gap-4">
        <Link to="/">
            <Button variant="ghost" className="text-sm font-medium text-slate-600 hover:text-olive-700 hover:bg-olive-50/50">
            Sign In
            </Button>
        </Link>
      </div>
    </nav>
  );
}
