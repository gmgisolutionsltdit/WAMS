import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

const roleLabel: Record<string, string> = { admin: "Admin", manager: "Manager", employee: "Employee", hr: "HR", executive: "Executive", supervisor: "Supervisor" };

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, role } = useAuth();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full overflow-x-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b px-2 sm:px-4 justify-between gap-2 bg-card sticky top-0 z-30">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <SidebarTrigger className="shrink-0 h-9 w-9" />
              <h1 className="text-base sm:text-lg font-semibold truncate">WAMS</h1>
              {profile.id && (
                <div className="hidden md:flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{profile.company_wing}</Badge>
                  <Badge variant="outline" className="text-xs capitalize">{roleLabel[role] ?? "Employee"}</Badge>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
