import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Pin } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

const PRI_COLORS: Record<string, string> = {
  low: "bg-muted text-foreground",
  normal: "bg-primary text-primary-foreground",
  high: "bg-warning text-white",
  critical: "bg-destructive text-white",
};

const NoticeBoardWidget = () => {
  const [notices, setNotices] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("notices").select("*").eq("is_active", true).order("pinned", { ascending: false }).order("published_at", { ascending: false }).limit(4)
      .then(({ data }) => setNotices(data || []));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" />Notice Board</span>
          <Link to="/notices" className="text-xs text-primary hover:underline">View all</Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {notices.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No active notices</p>
        ) : (
          <div className="space-y-3">
            {notices.map(n => (
              <div key={n.id} className="border-l-4 pl-3 py-1" style={{borderColor: n.pinned ? "hsl(var(--primary))" : "hsl(var(--border))"}}>
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm flex items-center gap-1">
                      {n.pinned && <Pin className="h-3 w-3 fill-primary text-primary" />}
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                  </div>
                  <Badge className={`${PRI_COLORS[n.priority]} text-xs shrink-0`}>{n.priority}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(n.published_at), "MMM d, HH:mm")}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NoticeBoardWidget;
