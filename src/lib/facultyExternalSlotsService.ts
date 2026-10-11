import { supabase } from "@/integrations/supabase/client";

export interface ExternalFacultySlot {
  id: string;
  faculty_id: string;
  faculty_name?: string;
  department_name: string;      // e.g. "Information Technology", "AIDS", "CSE"
  department_id?: string;
  subject_name: string;         // e.g. "Software Engineering", "Mathematics"
  subject_code?: string;        // e.g. "CS8494", "MA3354"
  year: string;                 // e.g. "II", "III", "IV"
  section: string;              // e.g. "A", "B", "C"
  day: number;                  // 0..5 (0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat)
  period: number;               // 0..6 (0=P1, 1=P2, ..., 6=P7)
  semester_type: 'odd' | 'even';
  is_lab?: boolean;
  created_at: string;
  updated_at?: string;
}

const STORAGE_KEY = 'optitime_external_faculty_slots';

/**
 * Loads all cached external faculty slots from localStorage.
 */
function getLocalExternalSlots(): ExternalFacultySlot[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Failed to parse local external faculty slots:', e);
    return [];
  }
}

/**
 * Saves external faculty slots to localStorage.
 */
function setLocalExternalSlots(slots: ExternalFacultySlot[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch (e) {
    console.warn('Failed to save local external faculty slots:', e);
  }
}

/**
 * Syncs external faculty slots from Supabase backend (if available).
 */
async function syncFromSupabase(): Promise<ExternalFacultySlot[] | null> {
  try {
    // Attempt to read from department_settings break_periods or metadata
    const { data, error } = await (supabase as any)
      .from('department_settings')
      .select('break_periods')
      .limit(1);

    if (error || !data || data.length === 0) return null;

    const bp = data[0]?.break_periods;
    if (bp && Array.isArray(bp.external_faculty_slots)) {
      return bp.external_faculty_slots as ExternalFacultySlot[];
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Syncs external faculty slots to Supabase backend in the background.
 */
async function syncToSupabase(slots: ExternalFacultySlot[]): Promise<void> {
  try {
    const { data: existingRows } = await (supabase as any)
      .from('department_settings')
      .select('id, department_id, break_periods')
      .limit(1);

    if (existingRows && existingRows.length > 0) {
      const row = existingRows[0];
      const bp = typeof row.break_periods === 'object' && row.break_periods !== null
        ? row.break_periods
        : {};
      bp.external_faculty_slots = slots;

      await (supabase as any)
        .from('department_settings')
        .update({ break_periods: bp })
        .eq('id', row.id);
    }
  } catch (e) {
    // Non-blocking background sync failure is tolerated
    console.warn('Backend sync for external faculty slots failed (local copy retained):', e);
  }
}

/**
 * Retrieves all cross-department external slots, optionally filtered by facultyId and semesterType.
 */
export async function getExternalFacultySlots(
  facultyId?: string,
  semesterType?: 'odd' | 'even'
): Promise<ExternalFacultySlot[]> {
  let allSlots = getLocalExternalSlots();

  // Background sync check
  try {
    const remoteSlots = await syncFromSupabase();
    if (remoteSlots && remoteSlots.length > 0) {
      // Merge remote and local by ID
      const map = new Map<string, ExternalFacultySlot>();
      remoteSlots.forEach(s => map.set(s.id, s));
      allSlots.forEach(s => map.set(s.id, s));
      allSlots = Array.from(map.values());
      setLocalExternalSlots(allSlots);
    }
  } catch (_) {}

  return allSlots.filter(s => {
    if (facultyId && s.faculty_id !== facultyId) return false;
    if (semesterType && s.semester_type !== semesterType) return false;
    return true;
  });
}

/**
 * Adds or updates a cross-department external slot for a faculty member.
 * This does NOT alter the original class timetable grid.
 */
export async function saveExternalFacultySlot(
  slotData: Omit<ExternalFacultySlot, 'id' | 'created_at'> & { id?: string }
): Promise<ExternalFacultySlot> {
  const allSlots = getLocalExternalSlots();
  const id = slotData.id || `ext_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();

  const slot: ExternalFacultySlot = {
    ...slotData,
    id,
    created_at: now,
    updated_at: now,
  };

  const existingIndex = allSlots.findIndex(s => s.id === id);
  if (existingIndex >= 0) {
    allSlots[existingIndex] = slot;
  } else {
    // If there's an existing assignment at the same faculty, day, period, and semester, replace it
    const clashIndex = allSlots.findIndex(s =>
      s.faculty_id === slot.faculty_id &&
      s.day === slot.day &&
      s.period === slot.period &&
      s.semester_type === slot.semester_type
    );
    if (clashIndex >= 0) {
      allSlots[clashIndex] = slot;
    } else {
      allSlots.push(slot);
    }
  }

  setLocalExternalSlots(allSlots);
  syncToSupabase(allSlots).catch(() => {});

  return slot;
}

/**
 * Removes a cross-department external slot by ID.
 */
export async function deleteExternalFacultySlot(slotId: string): Promise<boolean> {
  const allSlots = getLocalExternalSlots();
  const filtered = allSlots.filter(s => s.id !== slotId);
  setLocalExternalSlots(filtered);
  syncToSupabase(filtered).catch(() => {});
  return true;
}
