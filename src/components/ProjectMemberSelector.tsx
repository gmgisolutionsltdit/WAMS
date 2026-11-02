import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { notifyEmployee } from "@/lib/notifications";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2, Users, MoreHorizontal, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Member = { user_id: string; role: string };

type AssignableProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  photo_url: string | null;
  department: string | null;
  designation: string | null;
  company_wing: string | null;
  reporting_manager_id: string | null;
};

interface Props {
  projectId: string;
  project: { owner_id: string; wing: string | null; name?: string } | null;
  members: Member[];
  onChanged: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const initials = (name?: string | null, email?: string | null) =>
  (name || email || "?").slice(0, 2).toUpperCase();

export const ProjectMemberSelector = ({ projectId, project, members, onChanged, open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<AssignableProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    supabase.rpc("get_board_assignable_profiles").then(({ data, error: err }) => {
      if (!active) return;
      if (err) {
        setError(err.message);
        setProfiles([]);
      } else {
        setError(null);
        setProfiles((data || []) as AssignableProfile[]);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [open]);

  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    members.forEach((mm) => m.set(mm.user_id, mm.role));
    return m;
  }, [members]);

  // All accessible company employees — sorted so project-wing colleagues
  // surface first, then alphabetically.
  const sortedProfiles = useMemo(() => {
    const wing = project?.wing;
    const q = search.trim().toLowerCase();
    return profiles
      .filter((p) => p.id !== user?.id || p.id === project?.owner_id)
      .filter((p) => {
        if (!q) return true;
        return [p.full_name, p.email, p.designation, p.department, p.company_wing]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (wing) {
          const aw = a.company_wing === wing ? 0 : 1;
          const bw = b.company_wing === wing ? 0 : 1;
          if (aw !== bw) return aw - bw;
        }
        return (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "");
      });
  }, [profiles, project?.wing, project?.owner_id, search, user?.id]);

  const memberProfiles = useMemo(
    () => profiles.filter((p) => memberMap.has(p.id) || p.id === project?.owner_id),
    [profiles, memberMap, project?.owner_id],
  );

  const addMember = async (userId: string) => {
    setBusyId(userId);
    try {
      const { error } = await supabase
        .from("project_members")
        .upsert(
          { project_id: projectId, user_id: userId, role: "member" as any },
          { onConflict: "project_id,user_id" },
        );
      if (error) throw error;
      onChanged();
      notifyEmployee(
        userId,
        "Added to a board",
        `You were added to the "${project?.name || "board"}" board.`,
        projectId,
        { route: `/tasks/${projectId}`, type: "task" },
      );
    } catch (e: any) {
      toast.error(e.message || "Failed to add member");
    } finally {
      setBusyId(null);
    }
  };

  const removeMember = async (userId: string) => {
    if (userId === project?.owner_id) {
      toast.info("Owner is always a member");
      return;
    }
    setBusyId(userId);
    try {
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (error) throw error;
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to remove member");
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl top-8 translate-y-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Share board
          </DialogTitle>
          <DialogDescription>
            Add anyone in the company to this board. {project?.wing ? `${project.wing} wing` : "Your wing"} colleagues are listed first.
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
          ) : sortedProfiles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No employees found.</p>
              {search && (
                <p className="text-xs mt-1">Try clearing the search filter.</p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {sortedProfiles.map((p) => {
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 gap-1" disabled={busyId === p.id}>
                            {role === "viewer" ? "Viewer" : "Member"} <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => changeRole(p.id, "member")}>Make member</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => changeRole(p.id, "viewer")}>Make viewer</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => removeMember(p.id)}
                          >
                            <UserMinus className="h-4 w-4 mr-2" /> Remove from board
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1"
                        disabled={busyId === p.id}
                        onClick={() => addMember(p.id)}
                      >
                        {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Add
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {memberProfiles.length} member{memberProfiles.length === 1 ? "" : "s"} on this project
          </div>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectMemberSelector;
