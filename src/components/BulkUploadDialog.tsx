import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";

interface ParsedRow {
  full_name: string;
  email: string;
  department?: string;
  role?: string;
  employment_type?: string;
}

export function BulkUploadDialog({ onComplete }: { onComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(sheet);

      const parsed: ParsedRow[] = json.map((row: any) => ({
        full_name: row["Full Name"] || row["full_name"] || row["Name"] || row["name"] || "",
        email: row["Email"] || row["email"] || "",
        department: row["Department"] || row["department"] || "",
        role: (row["Role"] || row["role"] || "employee").toLowerCase(),
        employment_type: row["Employment Type"] || row["employment_type"] || "Permanent",
      })).filter((r: ParsedRow) => r.full_name && r.email);

      setRows(parsed);
    };
    reader.readAsBinaryString(file);
  };

  const handleSubmit = async () => {
    if (rows.length === 0) return;
    setUploading(true);

    let successCount = 0;
    for (const row of rows) {
      const newId = crypto.randomUUID();
      const { error: profileErr } = await supabase.from("profiles").insert({
        id: newId, full_name: row.full_name, email: row.email, department: row.department || null,
      });
      if (profileErr) { console.error(profileErr); continue; }

      const validRole = ["admin", "manager", "employee"].includes(row.role || "") ? row.role : "employee";
      await supabase.from("user_roles").insert({ user_id: newId, role: validRole as any });
      successCount++;
    }

    toast.success(`${successCount} of ${rows.length} employees uploaded`);
    setRows([]);
    setOpen(false);
    onComplete();
    setUploading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setRows([]); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Upload className="mr-1 h-4 w-4" /> Bulk Upload</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Bulk Employee Upload</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              Upload CSV or Excel file with columns: <strong>Full Name, Email, Department, Role, Employment Type</strong>
            </p>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>Choose File</Button>
          </div>

          {rows.length > 0 && (
            <>
              <Badge variant="secondary" className="text-sm">{rows.length} records detected</Badge>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 20).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.full_name}</TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>{row.department || "—"}</TableCell>
                      <TableCell><Badge variant="outline">{row.role}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {rows.length > 20 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">...and {rows.length - 20} more</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <Button onClick={handleSubmit} disabled={uploading} className="w-full">
                {uploading ? "Uploading..." : `Upload ${rows.length} Employees`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
