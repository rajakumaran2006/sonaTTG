import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SUBJECT_HOUR_LIMIT, Subject, subjectTotals, specialHours, useTimetableStore } from "@/store/timetableStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch as Toggle } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ensureDepartment, getSubjectsForYear, addSubject as addSubjectDb, addSubjectsBulk } from "@/lib/supabaseService";
import AdminNavbar from "@/components/navbar/AdminNavbar";

const SubjectManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const available = useTimetableStore((s) => s.availableSubjects);
  const selected = useTimetableStore((s) => s.selectedSubjects);
  const moveToSelected = useTimetableStore((s) => s.moveToSelected);
  const moveToAvailable = useTimetableStore((s) => s.moveToAvailable);
  const addAvailable = useTimetableStore((s) => s.addAvailable);
  const special = useTimetableStore((s) => s.special);
  const setSpecial = useTimetableStore((s) => s.setSpecial);

  const totals = useMemo(() => subjectTotals(selected), [selected]);
  const specialHrs = useMemo(() => specialHours(special), [special]);
  const [form, setForm] = useState<{ name: string; hours: number; type: "theory" | "lab" | "elective"; tags: string; code?: string; abbreviation?: string; staff?: string; }>({ name: "", hours: 1, type: "theory", tags: "", code: "", abbreviation: "", staff: "" });
  const labPreferences = useTimetableStore((s) => s.labPreferences);
  const setLabPreferences = useTimetableStore((s) => s.setLabPreferences);
  const selection = useTimetableStore((s) => s.selection);
  const seedYearDataset = useTimetableStore((s) => s.seedYearDataset);

  // Local UI state for Lab Settings dialog
  const [labSettingsOpen, setLabSettingsOpen] = useState(false);
  const [enableMorning, setEnableMorning] = useState(false);
  const [advancedMorning, setAdvancedMorning] = useState(false);
  const [morningSelectedLabs, setMorningSelectedLabs] = useState<Record<string, boolean>>({});
  const [morningStartByLab, setMorningStartByLab] = useState<Record<string, number>>({});
  const [enablePriorityAll, setEnablePriorityAll] = useState(false);
  const [priorityByLab, setPriorityByLab] = useState<Record<string, number>>({});
  const [eveningStartAt5ByLab, setEveningStartAt5ByLab] = useState<Record<string, boolean>>({});

  // Load subjects for current selection from Supabase
  useEffect(() => {
    if (!selection.department || !selection.year) return;
    (async () => {
      try {
        const dep = await ensureDepartment(selection.department!);
        let subs = await getSubjectsForYear(dep.id, selection.year!);

        const AI_DS_NAMES = new Set([
          "Artificial Intelligence and Data Science",
          "AI & DS",
          "Artificial Intelligence & Data Science",
        ]);
        const isAidsYear3 = AI_DS_NAMES.has(selection.department!) && (selection.year === "III" || selection.year === "3");

        if (subs.length === 0 && isAidsYear3) {
          const base: Omit<Subject, 'id'>[] = [
            { name: "CN", hoursPerWeek: 4, type: "theory" },
            { name: "ML", hoursPerWeek: 4, type: "theory" },
            { name: "SSA 3 (A)", hoursPerWeek: 2, type: "theory", tags: ["SSA"] },
            { name: "AIDS", hoursPerWeek: 4, type: "theory" },
            { name: "DBMS", hoursPerWeek: 4, type: "theory" },
            { name: "SSA 3 (SS)", hoursPerWeek: 1, type: "theory", tags: ["SSA"] },
            { name: "DWDM", hoursPerWeek: 4, type: "theory" },
            { name: "SSA 3 (V)", hoursPerWeek: 1, type: "theory", tags: ["SSA"] },
            { name: "NPTEL (IOT)", hoursPerWeek: 3, type: "theory" },
            { name: "ML LAB", hoursPerWeek: 4, type: "lab" },
            { name: "IOT LAB", hoursPerWeek: 2, type: "lab" },
            { name: "DBMS LAB", hoursPerWeek: 2, type: "lab" },
            { name: "AIDS LAB", hoursPerWeek: 2, type: "lab" },
          ];
          await addSubjectsBulk(base.map((b) => ({ ...b, departmentId: dep.id, year: selection.year! })));
          subs = await getSubjectsForYear(dep.id, selection.year!);
        }
        seedYearDataset(subs);
      } catch (e: any) {
        toast({ title: "Failed to load subjects", description: e?.message || String(e) });
      }
    })();
  }, [selection.department, selection.year]);

  const handleAdd = async () => {
    try {
      if (!form.name || !form.hours) return;
      if (!selection.department || !selection.year) {
        toast({ title: "Select Department & Year", description: "Please choose department and year first." });
        return;
      }
      const dep = await ensureDepartment(selection.department);
      const created = await addSubjectDb({
        name: form.name,
        hoursPerWeek: Number(form.hours),
        type: form.type,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
        code: form.code?.trim() || undefined,
        abbreviation: form.abbreviation?.trim() || undefined,
        staff: form.staff?.trim() || undefined,
        departmentId: dep.id,
        year: selection.year,
      });
      addAvailable(created);
      moveToSelected(created.id);
      setForm({ name: "", hours: 1, type: "theory", tags: "", code: "", abbreviation: "", staff: "" });
      toast({ title: "Subject added", description: `${created.name} saved to Supabase.` });
    } catch (e: any) {
      toast({ title: "Failed to add subject", description: e?.message || String(e) });
    }
  };

  const applyLabSettings = () => {
    // Build preferences map from current selections
    const prefs: typeof labPreferences = { ...labPreferences };
    selected.filter((s) => s.type === 'lab').forEach((lab) => {
      const current = prefs[lab.id] || {};
      const isChosenMorning = !!morningSelectedLabs[lab.id];
      const morningStart = morningStartByLab[lab.id];
      const eveningAt5 = !!eveningStartAt5ByLab[lab.id];
      prefs[lab.id] = {
        ...current,
        morningEnabled: enableMorning && isChosenMorning,
        morningStart: enableMorning && isChosenMorning ? (advancedMorning ? morningStart || 1 : (lab.hoursPerWeek >= 4 ? 1 : 1)) : undefined,
        eveningTwoHourStartAt5: lab.hoursPerWeek === 2 ? eveningAt5 : current.eveningTwoHourStartAt5,
        priority: enablePriorityAll && isChosenMorning ? (priorityByLab[lab.id] || 999) : current.priority,
      };
    });
    setLabPreferences(prefs);
    setLabSettingsOpen(false);
  };

  const next = () => {
    if (totals.total + specialHrs > SUBJECT_HOUR_LIMIT) {
      toast({ title: "Too many hours", description: `Assigned ${totals.total + specialHrs}/42. Reduce to continue.` });
      return;
    }
    navigate("/timetable");
  };

  return (
    <main className="min-h-screen bg-background">
      <AdminNavbar />
      <section className="container py-10">
        <header className="mb-6">
          <h1 className="text-3xl font-bold" style={{fontFamily: 'Poppins'}}>Manage Subjects</h1>
          <p className="text-muted-foreground">Choose subjects for the selected year. Added subjects are shared across sections of that year.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Max 42 hours/week</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-secondary">
                <div className="text-sm text-muted-foreground">Total Hours</div>
                <div className="text-2xl font-semibold">{totals.total + specialHrs}</div>
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <div className="text-sm text-muted-foreground">Theory</div>
                <div className="text-2xl font-semibold">{totals.theory}</div>
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <div className="text-sm text-muted-foreground">Labs</div>
                <div className="text-2xl font-semibold">{totals.lab}</div>
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <div className="text-sm text-muted-foreground">Specials</div>
                <div className="text-2xl font-semibold">{specialHrs}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl lg:col-span-2">
            <CardHeader>
              <CardTitle>Add Subject</CardTitle>
              <CardDescription>Saved for all sections in this year</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-6">
              <div className="md:col-span-2">
                <Label className="text-sm">Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g., Operating Systems" />
              </div>
              <div>
                <Label className="text-sm">Hours/week</Label>
                <Input type="number" min={1} max={7} value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: Number(e.target.value) }))} />
              </div>
              <div>
                <Label className="text-sm">Type</Label>
                <Select value={form.type} onValueChange={(v: "theory" | "lab" | "elective") => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-popover">
                    <SelectItem value="theory">Theory</SelectItem>
                    <SelectItem value="lab">Lab</SelectItem>
                    <SelectItem value="elective">Elective</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Code</Label>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g., U23IT501" />
              </div>
              <div>
                <Label className="text-sm">Abbrev.</Label>
                <Input value={form.abbreviation} onChange={(e) => setForm((f) => ({ ...f, abbreviation: e.target.value }))} placeholder="e.g., CN" />
              </div>
              <div>
                <Label className="text-sm">Tags (comma)</Label>
                <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="SSA, Elective" />
              </div>
              <div className="md:col-span-3">
                <Label className="text-sm">Staff</Label>
                <Input value={form.staff} onChange={(e) => setForm((f) => ({ ...f, staff: e.target.value }))} placeholder="e.g., Mr. D. Jayaprakash" />
              </div>
              <div className="md:col-span-6 flex justify-end">
                <Button variant="hero" onClick={handleAdd}>Add & Include</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Available Subjects</CardTitle>
              <CardDescription>From Supabase</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {available.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-card border">
                  <div className="flex items-center gap-3">
                    <Badge variant={s.type === 'lab' ? 'default' : 'secondary'}>{s.type.toUpperCase()}</Badge>
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.hoursPerWeek} h/w {s.tags?.length ? `• ${s.tags?.join(', ')}` : ''}</div>
                    </div>
                  </div>
                  <Button size="sm" variant="soft" onClick={() => moveToSelected(s.id)}>Add</Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Selected for Generation</CardTitle>
              <CardDescription>Used by the algorithm</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {selected.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-card border">
                  <div className="flex items-center gap-3">
                    <Badge variant={s.type === 'lab' ? 'default' : 'secondary'}>{s.type.toUpperCase()}</Badge>
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.hoursPerWeek} h/w {s.tags?.length ? `• ${s.tags?.join(', ')}` : ''}</div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => moveToAvailable(s.id)}>Remove</Button>
                </div>
              ))}

              <Separator className="my-4" />

              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Seminar</div>
                    <div className="text-xs text-muted-foreground">Sat 3rd–4th periods</div>
                  </div>
                  <Switch checked={special.seminar} onCheckedChange={(v) => setSpecial({ seminar: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Library</div>
                    <div className="text-xs text-muted-foreground">Sat 5th period</div>
                  </div>
                  <Switch checked={special.library} onCheckedChange={(v) => setSpecial({ library: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Counselling</div>
                    <div className="text-xs text-muted-foreground">Sat 6th–7th periods</div>
                  </div>
                  <Switch checked={special.counselling} onCheckedChange={(v) => setSpecial({ counselling: v })} />
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pt-4">
                <Dialog open={labSettingsOpen} onOpenChange={setLabSettingsOpen}>
                  <DialogTrigger asChild>
                    <Button variant="soft">Open Lab Settings</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Lab Scheduling Preferences</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">Prioritize Morning Lab</div>
                          <div className="text-xs text-muted-foreground">Schedule selected labs in P1–P4</div>
                        </div>
                        <Toggle checked={enableMorning} onCheckedChange={setEnableMorning} />
                      </div>
                      {enableMorning && (
                        <div className="space-y-4">
                          <div>
                            <div className="font-medium mb-2">Choose labs for morning</div>
                            <div className="grid gap-2">
                              {selected.filter((s) => s.type === 'lab').map((lab) => (
                                <label key={lab.id} className="flex items-center justify-between p-2 rounded-md border">
                                  <div className="text-sm">{lab.name} ({lab.hoursPerWeek}h)</div>
                                  <Checkbox checked={!!morningSelectedLabs[lab.id]} onCheckedChange={(v) => setMorningSelectedLabs((m) => ({ ...m, [lab.id]: !!v }))} />
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="font-medium">Advanced Settings (for selected labs)</div>
                            <Toggle checked={advancedMorning} onCheckedChange={setAdvancedMorning} />
                          </div>

                          <div className="space-y-2">
                            {selected.filter((s) => s.type === 'lab').filter((l) => morningSelectedLabs[l.id]).map((lab) => (
                              <div key={lab.id} className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2 p-2 rounded-md border">
                                <div className="font-medium text-sm">{lab.name} ({lab.hoursPerWeek}h)</div>
                                <div className="sm:col-span-2 flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Start at</span>
                                  <Select
                                    disabled={!advancedMorning}
                                    value={(morningStartByLab[lab.id] || 1).toString()}
                                    onValueChange={(v) => setMorningStartByLab((m) => ({ ...m, [lab.id]: Number(v) }))}
                                  >
                                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                                    <SelectContent className="z-50 bg-popover">
                                      {[1,2,3,4].map((p) => (
                                        <SelectItem key={p} value={p.toString()} disabled={p + lab.hoursPerWeek - 1 > 4 || (lab.hoursPerWeek >= 4 && p > 3)}>{p}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center justify-between pt-2">
                            <div>
                              <div className="font-medium">Give priority to all selected morning labs</div>
                              <div className="text-xs text-muted-foreground">Assign priority numbers; smaller = higher priority</div>
                            </div>
                            <Toggle checked={enablePriorityAll} onCheckedChange={setEnablePriorityAll} />
                          </div>
                          {enablePriorityAll && (
                            <div className="grid gap-2">
                              {selected.filter((s) => s.type === 'lab').filter((l) => morningSelectedLabs[l.id]).map((lab) => (
                                <div key={lab.id} className="flex items-center justify-between p-2 rounded-md border">
                                  <div className="text-sm">{lab.name}</div>
                                  <Input className="w-24" type="number" min={1} max={10} value={priorityByLab[lab.id] ?? ''} onChange={(e) => setPriorityByLab((m) => ({ ...m, [lab.id]: Number(e.target.value) }))} placeholder="1" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="font-medium">Evening Lab Option</div>
                        {selected.filter((s) => s.type === 'lab' && s.hoursPerWeek === 2).map((lab) => (
                          <div key={lab.id} className="flex items-center justify-between p-2 rounded-md border">
                            <div className="text-sm">{lab.name}: start at period 5 (P5–P6)</div>
                            <Toggle checked={!!eveningStartAt5ByLab[lab.id]} onCheckedChange={(v) => setEveningStartAt5ByLab((m) => ({ ...m, [lab.id]: v }))} />
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end">
                        <Button variant="hero" onClick={applyLabSettings}>Apply</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button variant="hero" onClick={next} disabled={totals.total + specialHrs > SUBJECT_HOUR_LIMIT}>Generate Timetable</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default SubjectManagement;