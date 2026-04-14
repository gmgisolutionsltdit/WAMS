import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "manager" | "employee";

interface MockUser {
  id: string;
  email: string;
}

interface ProfileData {
  full_name: string | null;
  email: string | null;
  department: string | null;
}

interface EmployeeEntry {
  user: MockUser;
  profile: ProfileData;
  role: AppRole;
}

interface AuthContextType {
  user: MockUser | null;
  session: any;
  loading: boolean;
  role: AppRole;
  profile: ProfileData;
  signOut: () => Promise<void>;
  switchRole: (role: AppRole) => void;
  switchUser: (userId: string) => void;
  employees: EmployeeEntry[];
  refreshEmployees: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, loading: true, role: "admin",
  profile: { full_name: null, email: null, department: null },
  signOut: async () => {}, switchRole: () => {}, switchUser: () => {},
  employees: [], refreshEmployees: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [employees, setEmployees] = useState<EmployeeEntry[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEmployees = useCallback(async () => {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, department").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    const roleMap = new Map((roles || []).map(r => [r.user_id, r.role as AppRole]));
    const list: EmployeeEntry[] = (profiles || []).map(p => ({
      user: { id: p.id, email: p.email || "" },
      profile: { full_name: p.full_name, email: p.email, department: p.department },
      role: roleMap.get(p.id) || "employee",
    }));

    setEmployees(list);

    // Auto-select first user if none selected
    if (!selectedUserId && list.length > 0) {
      setSelectedUserId(list[0].user.id);
    }
    setLoading(false);
  }, [selectedUserId]);

  useEffect(() => { fetchEmployees(); }, []);

  // Realtime subscription for profiles changes
  useEffect(() => {
    const channel = supabase
      .channel("auth-profiles-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => fetchEmployees())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => fetchEmployees())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchEmployees]);

  const current = employees.find(e => e.user.id === selectedUserId) || employees[0];

  const switchUser = (userId: string) => setSelectedUserId(userId);
  const switchRole = (_role: AppRole) => {
    // Find first employee with this role
    const match = employees.find(e => e.role === _role);
    if (match) setSelectedUserId(match.user.id);
  };

  return (
    <AuthContext.Provider value={{
      user: current?.user || null,
      session: current ? { user: current.user } : null,
      loading,
      role: current?.role || "admin",
      profile: current?.profile || { full_name: null, email: null, department: null },
      signOut: async () => {},
      switchRole,
      switchUser,
      employees,
      refreshEmployees: fetchEmployees,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
