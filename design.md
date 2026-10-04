# SONA TTG (OptiTime) — Next-Gen UI/UX Design Specification & Stitch Blueprint

> **Platform:** Academic Timetable Generation & Resource Management Engine  
> **Target Audience:** College Super Admins, Department HODs & Timetable Coordinators, Faculty Members  
> **Core Constraint:** 6 Days (Mon–Sat) × 7 Periods/day = **42 Hours/week** per section with zero faculty collisions, multi-faculty lab distribution, and open/professional elective concurrency.  
> **Design Language:** Modern Academic SaaS (Linear / Apple macOS Pro / Vercel design aesthetic) with layered glassmorphism, crisp data density, and responsive ergonomics.

---

## 1. Design System & Style Tokens

### 1.1 Color Architecture

```css
/* Color Palette Tokens */
:root {
  /* Surface & Base Canvas (Light Mode) */
  --canvas-bg: #F8FAFC;           /* slate-50 */
  --canvas-subtle: #F1F5F9;       /* slate-100 */
  --card-bg: #FFFFFF;
  --card-border: #E2E8F0;         /* slate-200 */
  --card-border-hover: #CBD5E1;   /* slate-300 */

  /* Text & Typography */
  --text-primary: #0F172A;        /* slate-900 */
  --text-secondary: #475569;      /* slate-600 */
  --text-muted: #94A3B8;          /* slate-400 */

  /* Brand Accents */
  --brand-primary: #4F46E5;       /* Indigo 600 */
  --brand-primary-hover: #4338CA; /* Indigo 700 */
  --brand-glow: rgba(79, 70, 229, 0.15);
  --brand-accent: #06B6D4;        /* Cyan 500 */

  /* Semantic Status Colors */
  --status-success: #10B981;      /* Emerald 500 (Exact 42h) */
  --status-warning: #F59E0B;      /* Amber 500 (Under 42h) */
  --status-danger: #EF4444;       /* Red 500 (Over 42h / Conflict) */
  --status-info: #3B82F6;         /* Blue 500 */

  /* Timetable Subject Category Badges & Cards */
  --cat-theory-bg: rgba(79, 70, 229, 0.08);
  --cat-theory-border: rgba(79, 70, 229, 0.25);
  --cat-theory-text: #4338CA;

  --cat-lab-bg: rgba(6, 182, 212, 0.08);
  --cat-lab-border: rgba(6, 182, 212, 0.25);
  --cat-lab-text: #0891B2;

  --cat-elective-bg: rgba(168, 85, 247, 0.08);
  --cat-elective-border: rgba(168, 85, 247, 0.25);
  --cat-elective-text: #7E22CE;

  --cat-special-bg: rgba(244, 63, 94, 0.08);
  --cat-special-border: rgba(244, 63, 94, 0.25);
  --cat-special-text: #BE123C;

  --cat-break-bg: rgba(241, 245, 249, 0.8);
  --cat-break-border: #E2E8F0;
  --cat-break-text: #64748B;
}

.dark {
  /* Surface & Base Canvas (Dark Mode) */
  --canvas-bg: #090D16;
  --canvas-subtle: #0F172A;
  --card-bg: #111827;
  --card-border: rgba(255, 255, 255, 0.08);
  --card-border-hover: rgba(255, 255, 255, 0.16);

  /* Text & Typography */
  --text-primary: #F8FAFC;
  --text-secondary: #94A3B8;
  --text-muted: #64748B;

  /* Brand Accents */
  --brand-primary: #6366F1;       /* Indigo 500 */
  --brand-primary-hover: #4F46E5;
  --brand-glow: rgba(99, 102, 241, 0.25);

  /* Timetable Subject Category Badges (Dark Mode) */
  --cat-theory-bg: rgba(99, 102, 241, 0.15);
  --cat-theory-border: rgba(99, 102, 241, 0.35);
  --cat-theory-text: #A5B4FC;

  --cat-lab-bg: rgba(6, 182, 212, 0.15);
  --cat-lab-border: rgba(6, 182, 212, 0.35);
  --cat-lab-text: #67E8F9;

  --cat-elective-bg: rgba(168, 85, 247, 0.15);
  --cat-elective-border: rgba(168, 85, 247, 0.35);
  --cat-elective-text: #D8B4FE;

  --cat-special-bg: rgba(244, 63, 94, 0.15);
  --cat-special-border: rgba(244, 63, 94, 0.35);
  --cat-special-text: #FDA4AF;

  --cat-break-bg: rgba(15, 23, 42, 0.6);
  --cat-break-border: rgba(255, 255, 255, 0.05);
  --cat-break-text: #64748B;
}
```

