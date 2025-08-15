import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { getAllYears, addYear, updateYear, deleteYear, ensureDefaultYears } from '@/lib/supabaseService';
import { supabase } from '@/integrations/supabase/client';
import Navbar from '@/components/navbar/Navbar';
import { Breadcrumbs } from '@/components/Breadcrumbs';

interface Year {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

interface GlobalSettings {
  working_days: number;
  periods_per_day: number;
  period_duration: number;
  max_weekly_hours: number;
  allow_lab_afternoon: boolean;
  enable_seminar_slots: boolean;
  enable_library_slots: boolean;
  enable_counselling_slots: boolean;
  default_lab_duration: number;
  max_consecutive_labs: number;
}

const Settings = () => {
  const navigate = useNavigate();
  const isLoggedIn = useMemo(() => localStorage.getItem("superAdmin") === "true", []);
  const [years, setYears] = useState<Year[]>([]);
  const [settings, setSettings] = useState<GlobalSettings>({
    working_days: 6,
    periods_per_day: 7,
    period_duration: 50,
    max_weekly_hours: 42,
    allow_lab_afternoon: true,
    enable_seminar_slots: true,
    enable_library_slots: true,
    enable_counselling_slots: true,
    default_lab_duration: 2,
    max_consecutive_labs: 3,
  });
  
  // Year management state
  const [addYearOpen, setAddYearOpen] = useState(false);
  const [newYearName, setNewYearName] = useState('');
  const [newYearOrder, setNewYearOrder] = useState(5);
  const [editingYear, setEditingYear] = useState<Year | null>(null);
  const [editYearName, setEditYearName] = useState('');
  const [editYearOrder, setEditYearOrder] = useState(0);

  useEffect(() => {
    if (!isLoggedIn) { 
      navigate('/super-admin-login', { replace: true }); 
      return; 
    }
    loadSettings();
    loadYears();
  }, [isLoggedIn, navigate]);

  const loadSettings = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('global_settings')
        .select('*')
        .single();
      
      if (error && error.code !== 'PGRST116') {
        // If table doesn't exist, create default settings
        await createDefaultSettings();
      } else if (data) {
        setSettings({ ...settings, ...data });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      await createDefaultSettings();
    }
  };

  const createDefaultSettings = async () => {
    try {
      const { error } = await (supabase as any)
        .from('global_settings')
        .insert([settings]);
      
      if (error) throw error;
      toast.success('Default settings created');
    } catch (error) {
      console.error('Failed to create default settings:', error);
    }
  };

  const loadYears = async () => {
    try {
      await ensureDefaultYears();
      const yearsData = await getAllYears();
      setYears(yearsData);
    } catch (error) {
      console.error('Failed to load years:', error);
    }
  };

  const saveSettings = async () => {
    try {
      const { error } = await (supabase as any)
        .from('global_settings')
        .upsert([settings], { onConflict: 'id' });
      
      if (error) throw error;
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    }
  };

  const handleAddYear = async () => {
    if (!newYearName.trim()) return;
    try {
      await addYear(newYearName.trim(), newYearOrder);
      toast.success('Year added successfully');
      setAddYearOpen(false);
      setNewYearName('');
      setNewYearOrder(5);
      loadYears();
    } catch (error) {
      toast.error('Failed to add year');
    }
  };

  const handleEditYear = (year: Year) => {
    setEditingYear(year);
    setEditYearName(year.name);
    setEditYearOrder(year.display_order);
  };

  const handleUpdateYear = async () => {
    if (!editYearName.trim() || !editingYear) return;
    try {
      await updateYear(editingYear.id, { 
        name: editYearName.trim(), 
        display_order: editYearOrder 
      });
      toast.success('Year updated successfully');
      setEditingYear(null);
      setEditYearName('');
      setEditYearOrder(0);
      loadYears();
    } catch (error) {
      toast.error('Failed to update year');
    }
  };

  const handleToggleYearStatus = async (yearId: string, isActive: boolean) => {
    try {
      await updateYear(yearId, { is_active: isActive });
      toast.success('Year status updated');
      loadYears();
    } catch (error) {
      toast.error('Failed to toggle year status');
    }
  };

