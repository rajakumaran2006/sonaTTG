import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Building2, School, ShieldCheck, Clock, CalendarDays, ArrowRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";

const RoleSelect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Welcome | SONA TTG";
  }, []);

  const roles = [
    {
      title: "Admin",
      description: "Manage departments, schedules, and configurations seamlessly.",
      action: "Access Portal",
      route: "/admin-login",
      icon: <Building2 className="w-5 h-5" />,
      color: "bg-olive-600 text-white", // Deep olive for primary
      gradient: "from-olive-50 to-white",
      delay: "100ms"
    },
    {
      title: "Faculty",
      description: "View your personal timeline and subjects at a glance.",
      action: "View Schedule",
      route: "/faculty",
      icon: <School className="w-5 h-5" />,
      color: "bg-teal-600 text-white", // Teal for faculty
      gradient: "from-teal-50 to-white",
      delay: "200ms"
    },
    {
      title: "Super Admin",
      description: "Complete system governance and advanced configuration.",
      action: "System Control",
      route: "/super-admin-login",
      icon: <ShieldCheck className="w-5 h-5" />,
      color: "bg-slate-800 text-white", // Dark slate for super admin
      gradient: "from-slate-50 to-white",
      delay: "300ms"
    }
  ];

  return (
    <main className="min-h-screen relative overflow-hidden bg-slate-50 selection:bg-olive-200/50">
      
      {/* Immersive Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full bg-gradient-to-b from-olive-100/40 to-transparent blur-3xl animate-float opacity-70" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-t from-teal-100/40 to-transparent blur-3xl animate-float opacity-70" style={{ animationDelay: '4s' }} />
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]"></div>
      </div>

      <Navbar />

      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pt-20 pb-10">
        
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto space-y-8 mb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000 fill-mode-forwards ease-out">
          
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/50 backdrop-blur-md border border-white/60 shadow-sm mb-6">
            <span className="flex h-2 w-2 rounded-full bg-olive-500 animate-pulse"></span>
            <span className="text-xs font-medium text-slate-600 tracking-wide uppercase">Intelligent Scheduling v2.0</span>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-slate-900 leading-[1.05]">
            Simplify Your <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-olive-600 via-teal-600 to-olive-600 bg-[length:200%_auto] animate-gradient">
              Academic Time.
            </span>
          </h1>

          <p className="text-lg md:text-2xl text-slate-500 font-normal max-w-2xl mx-auto leading-relaxed tracking-tight">
            The automated timetable generator designed for perfection. <br className="hidden md:block"/>
            Conflict-free scheduling, reimagined.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-8 text-sm font-medium text-slate-400 pt-2">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-full bg-olive-100/50"><Clock className="w-3.5 h-3.5 text-olive-600" /></div>
              <span>Real-time Generation</span>
            </div>
            <div className="flex items-center gap-2">
               <div className="p-1 rounded-full bg-olive-100/50"><CalendarDays className="w-3.5 h-3.5 text-olive-600" /></div>
              <span>Smart Conflict Resolution</span>
            </div>
          </div>
        </div>

        {/* Role Cards - Bento Grid Style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl px-4 lg:px-8">
          {roles.map((role, index) => (
            <div
              key={role.title}
              className={`
                group relative flex flex-col p-1 rounded-3xl transition-all duration-500 hover:-translate-y-1
                animate-in fade-in slide-in-from-bottom-8 fill-mode-backwards
              `}
              style={{ animationDelay: role.delay }}
              onClick={() => navigate(role.route)}
            >
              <div className={`
                relative h-full overflow-hidden rounded-[22px] bg-gradient-to-br ${role.gradient}
                border border-white/50 shadow-apple-md hover:shadow-apple-xl transition-all duration-500 cursor-pointer
              `}>
                
                <div className="absolute inset-0 bg-white/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div className="relative p-8 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-6">
                    <div className={`w-12 h-12 rounded-2xl ${role.color} shadow-lg flex items-center justify-center transform group-hover:scale-110 transition-transform duration-500`}>
                      {role.icon}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/50 flex items-center justify-center text-slate-400 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                  
                  <h3 className="text-xl font-bold text-slate-900 mb-2 tracking-tight group-hover:text-olive-700 transition-colors">
                    {role.title}
                  </h3>
                  
                  <p className="text-slate-500 text-sm leading-relaxed mb-6 line-clamp-2">
                    {role.description}
                  </p>
                  
                  <div className="mt-auto pt-4 border-t border-slate-100/50">
                    <span className="text-sm font-semibold text-slate-900 flex items-center gap-1 group-hover:gap-2 transition-all">
                      {role.action}
                      <ArrowRight className="w-3.5 h-3.5 text-olive-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-20 border-t border-slate-200/60 pt-8 pb-8 w-full max-w-6xl flex flex-col md:flex-row items-center justify-between text-slate-400 text-sm font-medium px-8">
          <p>&copy; {new Date().getFullYear()} SONA TTG. All rights reserved.</p>
          <div className="flex gap-6 mt-4 md:mt-0">
            <a href="#" className="hover:text-olive-600 transition-colors">Privacy</a>
            <a href="#" className="hover:text-olive-600 transition-colors">Terms</a>
            <a href="#" className="hover:text-olive-600 transition-colors">Support</a>
          </div>
        </footer>

      </section>
    </main>
  );
};

export default RoleSelect;
