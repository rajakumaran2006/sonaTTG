import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Edit2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface SpecialHoursConfig {
  id?: string;
  special_type: string;
  total_hours: number;
  saturday_hours: number;
  weekdays_hours: number;
  saturday_periods: number[];
  weekdays_periods: number[];
  is_active: boolean;
}

interface SpecialHoursManagerProps {
  departmentId: string;
  year: string;
  onConfigUpdate: (configs: SpecialHoursConfig[]) => void;
  className?: string;
  /** When true, renders without the outer Card wrapper (for use inside a Dialog) */
  embedded?: boolean;
}

export function SpecialHoursManager({ departmentId, year, onConfigUpdate, className, embedded }: SpecialHoursManagerProps) {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<SpecialHoursConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<SpecialHoursConfig | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [sections, setSections] = useState<string[]>(['A', 'B', 'C']);

  // Load existing configurations and ensure defaults exist
  useEffect(() => {
    loadConfigurations();
    ensureDefaultConfigs();

    // Load active sections for the department + year
    const fetchSections = async () => {
      try {
        const { data: ttData } = await supabase
          .from('timetables')
          .select('section')
          .eq('department_id', departmentId)
          .eq('year', year);
          
        const { data: ssData } = await supabase
          .from('section_subjects')
          .select('section')
          .eq('department_id', departmentId)
          .eq('year', year);

        const sectionsList = Array.from(new Set([
          ...(ttData || []).map(r => r.section),
          ...(ssData || []).map(r => r.section)
        ])).filter(Boolean).sort() as string[];

        if (sectionsList.length > 0) {
          setSections(sectionsList);
        }
      } catch (e) {
        console.error('Failed to load sections for special hours manager:', e);
      }
    };
    fetchSections();
  }, [departmentId, year]);

  const loadConfigurations = async () => {
    try {
      const { data, error } = await supabase
        .from('special_hours_config')
        .select('*')
        .eq('department_id', departmentId)
        .eq('year', year)
        .eq('is_active', true)
        .order('special_type');

      if (error) throw error;

      const configsData = data.map(config => ({
        id: config.id,
        special_type: config.special_type,
        total_hours: config.total_hours,
        saturday_hours: config.saturday_hours,
        weekdays_hours: config.weekdays_hours,
        saturday_periods: Array.isArray(config.saturday_periods) ? config.saturday_periods as number[] : [],
        weekdays_periods: Array.isArray(config.weekdays_periods) ? config.weekdays_periods as number[] : [],
        is_active: config.is_active,
      }));

      setConfigs(configsData);
      onConfigUpdate(configsData);
    } catch (error) {
      console.error('Error loading special hours configurations:', error);
    }
  };

  const ensureDefaultConfigs = async () => {
    try {
      const defaultConfigs = [
        {
          special_type: 'seminar',
          total_hours: 2,
          saturday_hours: 2,
          weekdays_hours: 0,
          saturday_periods: [3, 4],
          weekdays_periods: []
        },
        {
          special_type: 'library',
          total_hours: 1,
          saturday_hours: 1,
          weekdays_hours: 0,
          saturday_periods: [5],
          weekdays_periods: []
        },
        {
          special_type: 'counselling',
          total_hours: 2,
          saturday_hours: 2,
          weekdays_hours: 0,
          saturday_periods: [6, 7],
          weekdays_periods: []
        }
      ];

      // Check which defaults don't exist yet
      const { data: existing } = await supabase
        .from('special_hours_config')
        .select('special_type')
        .eq('department_id', departmentId)
        .eq('year', year)
        .eq('is_active', true);

      const existingTypes = new Set((existing || []).map(e => e.special_type));
      const toCreate = defaultConfigs.filter(config => !existingTypes.has(config.special_type));

      if (toCreate.length > 0) {
        const { error } = await supabase
          .from('special_hours_config')
          .insert(toCreate.map(config => ({
            ...config,
            department_id: departmentId,
            year,
            is_active: true
          })));

        if (error) throw error;
        // Reload after creating defaults
        loadConfigurations();
      }
    } catch (error) {
      console.error('Error ensuring default configurations:', error);
    }
  };

  const saveConfiguration = async (config: SpecialHoursConfig) => {
    try {
      if (config.total_hours !== config.saturday_hours + config.weekdays_hours) {
        toast({
          title: "Validation Error",
          description: "Total hours must equal Saturday hours + Weekdays hours",
          variant: "destructive"
        });
        return;
      }

      const saveData = {
        department_id: departmentId,
        year,
        special_type: config.special_type,
        total_hours: config.total_hours,
        saturday_hours: config.saturday_hours,
        weekdays_hours: config.weekdays_hours,
        saturday_periods: config.saturday_periods,
        weekdays_periods: config.weekdays_periods,
        is_active: true,
      };

      let result;
      if (config.id) {
        result = await supabase
          .from('special_hours_config')
          .update(saveData)
          .eq('id', config.id);
      } else {
        result = await supabase
          .from('special_hours_config')
          .insert(saveData);
      }

      if (result.error) throw result.error;

      toast({
        title: "Success",
        description: `Special hours configuration ${config.id ? 'updated' : 'created'} successfully`,
      });

      loadConfigurations();
      setIsDialogOpen(false);
      setEditingConfig(null);
      setIsCreating(false);
      
      // Trigger timetable regeneration after configuration change
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('specialHoursChanged'));
      }, 100);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save configuration",
        variant: "destructive"
      });
    }
  };

  const deleteConfiguration = async (id: string) => {
    try {
      const { error } = await supabase
        .from('special_hours_config')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Special hours configuration deleted successfully",
      });

      // Trigger immediate reallocation by reloading configurations
      loadConfigurations();
      
      // Notify parent component to trigger timetable regeneration
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('specialHoursChanged'));
      }, 100);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete configuration",
        variant: "destructive"
      });
    }
  };

  const openEditDialog = (config?: SpecialHoursConfig) => {
    if (config) {
      setEditingConfig({ ...config });
      setIsCreating(false);
    } else {
      setEditingConfig({
        special_type: "",
        total_hours: 1,
        saturday_hours: 1,
        weekdays_hours: 0,
        saturday_periods: [],
        weekdays_periods: [],
        is_active: true,
      });
      setIsCreating(true);
    }
    setIsDialogOpen(true);
  };

  const formatPeriods = (periods: number[]) => {
    return periods.length > 0 ? `P${periods.join(', P')}` : 'None';
  };

  const getTotalHours = () => {
    return configs.reduce((total, config) => total + config.total_hours, 0);
  };

  const innerContent = (
    <>
      {/* ── Config list ─────────────────────────────────────── */}
      {configs.length === 0 && !isDialogOpen ? (
        <p className="text-center text-muted-foreground py-8 text-sm">
          No special hours configured. Click "+" to create one.
        </p>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => (
            <div key={config.id} className="border rounded-xl p-4 space-y-3 bg-white/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold capitalize text-sm">{config.special_type}</h3>
                  <Badge variant="secondary">{config.total_hours}h total</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(config)}
                    className="rounded-lg"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => config.id && deleteConfiguration(config.id)}
                    className="rounded-lg text-red-500 hover:text-red-600 hover:border-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                <div>
                  <span>Saturday:</span>
                  <div className="font-medium text-foreground">
                    {config.saturday_hours}h • {formatPeriods(Array.isArray(config.saturday_periods) ? config.saturday_periods : [])}
                  </div>
                </div>
                <div>
                  <span>Weekdays:</span>
                  <div className="font-medium text-foreground">
                    {config.weekdays_hours}h • {formatPeriods(Array.isArray(config.weekdays_periods) ? config.weekdays_periods : [])}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Inline editor (shown when embedded=true, otherwise Dialog) ── */}
      {embedded && isDialogOpen && editingConfig && (
        <div className="border-2 border-emerald-200 rounded-2xl p-5 mt-4 bg-emerald-50/30 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-emerald-900">
              {isCreating ? 'Create' : 'Edit'} Special Hours Configuration
            </h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setIsDialogOpen(false); setEditingConfig(null); }}
              className="h-7 w-7 p-0 rounded-full text-slate-400 hover:text-slate-600"
            >
              ✕
            </Button>
          </div>
          <SpecialHoursEditor
            config={editingConfig}
            onChange={setEditingConfig}
            onSave={() => saveConfiguration(editingConfig)}
            onCancel={() => { setIsDialogOpen(false); setEditingConfig(null); }}
            sections={sections}
          />
        </div>
      )}

      {/* ── Modal dialog (when NOT embedded) ── */}
      {!embedded && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {isCreating ? 'Create' : 'Edit'} Special Hours Configuration
              </DialogTitle>
            </DialogHeader>
            {editingConfig && (
              <SpecialHoursEditor
                config={editingConfig}
                onChange={setEditingConfig}
                onSave={() => saveConfiguration(editingConfig)}
                onCancel={() => setIsDialogOpen(false)}
                sections={sections}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className={`space-y-4 ${className || ''}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {getTotalHours()} hours configured
          </p>
          <Button
            onClick={() => openEditDialog()}
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5" /> Add Special Hours
          </Button>
        </div>
        {innerContent}
      </div>
    );
  }

  return (
    <Card className={`rounded-2xl border-none shadow-lg bg-gradient-to-br from-card to-secondary/30 backdrop-blur-sm ${className || ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Special Hours Configuration</CardTitle>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-1">
              {getTotalHours()} hours configured for this class
            </p>
          </div>
          <Button onClick={() => openEditDialog()} size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full hover:bg-primary/10">
            <Plus className="h-4 w-4 text-primary" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {configs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No special hours configured. Click "+" to create one.
          </p>
        ) : (
          configs.map((config) => (
            <div key={config.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium capitalize">{config.special_type}</h3>
                  <Badge variant="secondary">{config.total_hours}h total</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(config)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => config.id && deleteConfiguration(config.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Saturday:</span>
                  <div className="font-medium">
                    {config.saturday_hours}h • {formatPeriods(Array.isArray(config.saturday_periods) ? config.saturday_periods : [])}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Weekdays:</span>
                  <div className="font-medium">
                    {config.weekdays_hours}h • {formatPeriods(Array.isArray(config.weekdays_periods) ? config.weekdays_periods : [])}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {isCreating ? 'Create' : 'Edit'} Special Hours Configuration
              </DialogTitle>
            </DialogHeader>

            {editingConfig && (
              <SpecialHoursEditor
                config={editingConfig}
                onChange={setEditingConfig}
                onSave={() => saveConfiguration(editingConfig)}
                onCancel={() => setIsDialogOpen(false)}
                sections={sections}
              />
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

interface SpecialHoursEditorProps {
  config: SpecialHoursConfig;
  onChange: (config: SpecialHoursConfig) => void;
  onSave: () => void;
  onCancel: () => void;
  sections: string[];
}

function SpecialHoursEditor({ config, onChange, onSave, onCancel, sections }: SpecialHoursEditorProps) {
  const [activeTab, setActiveTab] = useState<string>(sections[0] || 'A');

  const updateConfig = (updates: Partial<SpecialHoursConfig>) => {
    onChange({ ...config, ...updates });
  };

  const getDayIndex = (day: string): number => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days.indexOf(day);
  };

  const parsePeriodValue = (p: any, isSatField: boolean = false): { day: number; period: number } | null => {
    if (typeof p === 'string') {
      const parts = p.split('-');
      if (parts.length === 2) {
        const dayMap: Record<string, number> = {
          'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5,
          'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5
        };
        const d = dayMap[parts[0]];
        const pr = parseInt(parts[1]);
        if (d !== undefined && !isNaN(pr)) {
          return { day: d, period: pr };
        }
      }
    } else if (typeof p === 'number') {
      if (p > 10) {
        const d = Math.floor(p / 10);
        const pr = p % 10;
        return { day: d, period: pr };
      } else {
        return { day: isSatField ? 5 : 0, period: p };
      }
    }
    return null;
  };

  const getSecList = (val: any, sec: string): any[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return val[sec] || [];
  };

  const isSlotSelected = (sectionName: string, day: string, period: number): boolean => {
    const key = day === 'Sat' ? 'saturday_periods' : 'weekdays_periods';
    const val = config[key];
    if (!val) return false;
    
    if (Array.isArray(val)) {
      return val.some(p => {
        const parsed = parsePeriodValue(p, day === 'Sat');
        return parsed && parsed.day === getDayIndex(day) && parsed.period === period;
      });
    }
    
    if (typeof val === 'object') {
      const list = val[sectionName] || [];
      return list.some((p: any) => {
        const parsed = parsePeriodValue(p, day === 'Sat');
        return parsed && parsed.day === getDayIndex(day) && parsed.period === period;
      });
    }
    
    return false;
  };

  const toggleSlot = (sectionName: string, day: string, period: number) => {
    const key = day === 'Sat' ? 'saturday_periods' : 'weekdays_periods';
    const currentVal = config[key] || [];
    
    let newObj: Record<string, any[]> = {};
    if (Array.isArray(currentVal)) {
      sections.forEach(sec => {
        newObj[sec] = [...currentVal];
      });
    } else if (typeof currentVal === 'object') {
      newObj = { ...currentVal };
    }
    
    const sectionPeriods = newObj[sectionName] || [];
    const slotStr = `${day}-${period}`;
    
    const normalizedPeriods = sectionPeriods.map(p => {
      const parsed = parsePeriodValue(p, day === 'Sat');
      return parsed ? `${DAYS[parsed.day]}-${parsed.period}` : null;
    }).filter(Boolean) as string[];
    
    let updatedPeriods: string[];
    if (normalizedPeriods.includes(slotStr)) {
      updatedPeriods = normalizedPeriods.filter(p => p !== slotStr);
    } else {
      updatedPeriods = [...normalizedPeriods, slotStr];
    }
    
    // Separate into Sat and weekday for saving
    const satPeriods = updatedPeriods.filter(p => p.startsWith('Sat'));
    const wdPeriods = updatedPeriods.filter(p => !p.startsWith('Sat'));
    
    const otherKey = day === 'Sat' ? 'weekdays_periods' : 'saturday_periods';
    const otherVal = config[otherKey] || [];
    
    let otherObj: Record<string, any[]> = {};
    if (Array.isArray(otherVal)) {
      sections.forEach(sec => {
        otherObj[sec] = [...otherVal];
      });
    } else if (typeof otherVal === 'object') {
      otherObj = { ...otherVal };
    }
    
    newObj[sectionName] = day === 'Sat' ? satPeriods : wdPeriods;
    otherObj[sectionName] = otherObj[sectionName] || [];
    
    // Calculate new max counts across all sections
    let maxTotal = 0;
    let maxSat = 0;
    let maxWd = 0;
    
    sections.forEach(sec => {
      const sPeriods = (sec === sectionName && day === 'Sat') ? satPeriods : getSecList(day === 'Sat' ? newObj : otherObj, sec);
      const wPeriods = (sec === sectionName && day !== 'Sat') ? wdPeriods : getSecList(day !== 'Sat' ? newObj : otherObj, sec);
      
      const sCount = sPeriods.length;
      const wCount = wPeriods.length;
      
      maxSat = Math.max(maxSat, sCount);
      maxWd = Math.max(maxWd, wCount);
      maxTotal = Math.max(maxTotal, sCount + wCount);
    });
    
    onChange({
      ...config,
      [key]: newObj,
      [otherKey]: otherObj,
      total_hours: maxTotal,
      saturday_hours: maxSat,
      weekdays_hours: maxWd
    });
  };

  const copyToAllSections = (sourceSection: string) => {
    const satVal = config.saturday_periods;
    const wdVal = config.weekdays_periods;
    
    const sourceSat = getSecList(satVal, sourceSection);
    const sourceWd = getSecList(wdVal, sourceSection);
    
    const newSatObj: Record<string, any[]> = {};
    const newWdObj: Record<string, any[]> = {};
    
    sections.forEach(sec => {
      newSatObj[sec] = [...sourceSat];
      newWdObj[sec] = [...sourceWd];
    });
    
    const satCount = sourceSat.length;
    const wdCount = sourceWd.length;
    
    onChange({
      ...config,
      saturday_periods: newSatObj,
      weekdays_periods: newWdObj,
      total_hours: satCount + wdCount,
      saturday_hours: satCount,
      weekdays_hours: wdCount
    });
  };

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const PERIODS = [1, 2, 3, 4, 5, 6, 7];

  const getSectionSelectedCount = (sec: string) => {
    const satCount = getSecList(config.saturday_periods, sec).length;
    const wdCount = getSecList(config.weekdays_periods, sec).length;
    return satCount + wdCount;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="special_type" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Special Type Name</Label>
          <Input
            id="special_type"
            value={config.special_type}
            onChange={(e) => updateConfig({ special_type: e.target.value })}
            placeholder="e.g., Seminar, Library, Counselling"
            className="rounded-xl border-slate-200"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="total_hours" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Hours configured (Auto-calculated)</Label>
          <div className="h-10 flex items-center px-3 border border-slate-200 rounded-xl bg-slate-50 font-bold text-sm">
            {config.total_hours} hour(s) per week
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-4">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Schedule Grid per Section</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => copyToAllSections(activeTab)}
            className="text-[10px] uppercase font-bold tracking-wider h-8 rounded-lg"
          >
            Apply Section {activeTab} to All Sections
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 mb-4 rounded-xl p-1 bg-slate-100">
            {sections.map((sec) => (
              <TabsTrigger key={sec} value={sec} className="rounded-lg font-semibold py-1.5 text-xs">
                Section {sec} <Badge className="ml-1.5 h-4 px-1 text-[9px] bg-slate-250 text-slate-800" variant="secondary">{getSectionSelectedCount(sec)}h</Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {sections.map((sec) => (
            <TabsContent key={sec} value={sec} className="space-y-4 outline-none">
              <div className="overflow-x-auto rounded-xl border border-slate-250 bg-white p-4 shadow-sm">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="p-2 text-left font-bold text-slate-500 w-16">Day</th>
                      {PERIODS.map(p => (
                        <th key={p} className="p-2 text-center font-bold text-slate-500">Period {p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map(day => (
                      <tr key={day} className="border-t border-slate-100">
                        <td className="p-2 font-bold text-slate-700">{day}</td>
                        {PERIODS.map(p => {
                          const isSelected = isSlotSelected(sec, day, p);
                          return (
                            <td key={p} className="p-1.5 text-center">
                              <Button
                                type="button"
                                size="sm"
                                variant={isSelected ? "default" : "outline"}
                                onClick={() => toggleSlot(sec, day, p)}
                                className={`h-8 w-16 p-0 text-[10px] font-bold rounded-lg transition-all ${
                                  isSelected 
                                    ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm" 
                                    : "hover:bg-slate-50 border-slate-200"
                                }`}
                              >
                                {isSelected ? "Selected" : `Slot P${p}`}
                              </Button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="outline" onClick={onCancel} className="rounded-xl px-4">
          Cancel
        </Button>
        <Button onClick={onSave} disabled={!config.special_type.trim()} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl px-5">
          Save Configuration
        </Button>
      </div>
    </div>
  );
}