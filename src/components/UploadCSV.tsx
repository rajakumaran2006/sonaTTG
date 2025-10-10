import React from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type FacultyRecord = {
  name: string;
  email: string;
  designation: string;
  department_id: string;
  department?: string;
  year: string;
  sections: string;
};

export default function UploadCSV() {
  const handleFile = async (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data: FacultyRecord[] = results.data as FacultyRecord[];

        // Load departments to resolve department_id values that are not UUIDs
        const { data: departments, error: deptErr } = await (supabase as any)
          .from('departments')
          .select('id, name');
        if (deptErr) {
          toast.error('Failed to fetch departments');
          return;
        }
        const nameToDeptId = new Map<string, string>();
        (departments || []).forEach((d: any) => nameToDeptId.set(String(d.name).trim().toLowerCase(), d.id));
        const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

        // Collect raw department values to resolve and allow interactive mapping for unknowns
        const distinctDeptValues = Array.from(new Set((data || []).map((rec) => (rec.department_id || rec.department || "").toString().trim()).filter(Boolean)));
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

        // Check duplicates based on email (from faculty_members)
        const { data: existing, error: fetchError } = await supabase
          .from("faculty_members")
          .select("email");

        if (fetchError) {
          toast.error("Failed to fetch existing faculty");
          return;
        }

        const existingEmails = new Set(
          (existing || [])
            .map((r: any) => (r?.email || "").toString().trim().toLowerCase())
            .filter(Boolean)
        );

        // Prepare clean rows for insertion
        const prepared = (data || [])
          .map((rec) => {
            const normalizedEmail = (rec.email || "").toString().trim().toLowerCase();
            const rawDept = (rec.department_id || rec.department || "").toString().trim();
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
          // basic validation: require name and department_id; email optional but used for dedupe
          .filter((r) => r.name && r.department_id);

        // Track invalid rows for feedback
        const invalidCount = (data || []).length - prepared.length;

        const uniqueRecords = prepared.filter(
          (rec) => rec.email ? !existingEmails.has(rec.email) : true
        );
        const duplicateRecords = prepared.filter((rec) =>
          rec.email ? existingEmails.has(rec.email) : false
        );

        // Insert only unique ones
        let insertedCount = 0;
        if (uniqueRecords.length > 0) {
          const { error: insertError } = await supabase
            .from("faculty_members")
            .insert(uniqueRecords)
            .select('id');

          if (insertError) {
            toast.error("Insert failed");
          } else {
            insertedCount += uniqueRecords.length;
            toast.success(`${uniqueRecords.length} faculty added!`);
          }
        }

        // Handle duplicates: ask whether to add them anyway
        if (duplicateRecords.length > 0) {
          const proceed = window.confirm(
            `${duplicateRecords.length} duplicate entr${duplicateRecords.length === 1 ? 'y' : 'ies'} found by email. Add them anyway?\n\nNote: This may create multiple records with the same email.`
          );
          if (proceed) {
            const { error: dupInsertError } = await supabase
              .from("faculty_members")
              .insert(duplicateRecords)
              .select('id');
            if (dupInsertError) {
              toast.error(`Failed to add duplicates: ${dupInsertError.message || ''}`.trim());
            } else {
              insertedCount += duplicateRecords.length;
              toast.success(`${duplicateRecords.length} duplicates added`);
            }
          } else {
            toast.warning(
              `${duplicateRecords.length} duplicate entr${duplicateRecords.length === 1 ? 'y' : 'ies'} skipped.`
            );
          }
        }

        // Notify the app to refresh faculty list if anything was inserted
        if (insertedCount > 0) {
          window.dispatchEvent(new CustomEvent("faculty-import:inserted", { detail: { insertedCount } }));
        }

        // Inform about skipped invalid rows
        if (invalidCount > 0) {
          toast.warning(`${invalidCount} row${invalidCount === 1 ? '' : 's'} skipped due to invalid department`);
        }
      },
    });
  };

  const handleUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = (e: any) => handleFile(e.target.files[0]);
    input.click();
  };

  return (
    <button
      onClick={handleUpload}
      className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md shadow"
    >
      Import
    </button>
  );
}


