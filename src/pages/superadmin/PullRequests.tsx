import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/navbar/Navbar";
import AdminNavbar from "@/components/navbar/AdminNavbar";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";

const PullRequests = () => {
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
    <main className="min-h-screen bg-background">
      {isLoggedIn ? <Navbar /> : <AdminNavbar />}
      <section className="container py-10 md:pl-72 lg:pl-80 xl:pl-72 2xl:pl-80 md:pt-16">

        <div className="grid gap-4 md:grid-cols-2">
          {prs.map((pr) => (
            <Card key={pr.id} className="rounded-xl">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{pr.title}</span>
                  <Badge variant={badgeVariant(pr.status)}>
                    {pr.status.charAt(0).toUpperCase() + pr.status.slice(1)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-2">
                  {deptNames[pr.department_id] || pr.department_id} • Year {pr.year} • Section {pr.section}
                </div>
                <p className="text-sm mb-3">{pr.description || 'No description provided.'}</p>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Created by {pr.created_by} • {new Date(pr.created_at).toLocaleString()}</div>
                  <Button asChild size="sm"><Link to={`/pull-requests/${pr.id}`}>View</Link></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {prs.length === 0 && (
            <div className="col-span-full text-center py-12">
              <div className="text-muted-foreground">
                <div className="text-lg font-medium mb-2">
                  No {status.toLowerCase()} pull requests found
                </div>
                <p className="text-sm">
                  {status === 'Pending' && "There are no pull requests waiting for review."}
                  {status === 'Approved' && "There are no approved pull requests."}
                  {status === 'Rejected' && "There are no rejected pull requests."}
                  {status === 'All' && "No pull requests have been created yet."}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default PullRequests;
