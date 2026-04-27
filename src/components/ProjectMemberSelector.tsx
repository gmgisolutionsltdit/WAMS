import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useVisibleEmployees, VisibleEmployee } from "@/hooks/useVisibleEmployees";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, UserPlus, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Member = { user_id: string; role: string };

interface Props {
  projectId: string;
  project: { owner_id: string; wing: string | null } | null;
  members: Member[];
  onChanged: () => void;
}

const initials = (name?: string | null, email?: string | null) =>
  (name || email || "?").slice(0, 2).toUpperCase();

export const ProjectMemberSelector = ({ projectId, project, members, onChanged }: Props) => {
  const { user } = useAuth();
  const { groups, flat, loading, error } = useVisibleEmployees();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    members.forEach((mm) => m.set(mm.user_id, mm.role));
    return m;
  }, [members]);

  // Sort each group: project-wing employees first, then alpha
  const sortedGroups = useMemo(() => {
    const wing = project?.wing;
    const sortFn = (a: VisibleEmployee, b: VisibleEmployee) => {
      if (wing) {
        const aw = a.company_wing === wing ? 0 : 1;
        const bw = b.company_wing === wing ? 0 : 1;
        if (aw !== bw) return aw - bw;
      }
      return (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "");
    };
    const q = search.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        employees: [...g.employees]
          .filter((e) => {
            if (!q) return true;
            return [e.full_name, e.email, e.designation, e.department, e.company_wing]
              .filter(Boolean)
              .some((v) => v!.toLowerCase().includes(q));
          })
          .sort(sortFn),
      }))
      .filter((g) => g.employees.length > 0);
  }, [groups, project?.wing, search]);

  const totalVisible = useMemo(
    () => sortedGroups.reduce((sum, g) => sum + g.employees.length, 0),
    [sortedGroups],
  );

  const memberProfiles = useMemo(
    () => flat.filter((p) => memberMap.has(p.id) || p.id === project?.owner_id),
    [flat, memberMap, project?.owner_id],
  );

  const toggleMember = async (userId: string, checked: boolean) => {
    if (userId === project?.owner_id) {
      toast.info("Owner is always a member");
      return;
    }
    setBusyId(userId);
    try {
      if (checked) {
        const { error } = await supabase
          .from("project_members")
          .upsert(
            { project_id: projectId, user_id: userId, role: "member" as any },
            { onConflict: "project_id,user_id" },
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("project_members")
          .delete()
          .eq("project_id", projectId)
          .eq("user_id", userId);
        if (error) throw error;
      }
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to update member");
    } finally {
      setBusyId(null);
    }
  };

  const changeRole = async (userId: string, role: string) => {
    setBusyId(userId);
    try {
      const { error } = await supabase
        .from("project_members")
        .upsert(
          { project_id: projectId, user_id: userId, role: role as any },
          { onConflict: "project_id,user_id" },
        );
      if (error) throw error;
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to update role");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="mr-1 h-4 w-4" /> Members ({memberProfiles.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Project Members
          </DialogTitle>
          <DialogDescription>
            Select people who should collaborate on this project. Direct subordinates and{" "}
            {project?.wing ? `${project.wing} wing` : "your wing"} colleagues are listed first.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, designation, department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <ScrollArea className="h-[420px] pr-3 -mr-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading employees…
            </div>
          ) : error ? (
            <div className="text-center py-12 text-destructive">
              <p className="text-sm font-medium">Failed to load employees</p>
              <p className="text-xs mt-1 text-muted-foreground">{error}</p>
            </div>
          ) : totalVisible === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No eligible members found in your department/wing.</p>
              {search && (
                <p className="text-xs mt-1">Try clearing the search filter.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {sortedGroups.map((group) => (
                <div key={group.label}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-1">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.employees.map((p) => {
                      const isOwner = project?.owner_id === p.id;
                      const isMember = memberMap.has(p.id) || isOwner;
                      const role = isOwner ? "owner" : (memberMap.get(p.id) || "");
                      const isWingMatch = project?.wing && p.company_wing === project.wing;
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors",
                            isMember && "bg-muted/30",
                          )}
                        >
                          <Checkbox
                            checked={isMember}
                            disabled={isOwner || busyId === p.id}
                            onCheckedChange={(c) => toggleMember(p.id, !!c)}
                          />
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={p.photo_url || undefined} />
                            <AvatarFallback className="text-[11px]">
                              {initials(p.full_name, p.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate flex items-center gap-2">
                              {p.full_name || p.email}
                              {isWingMatch && (
                                <Badge variant="outline" className="text-[9px] py-0 px-1 h-4">
                                  {p.company_wing}
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {[p.designation, p.department, !isWingMatch ? p.company_wing : null]
                                .filter(Boolean)
                                .join(" · ") || p.email}
                            </div>
                          </div>
                          {isOwner ? (
                            <Badge>Owner</Badge>
                          ) : isMember ? (
                            <Select
                              value={role || "member"}
                              onValueChange={(v) => changeRole(p.id, v)}
                              disabled={busyId === p.id}
                            >
                              <SelectTrigger className="w-[110px] h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[11px] text-muted-foreground w-[110px] text-right pr-1">
                              {busyId === p.id ? "…" : "Not added"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {memberProfiles.length} member{memberProfiles.length === 1 ? "" : "s"} on this project
          </div>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectMemberSelector;
