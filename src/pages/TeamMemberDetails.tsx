import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { IdCard, ChevronLeft, ChevronRight } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

const PAGE_SIZE = 20;

type DirectoryRow = {
  id: string;
  full_name: string | null;
  designation: string | null;
  personal_email: string | null;
  official_gmail: string | null;
  official_onedrive: string | null;
  phone: string | null;
};

const fmt = (v: string | null) => (v && v.trim() ? v : "—");

/**
 * Read-only, company-wide directory — name, designation and contact details
 * for every employee/manager/admin. Data is read live from each person's own
 * profile (via team_member_directory(), since profiles RLS only lets a
 * viewer see themselves or their management chain) — no duplicate copy is
 * kept, so saving on the Personal Info tab is reflected here automatically.
 */
const TeamMemberDetails = () => {
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchDirectory = useCallback(async () => {
    const { data } = await supabase.rpc("team_member_directory");
    setRows((data || []) as DirectoryRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchDirectory(); }, [fetchDirectory]);
  useRealtimeSubscription("profiles", fetchDirectory, "team-member-details");

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><IdCard className="h-5 w-5" /> Team Member Details</CardTitle>
          <CardDescription>
            Name, designation and contact details for every employee, manager and admin. Read-only —
            each person's own Personal Info tab (or an admin, for anyone) is where this is edited.
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
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Personal Email</TableHead>
                    <TableHead>Official Gmail</TableHead>
                    <TableHead>Official OneDrive</TableHead>
                    <TableHead>Phone Number</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell>{(currentPage - 1) * PAGE_SIZE + i + 1}</TableCell>
                      <TableCell className="font-medium">{fmt(r.full_name)}</TableCell>
                      <TableCell>{fmt(r.designation)}</TableCell>
                      <TableCell>{fmt(r.personal_email)}</TableCell>
                      <TableCell>{fmt(r.official_gmail)}</TableCell>
                      <TableCell>{fmt(r.official_onedrive)}</TableCell>
                      <TableCell>{fmt(r.phone)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {rows.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 pt-3">
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground whitespace-nowrap">Page {currentPage} of {pageCount}</span>
              <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamMemberDetails;