  const handleDeleteYear = async (yearId: string) => {
    if (!window.confirm('Are you sure you want to delete this year?')) return;
    try {
      await deleteYear(yearId);
      toast.success('Year deleted');
      loadYears();
    } catch (error) {
      toast.error('Failed to delete year');
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <section className="container py-10">
        <Breadcrumbs
          segments={[
            { label: 'Super Admin', href: '/super-admin' },
            { label: 'Settings' },
          ]}
        />
        
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Global Settings</h1>
          <p className="text-sm text-muted-foreground">Configure system-wide settings and year management</p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Year Management */}
          <Card>
            <CardHeader>
              <CardTitle>Year Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Dialog open={addYearOpen} onOpenChange={setAddYearOpen}>
                <DialogTrigger asChild>
                  <Button>Add New Year</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Year</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="yearName">Year Name</Label>
                      <Input
                        id="yearName"
                        placeholder="e.g. V, VI"
                        value={newYearName}
                        onChange={(e) => setNewYearName(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="yearOrder">Display Order</Label>
                      <Input
                        id="yearOrder"
                        type="number"
                        min="5"
                        value={newYearOrder}
                        onChange={(e) => setNewYearOrder(parseInt(e.target.value) || 5)}
                      />
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" onClick={() => setAddYearOpen(false)}>Cancel</Button>
                      <Button onClick={handleAddYear}>Add Year</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              
              <div className="space-y-3">
                <h4 className="font-medium">Available Years</h4>
                {years.map((year) => (
                  <div key={year.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <span className="font-medium">Year {year.name}</span>
                      <span className="text-sm text-muted-foreground">Order: {year.display_order}</span>
                      <span className={`px-2 py-1 text-xs rounded-full ${year.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {year.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Dialog open={editingYear?.id === year.id} onOpenChange={(open) => !open && setEditingYear(null)}>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditYear(year)}
                          >
                            Edit
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit Year</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="editYearName">Year Name</Label>
                              <Input
                                id="editYearName"
                                value={editYearName}
                                onChange={(e) => setEditYearName(e.target.value)}
                              />
                            </div>
                            <div>
                              <Label htmlFor="editYearOrder">Display Order</Label>
                              <Input
                                id="editYearOrder"
                                type="number"
                                min="1"
                                value={editYearOrder}
                                onChange={(e) => setEditYearOrder(parseInt(e.target.value) || 1)}
                              />
                            </div>
                            <div className="flex justify-end space-x-2">
                              <Button variant="outline" onClick={() => setEditingYear(null)}>Cancel</Button>
                              <Button onClick={handleUpdateYear}>Update Year</Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Button
                        size="sm"
                        variant={year.is_active ? "outline" : "default"}
                        onClick={() => handleToggleYearStatus(year.id, !year.is_active)}
                      >
                        {year.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      {!['I', 'II', 'III', 'IV'].includes(year.name) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteYear(year.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Global Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Global Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Basic Settings */}
              <div className="space-y-4">
                <h4 className="font-medium">Basic Configuration</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="workingDays">Working Days per Week</Label>
                    <Input
                      id="workingDays"
                      type="number"
                      min="1"
                      max="7"
                      value={settings.working_days}
                      onChange={(e) => setSettings({ ...settings, working_days: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="periodsPerDay">Periods per Day</Label>
                    <Input
                      id="periodsPerDay"
                      type="number"
                      min="1"
                      max="12"
                      value={settings.periods_per_day}
                      onChange={(e) => setSettings({ ...settings, periods_per_day: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="periodDuration">Period Duration (minutes)</Label>
                    <Input
                      id="periodDuration"
                      type="number"
                      min="10"
                      max="120"
                      value={settings.period_duration}
                      onChange={(e) => setSettings({ ...settings, period_duration: parseInt(e.target.value) || 10 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxWeeklyHours">Max Weekly Hours</Label>
                    <Input
                      id="maxWeeklyHours"
                      type="number"
                      min="1"
                      max="100"
                      value={settings.max_weekly_hours}
                      onChange={(e) => setSettings({ ...settings, max_weekly_hours: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Lab Settings */}
              <div className="space-y-4">
                <h4 className="font-medium">Lab Configuration</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="defaultLabDuration">Default Lab Duration (periods)</Label>
                    <Input
                      id="defaultLabDuration"
                      type="number"
                      min="1"
                      max="4"
                      value={settings.default_lab_duration}
                      onChange={(e) => setSettings({ ...settings, default_lab_duration: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxConsecutiveLabs">Max Consecutive Labs</Label>
                    <Input
                      id="maxConsecutiveLabs"
                      type="number"
                      min="1"
                      max="5"
                      value={settings.max_consecutive_labs}
                      onChange={(e) => setSettings({ ...settings, max_consecutive_labs: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="allowLabAfternoon"
                    checked={settings.allow_lab_afternoon}
                    onCheckedChange={(checked) => setSettings({ ...settings, allow_lab_afternoon: checked })}
                  />
                  <Label htmlFor="allowLabAfternoon">Allow labs in afternoon slots</Label>
                </div>
              </div>

              <Separator />

              {/* Special Slots */}
              <div className="space-y-4">
                <h4 className="font-medium">Special Time Slots</h4>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="enableSeminar"
                      checked={settings.enable_seminar_slots}
                      onCheckedChange={(checked) => setSettings({ ...settings, enable_seminar_slots: checked })}
                    />
                    <Label htmlFor="enableSeminar">Enable seminar slots</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="enableLibrary"
                      checked={settings.enable_library_slots}
                      onCheckedChange={(checked) => setSettings({ ...settings, enable_library_slots: checked })}
                    />
                    <Label htmlFor="enableLibrary">Enable library slots</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="enableCounselling"
                      checked={settings.enable_counselling_slots}
                      onCheckedChange={(checked) => setSettings({ ...settings, enable_counselling_slots: checked })}
                    />
                    <Label htmlFor="enableCounselling">Enable counselling slots</Label>
                  </div>
                </div>
              </div>

              <Button onClick={saveSettings} className="w-full">
                Save All Settings
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default Settings;