### 1.2 Typography Hierarchy

* **Font Families:**
  * Primary Interface & Numbers: `Inter, -apple-system, system-ui, sans-serif`
  * Headings, Hero Counters & Accent Titles: `Poppins, Montserrat, sans-serif`
  * Timetable Time Labels & Slot Badges: `JetBrains Mono, ui-monospace, monospace`
* **Scale & Font Weights:**
  * **H1 / Page Titles:** `text-2xl` to `text-3xl font-extrabold tracking-tight` (28px–32px, `font-bold` / `font-black`)
  * **H2 / Section Headers:** `text-lg font-bold tracking-tight` (18px–20px)
  * **H3 / Card Titles:** `text-sm font-semibold tracking-normal` (14px–15px)
  * **Table Body / Inputs:** `text-xs font-medium` (12px–13px)
  * **Micro Badges / Slot Times:** `text-[10px]` to `text-[11px] font-mono font-bold tracking-wider uppercase`

### 1.3 Radii & Elevation (Shadows)

* **Corner Radii:**
  * Buttons & Dropdowns: `rounded-xl` (12px)
  * Standard Cards & Metric Blocks: `rounded-2xl` (16px)
  * Hero Dialogs & Floating Modals: `rounded-3xl` (24px)
  * Status Pills & Tags: `rounded-full` (9999px)
* **Shadow Hierarchy:**
  * **Card Rest:** `0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)`
  * **Card Hover:** `0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.05)`
  * **Modal Glass Drop:** `0 25px 50px -12px rgba(15, 23, 42, 0.25)`
  * **Glow State:** `box-shadow: 0 0 20px var(--brand-glow)`

---

## 2. Global Shell & Navigation Architecture

### 2.1 Pinned Left Navigation Rail (Desktop)
* **Width:** 260px (collapsible to 72px icon-rail).
* **Brand Header:**
  * College Monogram + OptiTime logo badge with gradient icon.
  * Active Department Selector dropdown (for multi-department admins).
* **Navigation Links Grouped by Function:**
  * **Core Operations:**
    * ⚡ *Dashboard* (`/admin` or `/super-admin`)
    * 📅 *Generate Studio* (`/admin/generate-review`)
    * 📊 *Live Timetables* (`/current-timetables`)
  * **Curriculum & Staff:**
    * 📚 *Subjects & Syllabi* (`/admin/subjects`)
    * 👨‍🏫 *Faculty Directory* (`/admin/faculty`)
    * 🔬 *Lab Allocation* (`/lab`)
  * **Data & System:**
    * 📥 *Bulk CSV / Excel* (`/csv-upload`)
    * 🔀 *Pull Requests* (`/pull-requests`) [shows dynamic badge with pending count]
    * ⚙️ *Settings* (`/super-admin/settings`)
* **Footer Section:**
  * Light / Dark Mode Toggle switch.
  * User profile preview (Avatar, Name, Role badge `Admin` / `Super Admin`, Logout trigger).

### 2.2 Sticky Contextual Sub-Header
* **Height:** 56px, blur background (`backdrop-blur-md bg-white/80 dark:bg-slate-900/80 border-b`).
* **Components:**
  * Dynamic Breadcrumbs (`Home > Department > Year III > Section A`).
  * Semester indicator pill (`ODD SEMESTER` / `EVEN SEMESTER`).
  * Right utility cluster: Quick search modal shortcut (`Cmd+K`), notification bell, Help documentation link.

