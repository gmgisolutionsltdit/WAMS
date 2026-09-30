import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Users } from "lucide-react";

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

/** Employee and manager roles both see only their own directory panel here. */
const TeamProfiles = () => {
  const { user } = useAuth();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, designation, department, photo_url")
        .eq("id", user.id)
        .maybeSingle();
      setRow((data as Row) || null);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Profile</CardTitle>
          <CardDescription>Your own directory panel.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !row ? (
            <p className="text-sm text-muted-foreground text-center py-8">Profile not found.</p>
          ) : (
            <Link
              to={`/employees/${row.id}`}
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors max-w-sm"
            >
              <Avatar className="h-12 w-12">
                <AvatarImage src={row.photo_url || undefined} />
                <AvatarFallback>{initialsOf(row.full_name, row.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-semibold truncate">{row.full_name || row.email || "—"}</div>
                <div className="text-xs text-muted-foreground truncate">{row.designation || "—"}</div>
                <div className="text-xs text-muted-foreground truncate">{row.department || "—"}</div>
              </div>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamProfiles;
