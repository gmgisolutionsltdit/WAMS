import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type AppRole = "admin" | "manager" | "employee" | "hr" | "executive" | "supervisor";
type CompanyWing = "GMGI" | "MORU";
type ServiceStatus = "Permanent" | "Contractual" | "Intern" | "Short-Term" | "Consultant";
type EmployeeStatus = "Active" | "Inactive" | "Resigned";

interface ProfileData {
  id: string | null;
  full_name: string | null;
  email: string | null;
  department: string | null;
  designation: string | null;
  phone: string | null;
  photo_url: string | null;
  company_wing: CompanyWing;
  service_status: ServiceStatus;
  employee_status: EmployeeStatus;
  joining_date: string | null;
  promotion_date: string | null;
  resign_date: string | null;
  daily_ot_cap: number;
  monthly_ot_cap: number;
  reporting_manager_id: string | null;
}

const EMPTY_PROFILE: ProfileData = {
  id: null, full_name: null, email: null, department: null, designation: null,
  phone: null, photo_url: null, company_wing: "GMGI", service_status: "Permanent",
  employee_status: "Active", joining_date: null, promotion_date: null,
  resign_date: null, daily_ot_cap: 4, monthly_ot_cap: 40, reporting_manager_id: null,
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole;
  profile: ProfileData;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, loading: true, role: "employee", profile: EMPTY_PROFILE,
  signOut: async () => {}, refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE);
  const [role, setRole] = useState<AppRole>("employee");
  const [loading, setLoading] = useState(true);

  const loadProfileAndRole = useCallback(async (userId: string) => {
    const [{ data: profileData }, { data: rolesData }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if (profileData) {
      setProfile({
        id: profileData.id,
        full_name: profileData.full_name,
        email: profileData.email,
        department: profileData.department,
        designation: profileData.designation,
        phone: profileData.phone,
        photo_url: profileData.photo_url,
        company_wing: profileData.company_wing as CompanyWing,
        service_status: profileData.service_status as ServiceStatus,
        employee_status: profileData.employee_status as EmployeeStatus,
        joining_date: profileData.joining_date,
        promotion_date: profileData.promotion_date,
        resign_date: profileData.resign_date,
        daily_ot_cap: Number(profileData.daily_ot_cap),
        monthly_ot_cap: Number(profileData.monthly_ot_cap),
        reporting_manager_id: profileData.reporting_manager_id,
      });
    }

    // Pick highest role: admin > supervisor > executive > hr > manager > employee
    const roles = (rolesData || []).map(r => r.role as AppRole);
    if (roles.includes("admin")) setRole("admin");
    else if (roles.includes("supervisor")) setRole("supervisor");
    else if (roles.includes("executive")) setRole("executive");
    else if (roles.includes("hr")) setRole("hr");
    else if (roles.includes("manager")) setRole("manager");
    else setRole("employee");
  }, []);

  useEffect(() => {
    // Listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        // Defer Supabase calls outside the callback
        setTimeout(() => { loadProfileAndRole(newSession.user.id); }, 0);
      } else {
        setProfile(EMPTY_PROFILE);
        setRole("employee");
      }
    });

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) {
        loadProfileAndRole(existing.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => { subscription.unsubscribe(); };
  }, [loadProfileAndRole]);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfileAndRole(user.id);
  }, [user, loadProfileAndRole]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(EMPTY_PROFILE);
    setRole("employee");
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, profile, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