---

## 3. Screen-by-Screen Detailed Specifications

### Screen 1: Unified Auth & Fast Role Switcher (`/`)
* **Layout:** Centered floating container on ambient floating mesh background with subtle glow orbs.
* **Header:** Modern college branding, title "Sign in to OptiTime", subtitle "Autonomous Academic Timetable System".
* **Login Form:**
  * Single input for Email / Staff ID with automatic role detection.
  * Password field with eye reveal icon (optional for faculty passwordless flow).
  * Gradient submit button: "Enter Workspace".
* **Interactive Quick Role Cards (Below Form):**
  * Three interactive test tiles with instant hover lift and one-click role simulation:
    1. **Super Admin:** Shield icon, dark slate styling, one-click autofill `admin/admin`.
    2. **Department Admin:** Building icon, indigo border styling, loads HOD workspace.
    3. **Faculty Member:** Graduation cap icon, cyan styling, passwordless direct schedule viewer.

---

### Screen 2: Department Admin Workspace (`/admin`)
* **Top Metric Ribbon (3 Cards):**
  1. *Total Active Subjects:* Large 40px numeric counter with breakdown (Theory / Lab / Elective).
  2. *Faculty Workload:* Count of active professors, avg contact hours per week.
  3. *Timetables Generated:* Published count vs remaining pending sections.
* **Interactive Generation Launcher Card (Primary Action Hero):**
  * **Academic Semester Segmented Control:**
    * Toggle between `Odd Semester` (Years II, III, IV standard curriculum) and `Even Semester` (Open Elective slots on Mon-1, Wed-1, Fri-1, Sat-1/2 + Year IV Project mode).
  * **Multi-Department Selector Grid:** Checkbox cards for each department managed by this admin (e.g. `AI & DS`, `Information Technology`, `Computer Science`).
  * **Launcher Button:** High-contrast Indigo gradient button "Configure & Generate Timetable" with `Zap` icon launching the modal wizard.
* **Quick Tools Grid (2 Columns):**
  * 4 action tiles with dual-tone icons: "Manage Curriculum", "Faculty Allocations", "Lab Reservations", "Bulk CSV Upload".
* **Algorithm Tip Card:** Elegant neutral box highlighting constraint parameters (zero faculty double-booking, 42h mandatory total, afternoon lab grouping).

---

### Screen 3: Timetable Generation Wizard Modal (`GenerateWizardModal`)
* **Form Factor:** Centered `max-w-2xl rounded-3xl` glass modal with step indicator dots.
* **Step 1: Department & Section Target:**
  * Collapsible tree of departments showing Year II, III, IV chips and sections (`A`, `B`, `C`).
  * "Select All" / "Clear All" batch actions.
* **Step 2: Pre-Flight 42-Hour Validation Audit:**
  * Runs real-time calculation of total curriculum hours per section before generation:
    * *Green Card:* Section has exactly **42.0 Hours** assigned (Ready to generate).
    * *Amber Alert Card:* Section has `< 42 Hours` (Under-scheduled, displays missing hour delta).
    * *Red Alert Card:* Section has `> 42 Hours` (Overloaded, highlights offending subjects).
  * Action button: "Proceed to Generation Review Studio" with automatic bypass or edit link.

---

### Screen 4: Timetable Generation Review & Conflict Studio (`/admin/generate-review`)
*This is the flagship interface of the platform.*

