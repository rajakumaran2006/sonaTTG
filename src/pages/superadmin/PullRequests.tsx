import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar/Navbar";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { useDarkMode } from "@/context/DarkModeContext";
import { GitPullRequest, GitMerge, Clock, CheckCircle2, XCircle, ArrowRight } from "lucide-react";

const PullRequests = () => {
  const { isDark } = useDarkMode();
  const [prs, setPrs] = useState<any[]>([]);
  const [status, setStatus] = useState<'All'|'Pending'|'Approved'|'Rejected'>('Pending');
  const [deptNames, setDeptNames] = useState<Record<string, string>>({});
  const isLoggedIn = useMemo(() => localStorage.getItem("superAdmin") === "true", []);

  useEffect(() => {
    document.title = "Pull Requests - Super Admin";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Review timetable pull requests and approval status.");
    const link: HTMLLinkElement = document.querySelector('link[rel="canonical"]') || document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', window.location.origin + '/pull-requests');
    if (!link.parentNode) document.head.appendChild(link);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: depts } = await (supabase as any).from('departments').select('id,name');
      const dmap: Record<string, string> = {};
      (depts || []).forEach((d: any) => dmap[d.id] = d.name);
      setDeptNames(dmap);
    })();
  }, []);

  const fetchPullRequests = async () => {
    let q = (supabase as any).from('timetable_pull_requests').select('*').order('created_at', { ascending: false });
    if (status !== 'All') {
      // Convert status to lowercase for database query
      q = q.eq('status', status.toLowerCase());
    }
    const { data } = await q;
    setPrs(data || []);
  };

  useEffect(() => {
    fetchPullRequests();
  }, [status]);

  // Real-time updates for pull request changes
  useEffect(() => {
    const channel = supabase
      .channel('pull-requests-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'timetable_pull_requests' 
      }, async (payload) => {
        console.log('Pull request change detected:', payload);
        // Refresh the list when any PR changes
        await fetchPullRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [status]);

  const badgeVariant = (s: string): React.ComponentProps<typeof Badge>["variant"] => {
    switch (s) {
      case 'approved': return 'secondary';
      case 'rejected': return 'destructive';
      case 'merged': return 'default';
      default: return 'outline';
    }
  };

  return (
    <div className={`min-h-screen relative overflow-x-hidden transition-colors duration-300 ${
      isDark ? "bg-[#060814] text-white" : "bg-[#f8faff] text-slate-900"
    }`}>
      {/* Ambient background refraction orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {isDark ? (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-600/10 via-purple-600/08 to-transparent blur-3xl opacity-70" />
            <div className="absolute top-1/3 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-cyan-600/08 via-indigo-600/08 to-transparent blur-3xl opacity-60" />
            <div className="absolute -bottom-20 left-1/3 w-96 h-96 rounded-full bg-gradient-to-tr from-purple-600/08 via-indigo-600/06 to-transparent blur-3xl opacity-50" />
          </>
        ) : (
          <>
            <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-200/40 via-purple-200/30 to-transparent blur-3xl opacity-75" />
            <div className="absolute top-1/4 -right-20 w-80 h-80 rounded-full bg-gradient-to-bl from-purple-200/35 via-indigo-100/40 to-transparent blur-3xl opacity-65" />
            <div className="absolute -bottom-20 left-1/3 w-96 h-96 rounded-full bg-gradient-to-tr from-indigo-100/40 via-purple-100/30 to-transparent blur-3xl opacity-50" />
          </>
        )}
      </div>

      {isLoggedIn ? <Navbar /> : <AdminNavbar />}

      <main className={`md:pl-72 pt-16 ${isLoggedIn ? "md:pt-16" : "md:pt-0"} transition-all duration-300 relative z-10 min-h-screen`}>
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 w-full space-y-8">
          {/* Header Banner */}
          <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-5 p-6 rounded-2xl backdrop-blur-2xl border transition-all duration-300 ${
            isDark
              ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
              : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
          }`}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                  isDark
                    ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/25"
                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                }`}>
                  Change Governance
                </span>
                <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {prs.length} {prs.length === 1 ? 'request' : 'requests'}
                </span>
              </div>
              <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                isDark ? "text-white" : "bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 bg-clip-text text-transparent"
              }`}>
                Pull Requests
              </h1>
              <p className={`text-xs sm:text-sm mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Review and manage timetable change proposals and approval status.
              </p>
            </div>

            <div className={`flex items-center gap-1.5 p-1 rounded-xl border ${
              isDark ? "bg-[#0a0e1e]/80 border-indigo-500/20" : "bg-indigo-50/60 border-indigo-200/70"
            }`}>
              {['All', 'Pending', 'Approved', 'Rejected'].map((s) => (
                <button 
                  key={s} 
                  onClick={() => setStatus(s as any)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    status === s
                      ? isDark
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm shadow-indigo-500/30 border border-indigo-400/30'
                        : 'bg-indigo-600 text-white shadow-sm'
                      : isDark
                        ? 'text-slate-400 hover:text-white hover:bg-white/5'
                        : 'text-slate-600 hover:text-indigo-900 hover:bg-indigo-100/60'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {prs.map((pr) => (
              <div
                key={pr.id}
                className={`group relative rounded-2xl p-6 backdrop-blur-2xl border transition-all duration-300 flex flex-col justify-between overflow-hidden ${
                  isDark
                    ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)] hover:border-indigo-400/40 hover:shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_20px_-2px_rgba(99,102,241,0.25)]"
                    : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)] hover:border-indigo-300 hover:shadow-[0_8px_28px_rgba(99,102,241,0.12)]"
                }`}
              >
                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />

                <div>
                  <div className={`flex items-center justify-between pb-3 border-b ${
                    isDark ? "border-indigo-500/15" : "border-indigo-100"
                  }`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        pr.status === 'pending'
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                          : pr.status === 'approved' || pr.status === 'merged'
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                      }`}>
                        <GitPullRequest className="h-4 w-4" />
                      </div>
                      <h3 className={`font-bold text-sm truncate leading-snug ${isDark ? "text-white" : "text-slate-900"}`}>
                        {pr.title}
                      </h3>
                    </div>
                    <Badge
                      variant={badgeVariant(pr.status)}
                      className={`rounded-lg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border shrink-0 ${
                        pr.status === 'pending'
                          ? isDark ? "bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.2)]" : "bg-amber-50 text-amber-700 border-amber-200"
                          : pr.status === 'approved' || pr.status === 'merged'
                          ? isDark ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : isDark ? "bg-rose-500/15 text-rose-300 border-rose-500/30 shadow-[0_0_8px_rgba(244,63,94,0.2)]" : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}
                    >
                      {pr.status}
                    </Badge>
                  </div>

                  <div className={`text-xs font-semibold mt-3 ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>
                    {deptNames[pr.department_id] || pr.department_id} • Year {pr.year} • Section {pr.section}
                  </div>

                  <p className={`text-xs mt-2 line-clamp-2 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    {pr.description || 'No description provided.'}
                  </p>
                </div>

                <div className={`flex items-center justify-between pt-4 mt-4 border-t ${
                  isDark ? "border-indigo-500/15" : "border-indigo-100"
                }`}>
                  <div className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                    By <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>{pr.created_by}</span> • {new Date(pr.created_at).toLocaleDateString()}
                  </div>
                  <Button
                    asChild
                    size="sm"
                    className="h-8 px-3.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-sm shadow-indigo-500/25 border border-indigo-400/30"
                  >
                    <Link to={`/pull-requests/${pr.id}`} className="flex items-center gap-1.5">
                      <span>View Details</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}

            {prs.length === 0 && (
              <div className={`col-span-full text-center py-16 rounded-2xl border backdrop-blur-2xl ${
                isDark ? "bg-white/[0.02] border-indigo-500/20 text-slate-400" : "bg-indigo-50/30 border-indigo-200/60 text-slate-500"
              }`}>
                <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3 text-indigo-400">
                  <GitPullRequest className="h-6 w-6" />
                </div>
                <div className={`text-base font-bold mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>
                  No {status.toLowerCase()} pull requests
                </div>
                <p className="text-xs max-w-sm mx-auto">
                  {status === 'Pending' && "There are currently no pull requests waiting for review."}
                  {status === 'Approved' && "There are no approved pull requests."}
                  {status === 'Rejected' && "There are no rejected pull requests."}
                  {status === 'All' && "No timetable pull requests have been submitted."}
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default PullRequests;
