import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function DevUserSwitcher() {
  const { role, profile, switchRole } = useAuth();

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">DEV MODE</Badge>
      <Select value={role} onValueChange={(v) => switchRole(v as any)}>
        <SelectTrigger className="w-[180px] h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">👑 Test Admin</SelectItem>
          <SelectItem value="manager">👔 Test Manager</SelectItem>
          <SelectItem value="employee">👤 Test Employee</SelectItem>
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground hidden md:inline">{profile?.full_name}</span>
    </div>
  );
}