```
+-------------------------------------------------------------------------------------------------------+
| Department Tabs: [ AI & DS ] [ Information Tech ]  | Year: [ II ] [ III ] [ IV ] | Section: [ A ] [ B ]|
| Tools: [ Toggle Faculty View ] [ Fullscreen ] [ Export PDF ] [ Export Excel ] [ Publish Timetable ]   |
+-------------------------------------------------------------------------------------------------------+
|  LEFT PANEL (280px)            |  CENTER: 6-DAY x 7-PERIOD INTERACTIVE TIMETABLE MATRIX               |
|                                |                                                                       |
|  [ 42-Hour Live Gauge ]        |  PERIODS: P1 (9:00) | P2 (9:55) | BRK | P3 (11:05) | P4 | LUNCH | P5...|
|  Sec A: [==========] 42/42h OK |  MON:    [  DAA   ]   [  DAA  ]   | |   [  OS   ]    [OS ] | |   [LAB]|
|  Sec B: [========  ] 38/42h !  |  TUE:    [  MATH  ]   [  CNS  ]   | |   [  AI   ]    [AI ] | |   [LAB]|
|                                |  WED:    [  CNS   ]   [  MATH ]   | |   [  DAA  ]    [OS ] | |   [LIB]|
|  [ Special Hours Panel ]       |  THU:    [  AI    ]   [  OS   ]   | |   [  MATH ]    [CNS] | |   [SEM]|
|  - Saturday Seminar (P3-P4)    |  FRI:    [  DAA   ]   [  AI   ]   | |   [  CNS  ]    [DAA] | |   [COUN|
|  - Saturday Library (P5)       |  SAT:    [  OE    ]   [  OE   ]   | |   [  SEM  ]    [SEM] | |   [COUN|
|  - Saturday Counselling (P6-P7)|                                                                       |
|                                |  * Interactive: Drag / tap any cell to swap periods                  |
|  [ Subject Breakdown Legend ]  |  * Conflict detection alerts if faculty is double-booked              |
+-------------------------------------------------------------------------------------------------------+
|  BOTTOM ROSTER: Subject Code | Title | Category | Weekly Hours | Assigned Faculty Name                |
+-------------------------------------------------------------------------------------------------------+
```

* **Interactive Period Cell Specification:**
  * **Card Dimensions:** `min-w-[110px] min-h-[72px] rounded-xl p-2 flex flex-col justify-between`.
  * **Header:** Period time slot badge (`09:00 - 09:55`) + Subject Type pill (`Theory` / `Lab`).
  * **Center:** Course Abbreviation in bold (`14px font-black`) + Course Code (`10px font-mono`).
  * **Footer:** Assigned Professor's name with micro avatar (`11px font-medium truncate`).
* **Interactive Drag & Tap Swap Mode:**
  * Clicking any period activates "Swap Mode" (cell gets indigo highlight ring `ring-2 ring-indigo-500 shadow-lg scale-102`).
  * Selecting a destination period performs an atomic test against the **College-wide Faculty Conflict Engine**.
  * **If conflict detected:** Opens the *Conflict Alert Modal* detailing:
    * *"Faculty Double-Booking Alert: Dr. K. Sharma is already scheduled for CSE-III-B during Thursday Period 3."*
    * Options: "Cancel Swap" or "Force Admin Override".

---

### Screen 5: Subject & Curriculum Manager (`/admin/subjects/:year`)
* **Header:** Year filter tabs (`Year II`, `Year III`, `Year IV`), Search input, Subject Type dropdown, "Add New Subject" button, "Export Excel" button.
* **Curriculum Data Table (`CustomTable`):**
  * Columns:
    1. Checkbox for batch operations.
    2. Course Code (e.g. `U23ADS401`).
    3. Course Title with category pill (Theory, Lab, Professional Elective, Open Elective).
    4. Abbreviation (e.g. `DAA`).
    5. Contact Hours/Week (1–6).
    6. Credits (1–5).
    7. Max Faculty Count (1 for theory, 2–3 for laboratory sessions).
    8. Action buttons (Inline edit drawer trigger, delete confirmation dialog).
* **Slide-over Drawer for Add/Edit Subject:**
  * Replaces cramped modal with a clean 420px right-side drawer.
  * Inputs: Course Code, Full Title, Short Tag, Subject Category picker, Hours, Credits, Parallel Concurrency Group tag (for Elective clustering).

