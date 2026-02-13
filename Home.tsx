import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Building2, School, ShieldCheck, Clock, CalendarDays, ArrowRight, Zap, Brain, Sparkles, Timer } from "lucide-react";
import { Navbar } from "@/components/Navbar";

const RoleSelect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Welcome | SONA TTG";
  }, []);



  return (
    <main className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-sky-950 to-slate-900 selection:bg-sky-200/60">
      
      {/* AI-Themed Animated Background */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Primary blue glow orbs */}
        <div className="absolute top-[-15%] right-[-10%] w-[620px] h-[620px] rounded-full bg-gradient-to-br from-sky-500/30 via-cyan-400/20 to-transparent blur-3xl animate-pulse" />
        <div className="absolute bottom-[-20%] left-[-15%] w-[540px] h-[540px] rounded-full bg-gradient-to-tr from-blue-500/25 via-sky-500/20 to-transparent blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] rounded-full bg-gradient-to-r from-sky-400/25 via-cyan-300/20 to-blue-500/15 blur-2xl animate-pulse" style={{ animationDelay: '0.7s' }} />
        
        {/* Floating orbit elements */}
        <div className="absolute top-20 right-20 w-32 h-32 border border-sky-400/25 rounded-full animate-spin" style={{ animationDuration: '22s' }} />
        <div className="absolute bottom-32 left-32 w-24 h-24 border border-cyan-400/25 rounded-full animate-spin" style={{ animationDuration: '16s', animationDirection: 'reverse' }} />
        <div className="absolute top-1/3 left-1/4 w-16 h-16 border border-sky-300/40 rounded-xl animate-[float_6s_ease-in-out_infinite]" />
        <div className="absolute bottom-1/3 right-1/4 w-12 h-12 border border-sky-400/40 rounded-full animate-ping" style={{ animationDelay: '1.5s' }} />
        
        {/* Neural Network Lines */}
        <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="line-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <path d="M100,200 Q300,100 500,300 T900,200" stroke="url(#line-gradient)" strokeWidth="2" fill="none" className="animate-[pulse_4s_ease-in-out_infinite]" />
          <path d="M200,400 Q400,300 600,500 T1000,400" stroke="url(#line-gradient)" strokeWidth="1.5" fill="none" className="animate-[pulse_5s_ease-in-out_infinite]" style={{ animationDelay: '1s' }} />
        </svg>
      </div>

      <Navbar />

      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pt-20 pb-10">
        
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto space-y-8 mb-20 animate-in fade-in slide-in-from-bottom-8 duration-1000 fill-mode-forwards ease-out">
          
          <div className="inline-flex items-center gap-3 px-6 py-2.5 rounded-full bg-sky-500/10 backdrop-blur-md border border-sky-300/40 shadow-[0_0_45px_rgba(56,189,248,0.35)] mb-8">
            <div className="relative">
              <Brain className="w-4 h-4 text-blue-300 animate-pulse" />
              <div className="absolute inset-0 bg-blue-400/20 rounded-full animate-ping" />
            </div>
            <span className="text-sm font-semibold text-sky-50 tracking-wide">AI-Powered Scheduling v3.0</span>
            <Sparkles className="w-4 h-4 text-sky-200 animate-bounce" />
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-sky-50 leading-[1.05]">
            Simplify Your <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-blue-400 bg-[length:220%_auto] animate-gradient">
              Academic Time.
            </span>
          </h1>

          <p className="text-lg md:text-2xl text-sky-100/90 font-normal max-w-3xl mx-auto leading-relaxed tracking-tight">
            The automated timetable generator designed for perfection. <br className="hidden md:block"/>
            Conflict-free scheduling, reimagined.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-8 text-sm font-medium text-sky-200 pt-4">
            <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-sky-500/10 backdrop-blur-sm border border-sky-300/40 shadow-[0_0_30px_rgba(56,189,248,0.35)]">
              <div className="p-1.5 rounded-full bg-sky-500/30"><Zap className="w-4 h-4 text-sky-200" /></div>
              <span>Real-time Generation</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-slate-900/60 backdrop-blur-sm border border-sky-400/30">
              <div className="p-1.5 rounded-full bg-sky-600/20"><Timer className="w-4 h-4 text-sky-300" /></div>
              <span>Smart Conflict Resolution</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-slate-900/60 backdrop-blur-sm border border-sky-400/30">
              <div className="p-1.5 rounded-full bg-sky-400/20"><Brain className="w-4 h-4 text-sky-200" /></div>
              <span>Smart Learning</span>
            </div>
          </div>
        </div>

        {/* Single Smart Login Card */}
        <div className="w-full max-w-lg mx-auto px-4">
          <div
            className="group relative flex flex-col p-[2px] rounded-3xl transition-all duration-700 hover:-translate-y-3 hover:scale-[1.04] animate-in fade-in slide-in-from-bottom-8 duration-1000 cursor-pointer"
            onClick={() => navigate("/login")}
          >
            {/* Outer neon border */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-500 blur-2xl opacity-40 group-hover:opacity-80 transition-opacity duration-700" />
            
            <div className="relative h-full overflow-hidden rounded-[22px] bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-900/90 backdrop-blur-2xl border border-sky-400/40 shadow-[0_0_60px_rgba(56,189,248,0.4)] group-hover:border-sky-300/80 transition-all duration-700">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/20 via-cyan-500/15 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-4 right-8 w-2 h-2 bg-sky-400/40 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                <div className="absolute top-12 right-16 w-1.5 h-1.5 bg-cyan-300/40 rounded-full animate-bounce" style={{ animationDelay: '0.5s' }} />
                <div className="absolute top-8 right-12 w-1 h-1 bg-blue-400/40 rounded-full animate-bounce" style={{ animationDelay: '1s' }} />
              </div>
              
              <div className="relative p-10 md:p-12 flex flex-col">
                <div className="flex items-start justify-between mb-8">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-500 via-cyan-400 to-blue-500 text-white flex items-center justify-center transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-700 shadow-[0_0_40px_rgba(56,189,248,0.65)]">
                      <Clock className="w-10 h-10 animate-pulse drop-shadow-[0_0_12px_rgba(59,130,246,0.9)]" />
                    </div>
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-400/40 to-cyan-300/30 animate-ping" style={{ animationDuration: '3s' }} />
                  </div>
                  <div className="w-12 h-12 rounded-full bg-sky-500/15 backdrop-blur-sm flex items-center justify-center text-sky-100 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500 shadow-[0_0_24px_rgba(56,189,248,0.6)]">
                    <ArrowRight className="w-6 h-6" />
                  </div>
                </div>
                
                <h3 className="text-3xl font-bold text-sky-50 mb-3 tracking-tight group-hover:text-sky-200 transition-colors duration-500">
                  Enter Smart Portal
                </h3>
                
                <p className="text-sky-100/90 leading-relaxed mb-7 text-base md:text-lg">
                  One secure entry for Super Admins, Department Admins and Faculty. The system routes you to the right dashboard automatically.
                </p>
                
                <div className="pt-6 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-base md:text-lg font-semibold text-sky-50 flex items-center gap-2 group-hover:gap-3 transition-all duration-300">
                      <Brain className="w-5 h-5 text-sky-300" />
                      Unified Smart Login
                    </span>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="text-xs md:text-sm text-emerald-200">Role-aware access</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Footer */}
        <footer className="mt-24 border-t border-sky-800/70 pt-10 pb-8 w-full max-w-6xl flex flex-col md:flex-row items-center justify-between text-sky-200/80 text-sm font-medium px-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 via-cyan-400 to-blue-500 flex items-center justify-center shadow-[0_0_22px_rgba(56,189,248,0.6)]">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <p>&copy; {new Date().getFullYear()} AI Time Portal by SONA TTG. All rights reserved.</p>
          </div>
          <div className="flex gap-8 mt-6 md:mt-0">
            <a href="#" className="hover:text-sky-100 transition-colors duration-300 flex items-center gap-1">
              <span>Privacy</span>
            </a>
            <a href="#" className="hover:text-sky-100 transition-colors duration-300 flex items-center gap-1">
              <span>Terms</span>
            </a>
            <a href="#" className="hover:text-sky-100 transition-colors duration-300 flex items-center gap-1">
              <span>AI Support</span>
              <Brain className="w-3 h-3" />
            </a>
          </div>
        </footer>

      </section>
    </main>
  );
};

export default RoleSelect;
