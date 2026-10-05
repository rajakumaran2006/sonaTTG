import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar/Navbar";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { reviewPullRequest, getPullRequestById, approveAndApplyPullRequest } from "@/lib/supabaseService";
import { useDarkMode } from "@/context/DarkModeContext";
import { GitPullRequest, CheckCircle2, XCircle, ArrowLeft, MessageSquare, Clock } from "lucide-react";

const colHeaders = ['P1','P2','BR','P3','P4','LU','P5','BR','P6','P7'];
const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat'];

function cellChanged(a: any, b: any) { return (a || '') !== (b || ''); }

const GridView = ({ grid, compareTo, departmentId, year }: { grid: any[][]; compareTo?: any[][]; departmentId?: string; year?: string }) => {
  const { isDark } = useDarkMode();
  const [subjectTypes, setSubjectTypes] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchSubjectTypes = async () => {
      if (!departmentId || !year) return;
      
      try {
        const { data: subjects } = await (supabase as any)
          .from('subjects')
          .select('name, type')
          .eq('department_id', departmentId)
          .eq('year', year);

        const typeMap: Record<string, string> = {};
        (subjects || []).forEach((subject: any) => {
          typeMap[subject.name] = subject.type;
        });
        setSubjectTypes(typeMap);
      } catch (error) {
        console.error('Error fetching subject types:', error);
      }
    };

    fetchSubjectTypes();
  }, [departmentId, year]);

  const formatCellContent = (cell: string | null): string => {
    if (!cell || !cell.trim()) return 'Free';
    if (cell === 'BREAK' || cell === 'LUNCH') return cell;
    
    const subjectName = cell.trim();
    const subjectType = subjectTypes[subjectName];
    
    if (subjectType === 'open elective') {
      return 'OE';
    }
    
    return subjectName;
  };

  return (
    <div className={`overflow-auto rounded-xl border ${
      isDark ? "border-indigo-500/20 bg-white/[0.02]" : "border-indigo-100 bg-white"
    }`}>
      <table className="text-xs w-full border-collapse">
        <thead>
          <tr className={`border-b ${isDark ? "border-indigo-500/15 bg-white/[0.04]" : "border-indigo-100 bg-indigo-50/50"}`}>
            <th className="text-left p-3 font-bold text-foreground">Day</th>
            {colHeaders.map((c) => (
              <th key={c} className="text-center p-3 font-bold min-w-[76px] text-foreground">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(Array.isArray(grid) ? grid : []).map((row, i) => {
            const r = Array.isArray(row) ? row : [];
            const otherRow = (compareTo && Array.isArray(compareTo[i])) ? compareTo[i] : [];
            const thisDisplay = [r[0] || '', r[1] || '', 'BREAK', r[2] || '', r[3] || '', 'LUNCH', r[4] || '', 'BREAK', r[5] || '', r[6] || ''];
            const otherDisplay = [otherRow[0] || '', otherRow[1] || '', 'BREAK', otherRow[2] || '', otherRow[3] || '', 'LUNCH', otherRow[4] || '', 'BREAK', otherRow[5] || '', otherRow[6] || ''];
            return (
              <tr key={i} className={`border-t ${isDark ? "border-indigo-500/10 hover:bg-white/[0.02]" : "border-indigo-100/70 hover:bg-indigo-50/30"}`}>
                <td className={`p-3 font-bold ${isDark ? "bg-white/[0.03] text-indigo-300" : "bg-indigo-50/40 text-indigo-900"}`}>{dayNames[i] || `Day ${i + 1}`}</td>
                {thisDisplay.map((cell, j) => {
                  const changed = compareTo ? cellChanged(cell, otherDisplay[j]) : false;
                  const isBreak = cell === 'BREAK' || cell === 'LUNCH';
                  
                  return (
                    <td key={j} className="p-1.5">
                      <div className={`
                        h-11 rounded-lg px-2 flex items-center justify-center text-center font-semibold text-xs transition-all
                        ${isBreak 
                          ? isDark ? 'bg-amber-500/10 text-amber-300 border border-amber-500/25' : 'bg-amber-50 text-amber-800 border border-amber-200' 
                          : cell && cell.trim() 
                            ? isDark ? 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/30' : 'bg-indigo-50 text-indigo-900 border border-indigo-200' 
                            : isDark ? 'bg-white/[0.02] text-slate-500 border border-white/5' : 'bg-slate-50 text-slate-400 border border-slate-200/60'
                        }
                        ${changed ? 'ring-2 ring-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : ''}
                      `}>
                        {formatCellContent(cell)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const PullRequestDetail = () => {
  const { id } = useParams();
  const { isDark } = useDarkMode();
  const { toast } = useToast();
  const [pr, setPr] = useState<any | null>(null);
  const [deptName, setDeptName] = useState<string>("");
  const [comments, setComments] = useState<any[]>([]);
  const [comment, setComment] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const isLoggedIn = useMemo(() => localStorage.getItem("superAdmin") === "true", []);

  useEffect(() => {
    document.title = "Review Pull Request - Super Admin";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Side-by-side timetable comparison and review actions.");
    const link: HTMLLinkElement = document.querySelector('link[rel="canonical"]') || document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', window.location.origin + `/pull-requests/${id || ''}`);
    if (!link.parentNode) document.head.appendChild(link);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const prData = await getPullRequestById(id);
      setPr(prData);
      if (prData?.department_id) {
        const { data: d } = await (supabase as any).from('departments').select('name').eq('id', prData.department_id).maybeSingle();
        setDeptName(d?.name || prData.department_id);
      }
      const { data: c } = await (supabase as any).from('pr_comments').select('*').eq('pr_id', id).order('created_at');
      setComments(c || []);
    })();
  }, [id]);

  const addComment = async () => {
    if (!comment.trim() || !id) return;
    const author = localStorage.getItem('superAdminEmail') || 'reviewer';
    const { error } = await (supabase as any).from('pr_comments').insert({ pr_id: id, author, content: comment.trim() });
    if (error) { 
      toast({ title: 'Failed to add comment' }); 
      return; 
    }
    setComment("");
    const { data: c } = await (supabase as any).from('pr_comments').select('*').eq('pr_id', id).order('created_at');
    setComments(c || []);
    toast({ title: 'Comment added' });
  };

  const onApprove = async () => {
    if (!id) return;
    try {
      await approveAndApplyPullRequest(id, localStorage.getItem('superAdminEmail') || undefined);
      toast({ title: 'Pull request approved and applied successfully!' });
      const prData = await getPullRequestById(id); 
      setPr(prData);
    } catch (e: any) {
      toast({ 
        title: 'Approval failed', 
        description: e?.message || 'Please try again.',
        variant: 'destructive'
      });
    }
  };

  const onReject = async () => {
    if (!id) return;
    try {
      await reviewPullRequest(id, 'reject', reviewNote.trim() || undefined, localStorage.getItem('superAdminEmail') || undefined);
      toast({ title: 'Pull request rejected' });
      const prData = await getPullRequestById(id); 
      setPr(prData);
      setReviewNote("");
    } catch (e: any) {
      toast({ 
        title: 'Rejection failed', 
        description: e?.message || 'Please try again.',
        variant: 'destructive'
      });
    }
  };
  if (!pr) return (
    <div className={`min-h-screen relative flex items-center justify-center transition-colors duration-300 ${
      isDark ? "bg-[#060814] text-white" : "bg-[#f8faff] text-slate-900"
    }`}>
      {isLoggedIn ? <Navbar /> : <AdminNavbar />}
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <p className={`text-xs font-semibold ${isDark ? "text-indigo-400" : "text-indigo-600"}`}>Loading proposal...</p>
      </div>
    </div>
  );

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
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-8">
          {/* Header */}
          <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-5 p-6 rounded-2xl backdrop-blur-2xl border transition-all duration-300 ${
            isDark
              ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
              : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06)]"
          }`}>
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full border mb-1.5 text-[10px] font-bold uppercase tracking-widest bg-indigo-500/10 text-indigo-400 border-indigo-500/25">
                <span>Timetable Proposal Review</span>
              </div>
              <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                isDark ? "text-white" : "bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 bg-clip-text text-transparent"
              }`}>
                {pr.title}
              </h1>
              <p className={`text-xs sm:text-sm mt-1 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                {deptName} • Year {pr.year} • Section {pr.section} • Created by <span className="font-semibold">{pr.created_by}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge 
                variant={
                  pr.status === 'pending' ? 'outline' : 
                  pr.status === 'approved' ? 'secondary' : 
                  pr.status === 'rejected' ? 'destructive' : 
                  'default'
                }
                className={`text-xs px-3.5 py-1 rounded-xl font-bold uppercase tracking-wider border ${
                  pr.status === 'pending'
                    ? isDark ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "bg-amber-50 text-amber-700 border-amber-200"
                    : pr.status === 'approved' || pr.status === 'merged'
                    ? isDark ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : isDark ? "bg-rose-500/15 text-rose-300 border-rose-500/30" : "bg-rose-50 text-rose-700 border-rose-200"
                }`}
              >
                {pr.status}
              </Badge>
            </div>
          </div>

          {/* Timetable Display */}
          <div className={`rounded-2xl p-6 backdrop-blur-2xl border transition-all duration-300 ${
            isDark
              ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)] text-white"
              : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)] text-slate-900"
          }`}>
            <h2 className="text-base font-bold mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-400" />
              Proposed Timetable
            </h2>
            <GridView grid={pr.proposed_grid_data || []} departmentId={pr.department_id} year={pr.year} />
          </div>

          {/* Actions and Comments */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Review Actions */}
            <div className={`rounded-2xl p-6 backdrop-blur-2xl border transition-all duration-300 ${
              isDark
                ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)] text-white"
                : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)] text-slate-900"
            }`}>
              <h3 className="text-base font-bold mb-4">Review Decision</h3>
              <div className="space-y-4">
                <div>
                  <label className={`text-xs font-semibold uppercase tracking-wider block mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Review Notes (optional)
                  </label>
                  <Textarea 
                    placeholder="Add your review notes here..."
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    className={`min-h-[100px] rounded-xl text-xs border ${
                      isDark ? "bg-white/[0.04] border-indigo-500/20 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                    }`}
                  />
                </div>
                
                {pr.status === 'pending' && (
                  <div className="flex gap-3">
                    <Button 
                      variant="destructive" 
                      onClick={onReject}
                      className="flex-1 rounded-xl shadow-sm text-xs font-bold h-10"
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      Reject
                    </Button>
                    <Button 
                      onClick={onApprove}
                      className="flex-1 rounded-xl shadow-sm shadow-indigo-500/25 text-xs font-bold h-10 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border border-emerald-400/30"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      Approve & Apply
                    </Button>
                  </div>
                )}
                
                {pr.status !== 'pending' && (
                  <div className={`text-center py-4 text-xs font-semibold rounded-xl border ${
                    isDark ? "bg-white/[0.02] border-indigo-500/15 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"
                  }`}>
                    This pull request has been {pr.status}.
                  </div>
                )}
              </div>
            </div>

            {/* Comments */}
            <div className={`rounded-2xl p-6 backdrop-blur-2xl border transition-all duration-300 ${
              isDark
                ? "bg-[#090d1c]/80 border-indigo-500/25 shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_12px_-2px_rgba(99,102,241,0.12)] text-white"
                : "bg-white/80 border-indigo-200/70 shadow-[0_4px_20px_rgba(99,102,241,0.06),0_0_10px_-2px_rgba(99,102,241,0.05)] text-slate-900"
            }`}>
              <h3 className="text-base font-bold mb-4 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-indigo-400" />
                Discussion & Comments
              </h3>
              <div className="space-y-4">
                {/* Existing Comments */}
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {comments.length === 0 ? (
                    <p className={`text-xs py-4 text-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                      No comments yet.
                    </p>
                  ) : (
                    comments.map((c) => (
                      <div key={c.id} className={`border rounded-xl p-3.5 ${
                        isDark ? "border-indigo-500/15 bg-white/[0.02]" : "border-indigo-100 bg-indigo-50/30"
                      }`}>
                        <div className={`text-[11px] mb-1 font-semibold ${isDark ? "text-indigo-400" : "text-indigo-700"}`}>
                          {c.author} • {new Date(c.created_at).toLocaleString()}
                        </div>
                        <div className={`text-xs ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                          {c.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Comment */}
                <div className={`space-y-2 pt-3 border-t ${isDark ? "border-indigo-500/15" : "border-indigo-100"}`}>
                  <label className={`text-xs font-semibold uppercase tracking-wider block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Add Comment
                  </label>
                  <Textarea
                    placeholder="Write a comment..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className={`min-h-[60px] rounded-xl text-xs border ${
                      isDark ? "bg-white/[0.04] border-indigo-500/20 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                    }`}
                  />
                  <Button 
                    onClick={addComment}
                    disabled={!comment.trim()}
                    className="w-full rounded-xl text-xs font-bold h-9 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-sm shadow-indigo-500/25 border border-indigo-400/30"
                  >
                    Post Comment
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default PullRequestDetail;