---

### Screen 6: Faculty Directory & Workload Manager (`/admin/faculty`)
* **Filter Bar:** Department selector, search by name/email/specialization, Class Counselor filter.
* **Faculty Directory Cards / Table:**
  * Faculty Name with profile photo/avatar fallback.
  * Designation (`Professor`, `Associate Prof`, `Assistant Prof`).
  * Allocated Subject Badges with Section chips (`DAA (Sec A, B)`, `AI Lab (Sec C)`).
  * Weekly Contact Hours progress bar (target max 18–22 hours).
* **Action Drawer:**
  * Allocate subjects to faculty with section multi-select checkboxes.
  * Assign as Class Counselor for specified section.

---

### Screen 7: Lab Resource & Scheduling Matrix (`/lab`)
* **Two View Modes:**
  1. **Laboratory Inventory:** Card grid of campus computer labs, capacity, workstation counts, installed software licenses, floor, room number.
  2. **Lab Occupancy Schedule Matrix:** Weekly grid showing which department and section occupies the physical laboratory during each period, preventing physical room collisions between departments.

---

### Screen 8: Super Admin Operations Control (`/super-admin`)
* **Executive KPI Ribbon:** Total Departments (e.g. 14), Total Faculty (e.g. 350+), Active Timetables (e.g. 48 classes), Global Syllabi Courses.
* **Department Allocation Card Matrix:**
  * List of all college branches with their respective admin contact, status, and last timetable update timestamp.
* **Audit & Activity Stream:**
  * Chronological log of recent changes (e.g., *"ECE Dept Admin submitted Year III Timetable for review"*).

---

### Screen 9: Timetable Pull Request Review & Visual Diff (`/pull-requests/:id`)
* **Review Interface:**
  * Compares **Current Approved Timetable** vs. **Proposed New Timetable** in a side-by-side or tabbed diff.
  * Highlight changed cells with amber/green diff borders.
  * Conflict audit check verification: Confirms zero cross-department faculty clashes.
  * Decision bar: "Reject with Feedback" (textarea note) or "Approve & Push to Live".

---

### Screen 10: Faculty Schedule Portal (`/faculty`)
* **Hero Profile Banner:** Professor name, department, designation, employee ID, and total teaching contact hours.
* **Personalized Weekly Schedule:**
  * Simplified, high-contrast calendar grid showing exclusively the classes this faculty member is scheduled to teach.
  * Each slot shows: Time, Subject Title, Department, Year, Section, and Room / Lab number.
  * One-click "Sync to Google Calendar / Apple Calendar" (iCal export) and "Download PDF".

---

## 4. UI/UX Critique & Modernization Recommendations

| Current UI State | Problem & Friction | Modern Stitch Redesign Solution |
| :--- | :--- | :--- |
| **Color Scheme Disconnect** | CSS defines Olive theme, but pages use hardcoded Emerald/Teal | Establish a single unified Indigo + Slate + Semantic palette across all components |
| **Timetable Horizontal Overflow** | 10 columns (P1-P7 + 2 Breaks + Lunch) cause horizontal scrolling on laptops | Shrink Break and Lunch columns into slim 32px vertical dividers with micro labels |
| **Multiple Fragmented Navbars** | `Navbar.tsx`, `AdminNavbar.tsx`, `facultyadmin.tsx` have diverging styles | Create one unified, responsive `AppShell` with role-based navigation links and mobile drawer |
| **Modal Fatigue** | Heavy forms for subjects, faculty, and special hours inside small modals | Shift dense forms into modern slide-over Drawers (Sheet component) with clean step progression |
| **Cell Clutter in Grid** | Period cells wrap awkwardly when showing both subject code and faculty | Use structured 3-tier card layout: Slot time at top, Subject in bold middle, Avatar pill at bottom |
| **Hours Diagnostic Visibility** | 42h verification is hidden in side panels | Render a sticky top health banner with per-section progress rings and instant fix triggers |

