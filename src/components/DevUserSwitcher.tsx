import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const roleEmoji: Record<string, string> = { admin: "👑", manager: "👔", employee: "👤" };

export function DevUserSwitcher() {
  const { user, employees, switchUser } = useAuth();

  if (employees.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">DEV MODE</Badge>
      <Select value={user?.id || ""} onValueChange={switchUser}>
        <SelectTrigger className="w-[220px] h-8 text-sm">
          <SelectValue placeholder="Select user" />
        </SelectTrigger>
        <SelectContent>
          {employees.map((emp) => (
            <SelectItem key={emp.user.id} value={emp.user.id}>
              {roleEmoji[emp.role] || "👤"} {emp.profile.full_name || emp.user.email} ({emp.role})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
