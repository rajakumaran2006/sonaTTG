import React, { useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, AlertTriangle, CheckCircle } from "lucide-react";

type CSVRecord = {
  id: string;
  name: string;
  email: string;
};

export default function CSVUpload() {
  const [duplicates, setDuplicates] = useState<CSVRecord[]>([]);
  const [parsedData, setParsedData] = useState<CSVRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableName, setTableName] = useState("records");

  const handleFile = async (file: File) => {
    setLoading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data: CSVRecord[] = results.data as CSVRecord[];
        setParsedData(data);

        // Fetch existing rows to check for duplicates
        const { data: existing, error } = await supabase
          .from(tableName)
          .select("email");

        if (error) {
          toast.error("Database fetch failed: " + error.message);
          setLoading(false);
          return;
        }

        const existingEmails = new Set(existing?.map((r: any) => r.email));
        const duplicatesFound = data.filter((r) => existingEmails.has(r.email));

        if (duplicatesFound.length > 0) {
          toast.warning(`${duplicatesFound.length} duplicates found`);
          setDuplicates(duplicatesFound);
        } else {
          await insertData(data);
        }

        setLoading(false);
      },
    });
  };

  const insertData = async (data: CSVRecord[]) => {
    const { error } = await supabase.from(tableName).insert(data);

    if (error) {
      toast.error("Insert failed: " + error.message);
    } else {
      toast.success("Data inserted successfully!");
      setParsedData([]);
    }
  };

  const handleDuplicateApproval = async () => {
    const renamed = duplicates.map((d) => ({
      ...d,
      email: `${d.email.split("@")[0]}_copy@${d.email.split("@")[1]}`,
    }));
    await insertData(renamed);
    setDuplicates([]);
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            CSV Upload to Supabase
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="table-name">Table Name</Label>
            <Input
              id="table-name"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="Enter table name (e.g., records, faculty_members)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-upload">CSV File</Label>
            <Input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={(e) => e.target.files && handleFile(e.target.files[0])}
              className="cursor-pointer"
            />
            <p className="text-sm text-muted-foreground">
              Upload a CSV file with columns: id, name, email
            </p>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
              Processing...
            </div>
          )}

          {parsedData.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                {parsedData.length} records parsed successfully
              </div>
            </div>
          )}

          {duplicates.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  {duplicates.length} Duplicates Found — Review
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Duplicate Entries Found</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    The following entries already exist in the database:
                  </p>
                  <div className="max-h-60 overflow-y-auto border rounded-md">
                    <div className="p-4 space-y-2">
                      {duplicates.map((d, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{d.name}</span>
                          <span className="text-muted-foreground">({d.email})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => setDuplicates([])} variant="ghost">
                      Cancel
                    </Button>
                    <Button onClick={handleDuplicateApproval}>
                      Add with modified names
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
