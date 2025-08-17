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
}

export function SpecialHoursManager({ departmentId, year, onConfigUpdate }: SpecialHoursManagerProps) {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<SpecialHoursConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<SpecialHoursConfig | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Load existing configurations and ensure defaults exist
  useEffect(() => {
    loadConfigurations();
    ensureDefaultConfigs();
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

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Special Hours Configuration</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Department: {departmentId} • Year: {year} • Total Hours: {getTotalHours()}
            </p>
          </div>
          <Button onClick={() => openEditDialog()} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Special
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {configs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No special hours configured. Click "Add Special" to create one.
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
                    {config.saturday_hours}h • {formatPeriods(config.saturday_periods)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Weekdays:</span>
                  <div className="font-medium">
                    {config.weekdays_hours}h • {formatPeriods(config.weekdays_periods)}
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
}

function SpecialHoursEditor({ config, onChange, onSave, onCancel }: SpecialHoursEditorProps) {
  const [saturdayEnabled, setSaturdayEnabled] = useState(config.saturday_hours > 0);
  const [weekdaysEnabled, setWeekdaysEnabled] = useState(config.weekdays_hours > 0);

  const updateConfig = (updates: Partial<SpecialHoursConfig>) => {
    onChange({ ...config, ...updates });
  };

  const togglePeriod = (periodType: 'saturday' | 'weekdays', period: number) => {
    const key = periodType === 'saturday' ? 'saturday_periods' : 'weekdays_periods';
    const currentPeriods = config[key];
    const newPeriods = currentPeriods.includes(period)
      ? currentPeriods.filter(p => p !== period)
      : [...currentPeriods, period].sort((a, b) => a - b);
    
    updateConfig({ [key]: newPeriods });
  };

  const isValid = () => {
    return config.special_type.trim() !== '' && 
           config.total_hours === config.saturday_hours + config.weekdays_hours &&
           config.total_hours > 0;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="special_type">Special Type Name</Label>
        <Input
          id="special_type"
          value={config.special_type}
          onChange={(e) => updateConfig({ special_type: e.target.value })}
          placeholder="e.g., Seminar, Library, Counselling"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="total_hours">Total Hours per Week</Label>
        <Input
          id="total_hours"
          type="number"
          min="1"
          max="10"
          value={config.total_hours}
          onChange={(e) => updateConfig({ total_hours: parseInt(e.target.value) || 0 })}
        />
      </div>

      {/* Saturday Configuration */}
      <div className="space-y-4 border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <Label>Saturday Allocation</Label>
          <Switch
            checked={saturdayEnabled}
            onCheckedChange={(checked) => {
              setSaturdayEnabled(checked);
              if (!checked) {
                updateConfig({ saturday_hours: 0, saturday_periods: [] });
              }
            }}
          />
        </div>

        {saturdayEnabled && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="saturday_hours">Saturday Hours</Label>
              <Input
                id="saturday_hours"
                type="number"
                min="0"
                max={config.total_hours}
                value={config.saturday_hours}
                onChange={(e) => updateConfig({ saturday_hours: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div>
              <Label>Saturday Periods (1-7)</Label>
              <div className="grid grid-cols-7 gap-2 mt-2">
                {[1, 2, 3, 4, 5, 6, 7].map((period) => (
                  <Button
                    key={period}
                    variant={config.saturday_periods.includes(period) ? "default" : "outline"}
                    size="sm"
                    onClick={() => togglePeriod('saturday', period)}
                  >
                    P{period}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Weekdays Configuration */}
      <div className="space-y-4 border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <Label>Weekdays Allocation</Label>
          <Switch
            checked={weekdaysEnabled}
            onCheckedChange={(checked) => {
              setWeekdaysEnabled(checked);
              if (!checked) {
                updateConfig({ weekdays_hours: 0, weekdays_periods: [] });
              }
            }}
          />
        </div>

        {weekdaysEnabled && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="weekdays_hours">Weekdays Hours</Label>
              <Input
                id="weekdays_hours"
                type="number"
                min="0"
                max={config.total_hours}
                value={config.weekdays_hours}
                onChange={(e) => updateConfig({ weekdays_hours: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div>
              <Label>Weekdays Periods (1-7)</Label>
              <div className="grid grid-cols-7 gap-2 mt-2">
                {[1, 2, 3, 4, 5, 6, 7].map((period) => (
                  <Button
                    key={period}
                    variant={config.weekdays_periods.includes(period) ? "default" : "outline"}
                    size="sm"
                    onClick={() => togglePeriod('weekdays', period)}
                  >
                    P{period}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Validation Status */}
      {config.total_hours !== config.saturday_hours + config.weekdays_hours && (
        <div className="text-destructive text-sm">
          Total hours ({config.total_hours}) must equal Saturday hours ({config.saturday_hours}) + Weekdays hours ({config.weekdays_hours})
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={!isValid()}>
          Save Configuration
        </Button>
      </div>
    </div>
  );
}