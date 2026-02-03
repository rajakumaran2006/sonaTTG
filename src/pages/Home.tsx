import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, School, ShieldCheck, Clock, CalendarDays, Sparkles } from "lucide-react";

const RoleSelect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Welcome | SONA TTG";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Next-Gen Timetable Management System for SONA.");
  }, []);

  const roles = [
    {
      title: "Admin",
      description: "Orchestrate departments and generate schedules.",
      action: "Access Portal",
      route: "/admin-login",
      icon: <Building2 className="w-6 h-6" />,
      color: "bg-olive-100 text-olive-700",
      hover: "hover:border-olive-400 hover:shadow-olive-200/50",
      delay: "0ms"
    },
    {
      title: "Faculty",
      description: "View your personal timeline and subjects.",
      action: "View Schedule",
      route: "/faculty",
      icon: <School className="w-6 h-6" />,
      color: "bg-teal-50 text-teal-700", // Using a complementary tone or just olive variant
      hover: "hover:border-teal-400 hover:shadow-teal-200/50",
      delay: "100ms"
    },
    {
      title: "Super Admin",
      description: "System-wide configuration and governance.",
      action: "System Control",
      route: "/super-admin-login",
      icon: <ShieldCheck className="w-6 h-6" />,
      color: "bg-slate-100 text-slate-700",
      hover: "hover:border-slate-400 hover:shadow-slate-200/50",
      delay: "200ms"
    }
  ];

  return (
    <main className="min-h-screen relative overflow-hidden bg-slate-50 font-sans selection:bg-olive-200">

      {/* Abstract Background Shapes */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-olive-200/40 blur-3xl animate-float" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[30%] h-[30%] rounded-full bg-olive-300/30 blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      <div className="absolute top-[20%] right-[10%] w-[15%] h-[15%] rounded-full bg-slate-200/50 blur-2xl animate-float" style={{ animationDelay: '4s' }} />

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>

      <section className="container relative z-10 flex flex-col items-center justify-center min-h-screen py-10">

        {/* Header Content */}
        <div className="text-center max-w-3xl mx-auto space-y-6 mb-16 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-olive-200 shadow-sm backdrop-blur-md mb-4">
            <Sparkles className="w-4 h-4 text-olive-600" />
            <span className="text-xs font-semibold text-olive-800 tracking-wide uppercase">Intelligent Scheduling v2.0</span>
          </div>

          <h1 className="text-6xl md:text-7xl font-bold font-poppins tracking-tight text-slate-900 leading-[1.1]">
            Simplify Your <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-olive-600 to-olive-400">
              Academic Time.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-600 font-light max-w-2xl mx-auto leading-relaxed">
            The automated timetable generator designed for perfection. Experience conflict-free scheduling with a touch of elegance.
          </p>

          <div className="flex items-center justify-center gap-4 text-sm font-medium text-slate-500 pt-4">
            <div className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-olive-500" /> Real-time Gen</div>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <div className="flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-olive-500" /> Smart Conflict Resolution</div>
          </div>
        </div>

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl px-4">
          {roles.map((role, index) => (
            <Card
              key={role.title}
              className={`
                group relative border-0 bg-white/60 backdrop-blur-xl shadow-xl shadow-slate-200/40 
                hover:-translate-y-2 transition-all duration-500 cursor-pointer overflow-hidden
                ${role.hover}
                animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards
              `}
              style={{ animationDelay: role.delay }}
              onClick={() => navigate(role.route)}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              <CardHeader className="relative pb-2">
                <div className={`w-12 h-12 rounded-xl ${role.color} flex items-center justify-center mb-4 transition-transform group-hover:scale-110 duration-300`}>
                  {role.icon}
                </div>
                <CardTitle className="text-2xl font-bold font-montserrat text-slate-800">
                  {role.title}
                </CardTitle>
              </CardHeader>

              <CardContent className="relative">
                <p className="text-slate-500 mb-8 leading-relaxed">
                  {role.description}
                </p>

                <div className="flex items-center justify-between mt-auto">
                  <span className="text-sm font-semibold text-olive-600 group-hover:underline decoration-2 decoration-olive-600/30 underline-offset-4 transition-all">
                    {role.action}
                  </span>
                  <div className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center group-hover:bg-olive-600 group-hover:border-olive-600 group-hover:text-white transition-all duration-300">
                    <span className="text-lg leading-none mb-0.5">→</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer Text */}
        <footer className="absolute bottom-6 text-center text-slate-400 text-sm font-medium">
          Powered by SONA TTG &copy; {new Date().getFullYear()}
        </footer>

      </section>
    </main>
  );
};

export default RoleSelect;
