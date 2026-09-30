import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { IdCard } from "lucide-react";

type DirectoryRow = {
  id: string;
  full_name: string | null;
  designation: string | null;
  personal_email: string | null;
  official_gmail: string | null;
  official_onedrive: string | null;
  phone: string | null;
  date_of_birth: string | null;
  national_id: string | null;
  passport_number: string | null;
  birth_reg_number: string | null;
  blood_group: string | null;
  religion: string | null;
  father_name: string | null;
  mother_name: string | null;
  marital_status: string | null;
  spouse_name: string | null;
  children_count: number | null;
  ongoing_education: string | null;
  present_address: string | null;
  permanent_address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_swift_code: string | null;
  bank_routing_number: string | null;
};

const COLUMNS: { key: keyof DirectoryRow; label: string; date?: boolean }[] = [
  { key: "full_name", label: "Employee Name" },
  { key: "designation", label: "Designation" },
  { key: "personal_email", label: "Personal Email" },
  { key: "official_gmail", label: "Official Gmail" },
  { key: "official_onedrive", label: "Official OneDrive" },
  { key: "phone", label: "Phone Number" },
  { key: "date_of_birth", label: "Date of Birth", date: true },
  { key: "national_id", label: "National ID Number" },
  { key: "passport_number", label: "Passport Number" },
  { key: "birth_reg_number", label: "Birth Registration Number" },
  { key: "blood_group", label: "Blood Group" },
  { key: "religion", label: "Religion" },
  { key: "father_name", label: "Father's Name" },
  { key: "mother_name", label: "Mother's Name" },
  { key: "marital_status", label: "Marital Status" },
  { key: "spouse_name", label: "Spouse's Name" },
  { key: "children_count", label: "Number of Children" },
  { key: "ongoing_education", label: "Ongoing Education / Studies" },
  { key: "present_address", label: "Present Address" },
  { key: "permanent_address", label: "Permanent Address" },
  { key: "emergency_contact_name", label: "Emergency Contact Name" },
  { key: "emergency_contact_phone", label: "Emergency Contact Mobile" },
  { key: "emergency_contact_relationship", label: "Emergency Contact Relationship" },
  { key: "bank_account_name", label: "Bank Account Name" },
  { key: "bank_account_number", label: "Bank Account Number" },
  { key: "bank_name", label: "Bank Name" },
  { key: "bank_branch", label: "Bank Branch" },
  { key: "bank_swift_code", label: "SWIFT Code" },
  { key: "bank_routing_number", label: "Routing Number" },
];

const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

/**
 * Read-only, company-wide directory — every field from the Personal Info
 * tab, for every employee/manager/admin, laid out row-per-person /
 * column-per-field like a spreadsheet export. No filters. Editing happens
 * on each person's own Personal Info tab (self, or an admin editing
 * anyone); this page only displays the result, the same for every viewer.
 */
const TeamMemberDetails = () => {
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.rpc("team_member_directory");
      setRows((data || []) as DirectoryRow[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><IdCard className="h-5 w-5" /> Team Member Details</CardTitle>
          <CardDescription>
            Full personal information for every employee, manager and admin. Read-only — each person's own
            Personal Info tab (or an admin, for anyone) is where this is edited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No team members found.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">SL. No.</TableHead>
                    {COLUMNS.map((c) => (
                      <TableHead key={c.key} className="whitespace-nowrap">{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell>{i + 1}</TableCell>
                      {COLUMNS.map((c) => (
                        <TableCell key={c.key} className="whitespace-nowrap">
                          {c.date && r[c.key] ? format(new Date(r[c.key] as string), "MMM d, yyyy") : fmt(r[c.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamMemberDetails;
