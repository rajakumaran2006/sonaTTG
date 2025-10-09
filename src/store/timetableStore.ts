import { create } from "zustand";

export type SubjectType = "theory" | "lab" | "elective" | "open elective";

export interface Subject {
  id: string;
  name: string;
  hoursPerWeek: number; // 1-6
  type: SubjectType;
  tags?: string[]; // e.g., ["SSA"]
  // Optional metadata for detailed timetable exports and legends
  code?: string; // e.g., U23IT501
  abbreviation?: string; // e.g., CN
  staff?: string; // e.g., Mr. D. Jayaprakash
  maxFacultyCount?: number; // Maximum faculty members for lab subjects
  credits?: number; // Academic credits (1-6)
}

export interface SpecialFlags {
  seminar: boolean; // Saturday 3-4
  library: boolean; // Saturday 5
  counselling: boolean; // Saturday 6-7
}

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

export interface SelectionState {
  department?: string;
  year?: string;
  section?: string;
}

export interface TimetableState {
  selection: SelectionState;
  // In-memory datasets keyed by selection. For AI&DS Year III, key is shared across sections.
  datasets: Record<string, { available: Subject[]; selected: Subject[]; prefs?: LabPrefsMap }>;
  availableSubjects: Subject[];
  selectedSubjects: Subject[];
  special: SpecialFlags;
  specialHoursConfigs: SpecialHoursConfig[];
  // Generated timetable as [day][period] -> subject name or empty string
  timetable: string[][];
  setSelection: (s: Partial<SelectionState>) => void;
  seedYearDataset: (subjects: Subject[]) => void;
  addAvailable: (s: Subject) => void;
  moveToSelected: (id: string) => void;
  moveToAvailable: (id: string) => void;
  setSpecial: (flags: Partial<SpecialFlags>) => void;
  setSpecialHoursConfigs: (configs: SpecialHoursConfig[]) => void;
  setSelectedSubjects: (subs: Subject[]) => void;
  setTimetable: (grid: string[][]) => void;
  // Lab preferences for the current selection
  labPreferences: LabPrefsMap;
  setLabPreferences: (prefs: LabPrefsMap) => void;
}

const DAYS = 6; // Mon-Sat
const PERIODS = 7;

// Removed local example seed; subjects now load from Supabase