---

## 5. Master Prompt for Stitch / AI UI Generation

```markdown
Design a next-generation, high-density academic operations and automated timetable generator web platform called "OptiTime (SONA TTG)".

### 1. Aesthetic & Design System:
- Style: Premium modern SaaS inspired by Linear, Apple macOS Pro, and Vercel. 
- Theme: Ultra-clean, dark/light mode support, crisp data density, subtle 1px border lines, glassmorphism panels (backdrop-blur-xl), and refined micro-animations.
- Palette:
  * Light Background: #F8FAFC | Dark Background: #090D16
  * Card Surface: #FFFFFF (Light) | #111827 (Dark)
  * Border Token: #E2E8F0 (Light) | rgba(255, 255, 255, 0.08) (Dark)
  * Brand Primary Accent: Indigo (#4F46E5 to #6366F1)
  * Status Tokens: Emerald (#10B981) for 42h Verified, Amber (#F59E0B) for Under-hours, Red (#EF4444) for Conflict/Overload
  * Timetable Pills: Indigo (Theory), Cyan (Lab), Purple (Elective), Rose (Special/Seminar)
- Typography: Inter for clean numbers, Poppins for bold headers, JetBrains Mono for time slots.
- Border Radius: 12px for inputs/buttons, 16px for cards, 24px for floating dialogs.

### 2. Core Screens to Render:

1. Unified Left-Pinned Navigation Shell:
   - Modern 240px sidebar with college logo monogram, department switcher dropdown, navigation links with active indicators (Dashboard, Generate Studio, Live Timetables, Subjects, Faculty, Labs, Bulk Import, Pull Requests), theme toggle, and profile badge.

2. Admin Command Dashboard (/admin):
   - 3 top KPI summary tiles (Subjects, Faculty, Active Timetables) with subtle gradient glows.
   - Interactive Generator Launcher Box: Odd vs Even Semester switch, multi-department selection matrix, and an "Execute Generator Wizard" button with an electric Zap icon.
   - Quick Action tiles (Curriculum, Faculty, Labs, CSV Import).

3. Timetable Review & Interactive Conflict Studio (/admin/generate-review):
   - Top Header Bar: Department tabs, Year pills (II, III, IV), and Section pills (Sec A, Sec B, Sec C) with instant switching.
   - Action cluster: "Export PDF", "Export Excel", "Fullscreen", and "Publish Schedule".
   - Left Diagnostic Panel:
     * 42-Hour Live Gauge: Section progress bar showing allocated hours vs 42.0h target (Green check for 42h, Amber for <42h).
     * Special Hours summary card (Library, Seminar, Counselling).
   - Flagship 6-Day x 7-Period Interactive Timetable Matrix:
     * Days: Monday to Saturday.
     * Periods: P1 (9:00), P2 (9:55), Slim Break Divider, P3 (11:05), P4 (12:00), Slim Lunch Divider, P5 (1:55), P6 (2:50), Slim Break Divider, P7 (3:55).
     * Period Cards: Rounded tiles showing time slot badge, bold course abbreviation, course code, and professor avatar pill.
     * Interactive States: Resting, Hover, Drag/Tap Active, and Conflicted state (pulsing red border with a double-booking explanation tooltip).
   - Bottom Curriculum Summary Table: Course code, title, category, credit hours, and assigned faculty.

4. 2-Step Generation Wizard Modal:
   - Step 1: Department & Section selector with collapsible tree.
   - Step 2: Pre-generation curriculum health audit with green/amber/red status badges for each section's weekly hour count.

5. Faculty Personal Weekly Schedule (/faculty):
   - Profile header card with faculty designation and total weekly contact hours.
   - High-contrast, personalized weekly schedule grid displaying only the classes taught by this professor across departments and sections, with room and lab designations.

Ensure clean responsive alignment, high legibility, and zero visual clutter.
```
