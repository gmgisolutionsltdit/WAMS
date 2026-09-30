import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Search, Users } from "lucide-react";

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  designation: string | null;
  department: string | null;
  photo_url: string | null;
};

const initialsOf = (name?: string | null, email?: string | null) =>
  (name || email || "?").slice(0, 2).toUpperCase();

const TeamProfiles = () => {
  const { user, role } = useAuth();
  const isManager = role === "manager";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      let query = supabase
        .from("profiles")
        .select("id, full_name, email, designation, department, photo_url")
        .order("full_name");
      if (isManager) query = query.contains("reporting_manager_ids", [user.id]);
      else query = query.eq("id", user.id);
      const { data } = await query;
      let result = (data || []) as Row[];
      if (isManager && result.length) {
        const { data: roleRows } = await supabase.rpc("role_labels_for", { _user_ids: result.map((r) => r.id) });
        const managerIds = new Set((roleRows || []).filter((r: any) => r.role === "manager").map((r: any) => r.user_id));
        result = result.filter((r) => managerIds.has(r.id));
      }
      setRows(result);
      setLoading(false);
    })();
  }, [user, isManager]);

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.full_name || "").toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Profile</CardTitle>
          <CardDescription>
            {isManager ? "Directory panels for the managers who report to you." : "Your own directory panel."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isManager && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No profiles found.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((r) => (
                <Link
                  key={r.id}
                  to={`/employees/${r.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={r.photo_url || undefined} />
                    <AvatarFallback>{initialsOf(r.full_name, r.email)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{r.full_name || r.email || "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.designation || "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.department || "—"}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamProfiles;