export const useTimetableStore = create<TimetableState>((set, get) => ({
  selection: {},
  datasets: {},
  availableSubjects: [],
  selectedSubjects: [],
  special: { seminar: true, library: true, counselling: true },
  specialHoursConfigs: [],
  timetable: Array.from({ length: DAYS }, () => Array.from({ length: PERIODS }, () => "")),
  labPreferences: {},
  setSelection: (s) => set((state) => {
    // Helpers for dataset keying
    const AI_DS_NAMES = new Set([
      "Artificial Intelligence and Data Science",
      "AI & DS",
      "Artificial Intelligence & Data Science",
    ]);
    const isAidsYear3 = (sel: SelectionState) =>
      !!sel.department && !!sel.year && AI_DS_NAMES.has(sel.department) && (sel.year === "III" || sel.year === "3");
    const datasetKey = (sel: SelectionState) => {
      const dep = sel.department || "";
      const year = sel.year || "";
      const section = isAidsYear3(sel) ? "*" : (sel.section || "");
      return [dep, year, section].join("|");
    };

    const prevSelection = state.selection;
    const prevKey = datasetKey(prevSelection);
    const nextSelection = { ...prevSelection, ...s };
    const nextKey = datasetKey(nextSelection);

    const datasets = { ...state.datasets };

    // Persist current arrays into previous key if we have a meaningful previous selection
    if (prevSelection.department && prevSelection.year) {
      const prevData = datasets[prevKey] || { available: [], selected: [] };
      prevData.available = state.availableSubjects;
      prevData.selected = state.selectedSubjects;
      datasets[prevKey] = prevData;
    }

    // Load or initialize new selection's datasets
    let availableSubjects: Subject[] = [];
    let selectedSubjects: Subject[] = [];
    let labPreferences: LabPrefsMap = {};
    const existing = datasets[nextKey];
    if (existing) {
      availableSubjects = existing.available;
      selectedSubjects = existing.selected;
      labPreferences = existing.prefs || {};
    } else {
      availableSubjects = [];
      selectedSubjects = [];
      datasets[nextKey] = { available: availableSubjects, selected: selectedSubjects, prefs: {} };
    }

    return {
      selection: nextSelection,
      datasets,
      availableSubjects,
      selectedSubjects,
      labPreferences,
    };
  }),
  seedYearDataset: (subjects) => set((state) => {
    // Seed subjects into current selection's dataset
    const datasetKey = (sel: SelectionState) => {
      const dep = sel.department || "";
      const year = sel.year || "";
      const isAIYear3 = (dep === "Artificial Intelligence and Data Science" || dep === "AI & DS" || dep === "Artificial Intelligence & Data Science") && (year === "III" || year === "3");
      const section = isAIYear3 ? "*" : (sel.section || "");
      return [dep, year, section].join("|");
    };
    const key = datasetKey(state.selection);
    const datasets = { ...state.datasets };
    const prev = datasets[key] || { available: [], selected: [], prefs: {} };
    datasets[key] = { available: subjects, selected: subjects, prefs: prev.prefs };
    return { datasets, availableSubjects: subjects, selectedSubjects: subjects };
  }),
  addAvailable: (s) => set((state) => {
    const datasetKey = (sel: SelectionState) => {
      const dep = sel.department || "";
      const year = sel.year || "";
      const section = (dep === "Artificial Intelligence and Data Science" || dep === "AI & DS" || dep === "Artificial Intelligence & Data Science") && (year === "III" || year === "3")
        ? "*"
        : (sel.section || "");
      return [dep, year, section].join("|");
    };
    const key = datasetKey(state.selection);
    const datasets = { ...state.datasets };
    const existing = datasets[key] || { available: [], selected: [], prefs: {} };
    const available = [...(existing.available || []), s];
    datasets[key] = { ...existing, available };
    return { datasets, availableSubjects: available };
  }),
  moveToSelected: (id) => set((state) => {
    const datasetKey = (sel: SelectionState) => {
      const dep = sel.department || "";
      const year = sel.year || "";
      const section = (dep === "Artificial Intelligence and Data Science" || dep === "AI & DS" || dep === "Artificial Intelligence & Data Science") && (year === "III" || year === "3")
        ? "*"
        : (sel.section || "");
      return [dep, year, section].join("|");
    };
    const key = datasetKey(state.selection);
    const datasets = { ...state.datasets };
    const available = state.availableSubjects;
    const selectedNow = state.selectedSubjects;
    const found = available.find((s) => s.id === id);
    if (!found) return {} as any;
    if (selectedNow.some((s) => s.id === id)) return {} as any;
    const selected = [...selectedNow, found];
    const existing = datasets[key] || { available: [], selected: [], prefs: {} };
    datasets[key] = { ...existing, available, selected };
    return { datasets, selectedSubjects: selected };
  }),
  moveToAvailable: (id) => set((state) => {
    const datasetKey = (sel: SelectionState) => {
      const dep = sel.department || "";
      const year = sel.year || "";
      const section = (dep === "Artificial Intelligence and Data Science" || dep === "AI & DS" || dep === "Artificial Intelligence & Data Science") && (year === "III" || year === "3")
        ? "*"
        : (sel.section || "");
      return [dep, year, section].join("|");
    };
    const key = datasetKey(state.selection);
    const datasets = { ...state.datasets };
    const available = state.availableSubjects;
    const selected = state.selectedSubjects.filter((s) => s.id !== id);
    const existing = datasets[key] || { available: [], selected: [], prefs: {} };
    datasets[key] = { ...existing, available, selected };
    return { datasets, selectedSubjects: selected };
  }),
  setSpecial: (flags) => set((state) => ({ special: { ...state.special, ...flags } })),
  setSpecialHoursConfigs: (configs) => set(() => ({ specialHoursConfigs: configs })),
  setSelectedSubjects: (subs) => set((state) => {
    const datasetKey = (sel: SelectionState) => {
      const dep = sel.department || "";
      const year = sel.year || "";
      const section = (dep === "Artificial Intelligence and Data Science" || dep === "AI & DS" || dep === "Artificial Intelligence & Data Science") && (year === "III" || year === "3")
        ? "*"
        : (sel.section || "");
      return [dep, year, section].join("|");
    };
    const key = datasetKey(state.selection);
    const datasets = { ...state.datasets };
    const available = state.availableSubjects;
    const existing = datasets[key] || { available: [], selected: [], prefs: {} };
    datasets[key] = { ...existing, available, selected: subs };
    return { datasets, selectedSubjects: subs };
  }),
  setTimetable: (grid) => set(() => ({ timetable: grid })),
  setLabPreferences: (prefs) => set((state) => {
    const datasetKey = (sel: SelectionState) => {
      const dep = sel.department || "";
      const year = sel.year || "";
      const section = (dep === "Artificial Intelligence and Data Science" || dep === "AI & DS" || dep === "Artificial Intelligence & Data Science") && (year === "III" || year === "3")
        ? "*"
        : (sel.section || "");
      return [dep, year, section].join("|");
    };
    const key = datasetKey(state.selection);
    const datasets = { ...state.datasets };
    const existing = datasets[key] || { available: [], selected: [], prefs: {} };
    const next = { ...existing, prefs };
    datasets[key] = next;
    return { datasets, labPreferences: prefs };
  }),
}));

// Lab preferences
export interface LabPreference {
  morningEnabled?: boolean;
  morningStart?: number; // 1-based period start
  eveningTwoHourStartAt5?: boolean;
  // Optional priority for morning placement. Lower number = higher priority
  priority?: number;
}
export type LabPrefsMap = Record<string, LabPreference>;

// Helpers
export const subjectTotals = (subjects: Subject[]) => {
  // Exclude open elective subjects' individual hours from totals; those are configured separately
  const filtered = subjects.filter((s) => s.type !== 'open elective');
  const total = filtered.reduce((a, s) => a + s.hoursPerWeek, 0);
  const theory = filtered.filter((s) => s.type === "theory").reduce((a, s) => a + s.hoursPerWeek, 0);
  const lab = filtered.filter((s) => s.type === "lab").reduce((a, s) => a + s.hoursPerWeek, 0);
  return { total, theory, lab };
};

export const specialHours = (flags: SpecialFlags) =>
  (flags.seminar ? 2 : 0) + (flags.library ? 1 : 0) + (flags.counselling ? 2 : 0);

export const configuredSpecialHrs = (configs: SpecialHoursConfig[]) =>
  configs.filter(c => c.is_active).reduce((total, config) => total + config.total_hours, 0);

export const SUBJECT_HOUR_LIMIT = 42;