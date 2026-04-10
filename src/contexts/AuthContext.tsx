import { createContext, useContext, useState, ReactNode } from "react";

type AppRole = "admin" | "manager" | "employee";

interface MockUser {
  id: string;
  email: string;
}

interface AuthContextType {
  user: MockUser | null;
  session: any;
  loading: boolean;
  role: AppRole;
  profile: { full_name: string | null; email: string | null; department: string | null };
  signOut: () => Promise<void>;
  switchRole: (role: AppRole) => void;
}

const MOCK_PROFILES: Record<AppRole, { user: MockUser; profile: AuthContextType["profile"] }> = {
  admin: {
    user: { id: "00000000-0000-0000-0000-000000000001", email: "admin@test.com" },
    profile: { full_name: "Test Admin", email: "admin@test.com", department: "IT" },
  },
  manager: {
    user: { id: "00000000-0000-0000-0000-000000000002", email: "manager@test.com" },
    profile: { full_name: "Test Manager", email: "manager@test.com", department: "Operations" },
  },
  employee: {
    user: { id: "00000000-0000-0000-0000-000000000003", email: "employee@test.com" },
    profile: { full_name: "Test Employee", email: "employee@test.com", department: "Engineering" },
  },
};

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, loading: false, role: "admin", profile: null as any, signOut: async () => {}, switchRole: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [role, setRole] = useState<AppRole>("admin");

  const mock = MOCK_PROFILES[role];

  const switchRole = (newRole: AppRole) => setRole(newRole);

  return (
    <AuthContext.Provider value={{
      user: mock.user,
      session: { user: mock.user },
      loading: false,
      role,
      profile: mock.profile,
      signOut: async () => {},
      switchRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
