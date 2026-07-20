import React, { useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, CheckCircle, AlertCircle, RefreshCw, Download } from "lucide-react";

type FacultyRecord = {
  name: string;
  email: string;
  designation: string;
  department: string;
  department_id?: string;
};

type SubjectRecord = {
  code: string;
  name: string;
  abbreviation: string;
  type: string;
  hours_per_week: string;
  credits: string;
  department: string;
  year: string;
};

type MappingRecord = {
  faculty_email: string;
  faculty_name?: string;
  subject_code: string;
  subject_name?: string;
  department: string;
  year: string;
  section: string;
};

export default function UploadCSV() {
  const [activeTab, setActiveTab] = useState<string>("faculty");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);

  // Template generators
  const downloadTemplate = (type: string) => {
    let headers = "";
    let sampleData = "";
    let filename = "";

    if (type === "faculty") {
      headers = "name,email,designation,department\n";
      sampleData = "Dr. J. Akilandeswari,akilandeswari@sonatech.ac.in,Professor & Head,Information Technology\nMr. R. Krishna Prakash,krishnaprakash@sonatech.ac.in,Assistant Professor,Information Technology\n";
      filename = "faculty_template.csv";
    } else if (type === "subjects") {
      headers = "code,name,abbreviation,type,hours_per_week,credits,department,year\n";
      sampleData = "U23IT301,Data Structures,DS,theory,4,4,Information Technology,II\nU23IT305,Data Structures Laboratory,DS LAB,lab,3,2,Information Technology,II\n";
      filename = "subjects_template.csv";
    } else if (type === "mapping") {
      headers = "faculty_email,subject_code,department,year,section\n";
      sampleData = "krishnaprakash@sonatech.ac.in,U23IT301,Information Technology,II,A\nakilandeswari@sonatech.ac.in,U23IT502,Information Technology,III,A\n";
      filename = "faculty_subject_mapping_template.csv";
    }

    const blob = new Blob([headers + sampleData], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to validate UUIDs
  const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

  // Helper to fetch departments and build name mappings
  const getDeptNameToIdMap = async () => {
    const { data: departments, error: deptErr } = await (supabase as any)
      .from('departments')
      .select('id, name');
    if (deptErr) {
      toast.error('Failed to fetch departments from system');
      throw deptErr;
    }
    const nameToDeptId = new Map<string, string>();
    (departments || []).forEach((d: any) => {
      nameToDeptId.set(String(d.name).trim().toLowerCase(), d.id);
    });
    return nameToDeptId;
  };

  // Handle Faculty CSV upload
  const handleFacultyUpload = async (data: FacultyRecord[]) => {
    setIsLoading(true);
    try {
      const nameToDeptId = await getDeptNameToIdMap();
      const distinctDeptValues = Array.from(new Set(data.map((rec) => (rec.department || "").toString().trim()).filter(Boolean)));
      const manualMap = new Map<string, string>();

      for (const val of distinctDeptValues) {
        if (isUuid(val)) continue;
        const key = val.toLowerCase();
        if (!nameToDeptId.has(key)) {
          const input = window.prompt(`Unknown department: "${val}".\nEnter matching department NAME exactly as in system (or leave blank to skip):`, "");
          if (input) {
            const found = nameToDeptId.get(input.trim().toLowerCase());
            if (found) {
              manualMap.set(key, found);
            } else {
              toast.warning(`Department "${input}" not found. Rows for "${val}" will be skipped.`);
            }
          }
        }
      }

      // Check duplicates based on email
      const { data: existing, error: fetchError } = await supabase
        .from("faculty_members")
        .select("email");

      if (fetchError) {
        toast.error("Failed to fetch existing faculty members");
        return;
      }

      const existingEmails = new Set(
        (existing || [])
          .map((r: any) => (r?.email || "").toString().trim().toLowerCase())
          .filter(Boolean)
      );

      // Prepare rows for insertion
      const prepared = data
        .map((rec) => {
          const normalizedEmail = (rec.email || "").toString().trim().toLowerCase();
          const rawDept = (rec.department || "").toString().trim();
          const resolvedDeptId = isUuid(rawDept)
            ? rawDept
            : (nameToDeptId.get(rawDept.toLowerCase()) || manualMap.get(rawDept.toLowerCase()) || "");
          return {
            name: (rec.name || "").toString().trim(),
            email: normalizedEmail ? normalizedEmail : null,
            designation: (rec.designation || "").toString().trim() || null,
            department_id: resolvedDeptId,
          };
        })
        .filter((r) => r.name && r.department_id);

      const invalidCount = data.length - prepared.length;
      const uniqueRecords = prepared.filter(
        (rec) => rec.email ? !existingEmails.has(rec.email) : true
      );
      const duplicateRecords = prepared.filter((rec) =>
        rec.email ? existingEmails.has(rec.email) : false
      );

      let insertedCount = 0;
      if (uniqueRecords.length > 0) {
        const { error: insertError } = await supabase
          .from("faculty_members")
          .insert(uniqueRecords)
          .select('id');

        if (insertError) {
          toast.error("Insert failed: " + insertError.message);
        } else {
          insertedCount += uniqueRecords.length;
          toast.success(`${uniqueRecords.length} new faculty members added successfully!`);
        }
      }

      if (duplicateRecords.length > 0) {
        const proceed = window.confirm(
          `${duplicateRecords.length} duplicate faculty entries found by email. Add them anyway?\n\nNote: This may create duplicate faculty records.`
        );
        if (proceed) {
          const { error: dupInsertError } = await supabase
            .from("faculty_members")
            .insert(duplicateRecords)
            .select('id');
          if (dupInsertError) {
            toast.error(`Failed to add duplicates: ${dupInsertError.message}`);
          } else {
            insertedCount += duplicateRecords.length;
            toast.success(`${duplicateRecords.length} duplicates added.`);
          }
        } else {
          toast.warning(`${duplicateRecords.length} duplicate entries skipped.`);
        }
      }

      if (insertedCount > 0) {
        window.dispatchEvent(new CustomEvent("faculty-import:inserted", { detail: { insertedCount } }));
      }
      if (invalidCount > 0) {
        toast.warning(`${invalidCount} rows skipped due to invalid department mapping.`);
      }
    } catch (e: any) {
      toast.error("An error occurred during faculty import: " + (e.message || e));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Subjects CSV upload
  const handleSubjectsUpload = async (data: SubjectRecord[]) => {
    setIsLoading(true);
    try {
      const nameToDeptId = await getDeptNameToIdMap();
      const distinctDeptValues = Array.from(new Set(data.map((rec) => (rec.department || "").toString().trim()).filter(Boolean)));
      const manualMap = new Map<string, string>();

      for (const val of distinctDeptValues) {
        if (isUuid(val)) continue;
        const key = val.toLowerCase();
        if (!nameToDeptId.has(key)) {
          const input = window.prompt(`Unknown department: "${val}".\nEnter matching department NAME exactly as in system (or leave blank to skip):`, "");
          if (input) {
            const found = nameToDeptId.get(input.trim().toLowerCase());
            if (found) {
              manualMap.set(key, found);
            } else {
              toast.warning(`Department "${input}" not found. Rows for "${val}" will be skipped.`);
            }
          }
        }
      }

      // Fetch existing subjects to check duplicates by code
      const { data: existing, error: fetchError } = await supabase
        .from("subjects")
        .select("code, department_id");

      if (fetchError) {
        toast.error("Failed to fetch existing subjects list");
        return;
      }

      // Create a set of composite keys (code-deptId) for duplicate checking
      const existingSubjectKeys = new Set(
        (existing || [])
          .map((r: any) => `${(r.code || "").toString().trim().toLowerCase()}-${r.department_id}`)
          .filter(Boolean)
      );

      // Prepare rows for insertion
      const prepared = data
        .map((rec) => {
          const rawDept = (rec.department || "").toString().trim();
          const resolvedDeptId = isUuid(rawDept)
            ? rawDept
            : (nameToDeptId.get(rawDept.toLowerCase()) || manualMap.get(rawDept.toLowerCase()) || "");

          const hours = parseInt(rec.hours_per_week) || 3;
          const credits = parseInt(rec.credits) || 3;
          const typeNormalized = (rec.type || "").toString().trim().toLowerCase();
          const finalType = typeNormalized.includes("lab") || typeNormalized.includes("practical") ? "lab" : "theory";

          return {
            code: (rec.code || "").toString().trim().toUpperCase() || null,
            name: (rec.name || "").toString().trim(),
            abbreviation: (rec.abbreviation || "").toString().trim().toUpperCase() || null,
            type: finalType,
            hours_per_week: hours,
            credits: credits,
            department_id: resolvedDeptId,
            year: (rec.year || "").toString().trim() || "II",
          };
        })
        .filter((r) => r.name && r.department_id);

      const invalidCount = data.length - prepared.length;
      const uniqueRecords = prepared.filter(
        (rec) => rec.code ? !existingSubjectKeys.has(`${rec.code.toLowerCase()}-${rec.department_id}`) : true
      );
      const duplicateRecords = prepared.filter((rec) =>
        rec.code ? existingSubjectKeys.has(`${rec.code.toLowerCase()}-${rec.department_id}`) : false
      );

      let insertedCount = 0;
      if (uniqueRecords.length > 0) {
        const { error: insertError } = await supabase
          .from("subjects")
          .insert(uniqueRecords)
          .select('id');

        if (insertError) {
          toast.error("Insert failed: " + insertError.message);
        } else {
          insertedCount += uniqueRecords.length;
          toast.success(`${uniqueRecords.length} subjects added successfully!`);
        }
      }

      if (duplicateRecords.length > 0) {
        const proceed = window.confirm(
          `${duplicateRecords.length} duplicate subject codes found. Add them anyway?\n\nNote: This may create duplicate subjects in the same department.`
        );
        if (proceed) {
          const { error: dupInsertError } = await supabase
            .from("subjects")
            .insert(duplicateRecords)
            .select('id');
          if (dupInsertError) {
            toast.error(`Failed to add duplicates: ${dupInsertError.message}`);
          } else {
            insertedCount += duplicateRecords.length;
            toast.success(`${duplicateRecords.length} duplicates added.`);
          }
        } else {
          toast.warning(`${duplicateRecords.length} duplicate entries skipped.`);
        }
      }

      if (insertedCount > 0) {
        window.dispatchEvent(new CustomEvent("subjects-import:inserted", { detail: { insertedCount } }));
      }
      if (invalidCount > 0) {
        toast.warning(`${invalidCount} rows skipped due to missing subject names or departments.`);
      }
    } catch (e: any) {
      toast.error("An error occurred during subject import: " + (e.message || e));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Faculty-Subject Mapping CSV upload
  const handleMappingUpload = async (data: MappingRecord[]) => {
    setIsLoading(true);
    try {
      const nameToDeptId = await getDeptNameToIdMap();
      
      // Fetch all faculty members and subjects to map names/emails/codes to ids
      const [facResult, subjResult] = await Promise.all([
        supabase.from("faculty_members").select("id, name, email, department_id"),
        supabase.from("subjects").select("id, name, code, department_id")
      ]);

      if (facResult.error || subjResult.error) {
        toast.error("Failed to load reference data (faculty/subjects)");
        return;
      }

      const facultyList = facResult.data || [];
      const subjectsList = subjResult.data || [];

      // Create lookup maps
      // Lookup faculty by email
      const facultyByEmailMap = new Map<string, any>();
      // Lookup faculty by name (lowercase)
      const facultyByNameMap = new Map<string, any>();
      facultyList.forEach((f) => {
        if (f.email) facultyByEmailMap.set(f.email.trim().toLowerCase(), f);
        facultyByNameMap.set(f.name.trim().toLowerCase(), f);
      });

      // Lookup subject by code
      const subjectByCodeMap = new Map<string, any>();
      // Lookup subject by name (lowercase)
      const subjectByNameMap = new Map<string, any>();
      subjectsList.forEach((s) => {
        if (s.code) subjectByCodeMap.set(s.code.trim().toUpperCase(), s);
        subjectByNameMap.set(s.name.trim().toLowerCase(), s);
      });

      // Prepare rows for mapping insert
      const preparedMappings: any[] = [];
      const skippedRows: string[] = [];

      data.forEach((rec, index) => {
        const rawDept = (rec.department || "").toString().trim();
        const resolvedDeptId = isUuid(rawDept)
          ? rawDept
          : nameToDeptId.get(rawDept.toLowerCase()) || "";

        if (!resolvedDeptId) {
          skippedRows.push(`Row ${index + 2}: Department "${rawDept}" not found.`);
          return;
        }

        // Find faculty member
        let resolvedFaculty: any = null;
        const rawEmail = (rec.faculty_email || "").toString().trim().toLowerCase();
        if (rawEmail && facultyByEmailMap.has(rawEmail)) {
          resolvedFaculty = facultyByEmailMap.get(rawEmail);
        } else if (rec.faculty_name) {
          const rawName = rec.faculty_name.toString().trim().toLowerCase();
          if (facultyByNameMap.has(rawName)) {
            resolvedFaculty = facultyByNameMap.get(rawName);
          }
        }

        if (!resolvedFaculty) {
          skippedRows.push(`Row ${index + 2}: Faculty "${rec.faculty_email || rec.faculty_name || 'unknown'}" not found.`);
          return;
        }

        // Find subject
        let resolvedSubject: any = null;
        const rawCode = (rec.subject_code || "").toString().trim().toUpperCase();
        if (rawCode && subjectByCodeMap.has(rawCode)) {
          resolvedSubject = subjectByCodeMap.get(rawCode);
        } else if (rec.subject_name) {
          const rawSubName = rec.subject_name.toString().trim().toLowerCase();
          if (subjectByNameMap.has(rawSubName)) {
            resolvedSubject = subjectByNameMap.get(rawSubName);
          }
        }

        if (!resolvedSubject) {
          skippedRows.push(`Row ${index + 2}: Subject "${rec.subject_code || rec.subject_name || 'unknown'}" not found.`);
          return;
        }

        preparedMappings.push({
          faculty_id: resolvedFaculty.id,
          subject_id: resolvedSubject.id,
          department_id: resolvedDeptId,
          year: (rec.year || "").toString().trim() || "II",
          section: (rec.section || "A").toString().trim().toUpperCase()
        });
      });

      // Deduplicate inside the database
      const { data: existingMappings, error: mappingFetchErr } = await supabase
        .from("faculty_subject_assignments")
        .select("faculty_id, subject_id, year, section");

      if (mappingFetchErr) {
        toast.error("Failed to load existing faculty mappings");
        return;
      }

      const existingMappingKeys = new Set(
        (existingMappings || []).map((m: any) => `${m.faculty_id}-${m.subject_id}-${m.year}-${m.section.toUpperCase()}`)
      );

      const uniqueMappings = preparedMappings.filter((m) => {
        const key = `${m.faculty_id}-${m.subject_id}-${m.year}-${m.section}`;
        return !existingMappingKeys.has(key);
      });

      const duplicateCount = preparedMappings.length - uniqueMappings.length;

      let insertedCount = 0;
      if (uniqueMappings.length > 0) {
        const { error: mappingInsertErr } = await supabase
          .from("faculty_subject_assignments")
          .insert(uniqueMappings)
          .select('id');

        if (mappingInsertErr) {
          toast.error("Mapping import failed: " + mappingInsertErr.message);
        } else {
          insertedCount += uniqueMappings.length;
          toast.success(`${uniqueMappings.length} faculty-subject mappings assigned successfully!`);
        }
      } else if (preparedMappings.length > 0 && duplicateCount === preparedMappings.length) {
        toast.info("All mappings from CSV already exist in the system.");
      }

      if (duplicateCount > 0 && uniqueMappings.length > 0) {
        toast.warning(`${duplicateCount} duplicate mapping assignments were skipped.`);
      }

      if (skippedRows.length > 0) {
        console.warn("Skipped rows summary:", skippedRows);
        toast.error(`${skippedRows.length} rows skipped due to missing references. Check console for details.`);
      }
    } catch (e: any) {
      toast.error("An error occurred during mapping import: " + (e.message || e));
    } finally {
      setIsLoading(false);
    }
  };

  // Main file handler
  const handleFile = (file: File) => {
    if (!file) return;

    setIsLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      error: (err) => {
        toast.error("Error parsing CSV: " + err.message);
        setIsLoading(false);
      },
      complete: async (results) => {
        const rows = results.data;
        if (!rows || rows.length === 0) {
          toast.error("CSV file is empty.");
          setIsLoading(false);
          return;
        }

        if (activeTab === "faculty") {
          await handleFacultyUpload(rows as FacultyRecord[]);
        } else if (activeTab === "subjects") {
          await handleSubjectsUpload(rows as SubjectRecord[]);
        } else if (activeTab === "mapping") {
          await handleMappingUpload(rows as MappingRecord[]);
        }
      }
    });
  };

  // Drag and drop events
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => {
    setDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const triggerUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = (e: any) => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0]);
      }
    };
    input.click();
  };

  return (
    <div className="w-full space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 border-b border-border/60 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Course Data Bulk Import
        </h1>
        <p className="text-muted-foreground text-sm">
          Import your faculty, subjects, and assignments in bulk using CSV files. Download templates to get started.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="grid grid-cols-3 p-1 bg-muted rounded-xl w-full max-w-md">
          <TabsTrigger value="faculty" className="rounded-lg font-bold text-xs md:text-sm py-2">
            Faculty
          </TabsTrigger>
          <TabsTrigger value="subjects" className="rounded-lg font-bold text-xs md:text-sm py-2">
            Subjects
          </TabsTrigger>
          <TabsTrigger value="mapping" className="rounded-lg font-bold text-xs md:text-sm py-2">
            Assignments
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Faculty Import */}
        <TabsContent value="faculty">
          <Card className="border border-border/80 shadow-md rounded-2xl bg-card overflow-hidden">
            <CardHeader className="bg-muted/10 border-b border-border/30 pb-4">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <CardTitle className="text-lg font-extrabold text-foreground flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-500" />
                    Faculty Import
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    Upload your faculty members list. The system resolves department names automatically.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => downloadTemplate("faculty")}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5 h-8 text-xs font-bold rounded-lg border-input hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" />
                  Template
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {/* CSV Columns Info */}
              <div className="bg-muted/20 border border-border/40 rounded-xl p-4 text-xs space-y-2">
                <p className="font-bold text-muted-foreground">Required CSV Columns:</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">name</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">email</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">designation</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">department</code>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Subjects Import */}
        <TabsContent value="subjects">
          <Card className="border border-border/80 shadow-md rounded-2xl bg-card overflow-hidden">
            <CardHeader className="bg-muted/10 border-b border-border/30 pb-4">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <CardTitle className="text-lg font-extrabold text-foreground flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-500" />
                    Subjects Import
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    Upload your subjects list. The system validates codes and type values.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => downloadTemplate("subjects")}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5 h-8 text-xs font-bold rounded-lg border-input hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" />
                  Template
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {/* CSV Columns Info */}
              <div className="bg-muted/20 border border-border/40 rounded-xl p-4 text-xs space-y-2">
                <p className="font-bold text-muted-foreground">Required CSV Columns:</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">code</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">name</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">abbreviation</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">type</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">hours_per_week</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">credits</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">department</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">year</code>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  * Note: <code>type</code> should be <code>theory</code> or <code>lab</code>. <code>year</code> should be <code>I</code>, <code>II</code>, <code>III</code>, or <code>IV</code>.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Mapping Import */}
        <TabsContent value="mapping">
          <Card className="border border-border/80 shadow-md rounded-2xl bg-card overflow-hidden">
            <CardHeader className="bg-muted/10 border-b border-border/30 pb-4">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <CardTitle className="text-lg font-extrabold text-foreground flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-500" />
                    Faculty Subject Mapping
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    Assign subjects to faculty members for specific departments, years, and sections.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => downloadTemplate("mapping")}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5 h-8 text-xs font-bold rounded-lg border-input hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" />
                  Template
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {/* CSV Columns Info */}
              <div className="bg-muted/20 border border-border/40 rounded-xl p-4 text-xs space-y-2">
                <p className="font-bold text-muted-foreground">Required CSV Columns:</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">faculty_email</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">subject_code</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">department</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">year</code>
                  <code className="px-2 py-0.5 rounded bg-background border border-border text-foreground font-mono font-bold">section</code>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  * Note: Mappings will only be imported if the faculty email and subject code exist in the system.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={triggerUpload}
        className={`
          flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all duration-300 min-h-[220px] bg-card
          ${dragOver 
            ? "border-emerald-500 bg-emerald-500/[0.03] scale-[0.98] shadow-md shadow-emerald-500/5" 
            : "border-border hover:border-muted-foreground/35 hover:bg-muted/10 hover:shadow-sm"
          }
        `}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-10 w-10 text-emerald-500 animate-spin" />
            <p className="font-bold text-foreground">Processing CSV file...</p>
            <p className="text-xs text-muted-foreground">Validating and writing to database.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-muted border border-border/80 rounded-2xl">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="font-bold text-foreground">
              Drag & drop your CSV file here, or <span className="text-emerald-600 hover:text-emerald-500 underline underline-offset-4">browse</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Only <code>.csv</code> files are supported. Maximum size 5MB.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
