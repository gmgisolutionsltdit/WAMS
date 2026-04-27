import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

export type VisibleEmployee = {
  id: string;
  full_name: string | null;
  email: string | null;
  photo_url: string | null;
  department: string | null;
  designation: string | null;
  company_wing: string | null;
  reporting_manager_id: string | null;
};

export type EmployeeGroup = {
  label: string;
  employees: VisibleEmployee[];
};

/**
 * Returns profiles visible to the current user according to RLS,
 * grouped & ordered by hierarchy:
 *  - admin: all profiles, group "All Employees"
 *  - manager: direct reports first ("Your Team"), then "Other Employees"
 *  - employee: same wing+department only ("Your Team")
 */
export const useVisibleEmployees = () => {
  const { user, role, profile } = useAuth();
  const [employees, setEmployees] = useState<VisibleEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEmployees = useCallback(async () => {
    if (!user) {
      setEmployees([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, photo_url, department, designation, company_wing, reporting_manager_id")
      .order("full_name", { ascending: true });
    if (!error) setEmployees((data || []) as VisibleEmployee[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
  useRealtimeSubscription("profiles", fetchEmployees, "visible-employees");

  const groups: EmployeeGroup[] = useMemo(() => {
    if (!user) return [];
    if (role === "admin") {
      return [{ label: "All Employees", employees }];
    }
    if (role === "manager") {
      const team = employees.filter((e) => e.reporting_manager_id === user.id && e.id !== user.id);
      const others = employees.filter((e) => e.reporting_manager_id !== user.id && e.id !== user.id);
      const result: EmployeeGroup[] = [];
      if (team.length) result.push({ label: "Your Team", employees: team });
      if (others.length) result.push({ label: "Other Employees", employees: others });
      return result;
    }
    // employee: RLS restricts to same wing+department; show all returned (excluding self optional)
    const team = employees.filter((e) => e.id !== user.id);
    return team.length ? [{ label: "Your Team", employees: team }] : [];
  }, [employees, role, user, profile.department, profile.company_wing]);

  const flat = useMemo(() => groups.flatMap((g) => g.employees), [groups]);

  return { employees, groups, flat, loading, refetch: fetchEmployees };
};
