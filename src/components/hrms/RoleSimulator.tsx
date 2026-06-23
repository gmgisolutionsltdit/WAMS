import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, UserCog, Users, User } from "lucide-react";
import { useRoleSimulator, ROLE_META, SimulatedRole } from "./RoleSimulatorContext";
import { toast } from "sonner";

const ICONS: Record<SimulatedRole, any> = {
  super_admin: Shield,
  hr_manager: UserCog,
  supervisor: Users,
  employee: User,
};

export function RoleSimulator() {
  const { simulatedRole, setSimulatedRole } = useRoleSimulator();
  const Icon = ICONS[simulatedRole];

  return (
    <Select
      value={simulatedRole}
      onValueChange={(v: SimulatedRole) => {
        setSimulatedRole(v);
        toast.success(`Viewing as ${ROLE_META[v].label}`);
      }}
    >
      <SelectTrigger className="h-9 w-[180px] gap-2 border-slate-200 bg-white hover:bg-slate-50">
        <Icon className="h-4 w-4 text-slate-600" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" className="w-[260px]">
        {(Object.keys(ROLE_META) as SimulatedRole[]).map((r) => {
          const RIcon = ICONS[r];
          return (
            <SelectItem key={r} value={r}>
              <div className="flex items-start gap-2 py-0.5">
                <RIcon className="h-4 w-4 mt-0.5 text-slate-500" />
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{ROLE_META[r].label}</span>
                  <span className="text-[11px] text-muted-foreground">{ROLE_META[r].description}</span>
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
