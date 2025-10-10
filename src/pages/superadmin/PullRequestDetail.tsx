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

const colHeaders = ['P1','P2','BR','P3','P4','LU','P5','BR','P6','P7'];
const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat'];

function cellChanged(a: any, b: any) { return (a || '') !== (b || ''); }


const GridView = ({ grid, compareTo, departmentId, year }: { grid: any[][]; compareTo?: any[][]; departmentId?: string; year?: string }) => {
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

  // Function to format cell content based on subject type
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
    <div className="overflow-auto border rounded-lg">
      <table className="text-sm w-full border-collapse">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-semibold">Day</th>
            {colHeaders.map((c) => (
              <th key={c} className="text-center p-3 font-semibold min-w-[80px]">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, i) => (
            <tr key={i} className="border-t hover:bg-muted/20">
              <td className="p-3 font-medium bg-muted/30">{dayNames[i]}</td>
              {[row[0], row[1], 'BREAK', row[2], row[3], 'LUNCH', row[4], 'BREAK', row[5], row[6]].map((cell, j) => {
                const otherRow = compareTo?.[i] || [];
                const otherDisplay = [otherRow[0], otherRow[1], 'BREAK', otherRow[2], otherRow[3], 'LUNCH', otherRow[4], 'BREAK', otherRow[5], otherRow[6]];
                const changed = compareTo ? cellChanged(cell, otherDisplay[j]) : false;
                const isBreak = cell === 'BREAK' || cell === 'LUNCH';
                
                return (
                  <td key={j} className="p-2">
                    <div className={`
                      h-12 rounded-md px-3 flex items-center justify-center text-center font-medium
                      ${isBreak 
                        ? 'bg-orange-100 text-orange-800 border border-orange-200' 
                        : cell && cell.trim() 
                          ? 'bg-blue-50 text-blue-900 border border-blue-200' 
                          : 'bg-gray-50 text-gray-500 border border-gray-200'
                      }
                      ${changed ? 'ring-2 ring-primary/50' : ''}
                    `}>
                      {formatCellContent(cell)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const PullRequestDetail = () => {
  const { id } = useParams();
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
    <main className="min-h-screen bg-background">
      {isLoggedIn ? <Navbar /> : <AdminNavbar />}
      <section className="container py-10">Loading…</section>
    </main>
  );

  return (
    <main className="min-h-screen bg-background">
      {isLoggedIn ? <Navbar /> : <AdminNavbar />}
      <section className="container py-10 md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 md:pt-16">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Pull Request Details</h1>
          <div className="text-sm text-muted-foreground">ID: {id}</div>
        </header>
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">{pr.title}</h1>
              <p className="text-muted-foreground mt-1">
                {deptName} • Year {pr.year} • Section {pr.section}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Created by {pr.created_by} • {new Date(pr.created_at).toLocaleString()}
              </p>
            </div>
            <Badge 
              variant={
                pr.status === 'pending' ? 'outline' : 
                pr.status === 'approved' ? 'secondary' : 
                pr.status === 'rejected' ? 'destructive' : 
                'default'
              }
              className="text-sm px-3 py-1"
            >
              {pr.status.toUpperCase()}
            </Badge>
          </div>
        </header>

        {/* Timetable Display */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-xl">Proposed Timetable</CardTitle>
          </CardHeader>
          <CardContent>
            <GridView grid={pr.proposed_grid_data || []} departmentId={pr.department_id} year={pr.year} />
          </CardContent>
        </Card>

        {/* Actions and Comments */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Review Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Review Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Review Notes (optional)</label>
                  <Textarea 
                    placeholder="Add your review notes here..."
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>
                
                {pr.status === 'pending' && (
                  <div className="flex gap-3">
                    <Button 
                      variant="destructive" 
                      onClick={onReject}
                      className="flex-1"
                    >
                      Reject
                    </Button>
                    <Button 
                      onClick={onApprove}
                      className="flex-1"
                    >
                      Approve & Apply
                    </Button>
                  </div>
                )}
                
                {pr.status !== 'pending' && (
                  <div className="text-center py-4 text-muted-foreground">
                    This pull request has been {pr.status}.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle>Comments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Existing Comments */}
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {comments.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No comments yet.</p>
                  ) : (
                    comments.map((c) => (
                      <div key={c.id} className="border rounded-lg p-3 bg-muted/20">
                        <div className="text-xs text-muted-foreground mb-1">
                          {c.author} • {new Date(c.created_at).toLocaleString()}
                        </div>
                        <div className="text-sm">{c.content}</div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Comment */}
                <div className="space-y-2 pt-2 border-t">
                  <label className="text-sm font-medium">Add Comment</label>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Write a comment..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="flex-1 min-h-[60px]"
                    />
                  </div>
                  <Button 
                    onClick={addComment}
                    disabled={!comment.trim()}
                    className="w-full"
                  >
                    Add Comment
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default PullRequestDetail;
