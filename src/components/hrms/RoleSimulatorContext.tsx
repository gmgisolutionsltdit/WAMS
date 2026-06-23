import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type SimulatedRole = "super_admin" | "hr_manager" | "supervisor" | "employee";

export const ROLE_META: Record<SimulatedRole, { label: string; description: string; tone: string }> = {
  super_admin: { label: "Super Admin", description: "Global infrastructure & licensing", tone: "bg-indigo-600" },
  hr_manager: { label: "HR Manager", description: "Roster, leave & payroll", tone: "bg-emerald-600" },
  supervisor: { label: "Supervisor", description: "Team task delegation", tone: "bg-sky-600" },
  employee: { label: "Employee", description: "Personal punch & payslips", tone: "bg-slate-600" },
};

interface Ctx {
  simulatedRole: SimulatedRole;
  setSimulatedRole: (r: SimulatedRole) => void;
}
const RoleSimulatorContext = createContext<Ctx>({ simulatedRole: "employee", setSimulatedRole: () => {} });

export const useRoleSimulator = () => useContext(RoleSimulatorContext);

const STORAGE_KEY = "hrms_role_sim";

export const RoleSimulatorProvider = ({ children }: { children: ReactNode }) => {
  const [simulatedRole, setSimulatedRoleState] = useState<SimulatedRole>(() => {
    if (typeof window === "undefined") return "employee";
    return (localStorage.getItem(STORAGE_KEY) as SimulatedRole) || "employee";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, simulatedRole);
  }, [simulatedRole]);

  return (
    <RoleSimulatorContext.Provider value={{ simulatedRole, setSimulatedRole: setSimulatedRoleState }}>
      {children}
    </RoleSimulatorContext.Provider>
  );
};
