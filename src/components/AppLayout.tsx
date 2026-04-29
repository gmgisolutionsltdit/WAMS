import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

const roleLabel: Record<string, string> = { admin: "Admin", manager: "Manager", employee: "Employee", hr: "HR", executive: "Executive" };

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, role } = useAuth();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b px-4 justify-between">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="mr-2" />
              <h1 className="text-lg font-semibold">Enterprise OMS</h1>
              {profile.id && (
                <>
                  <Badge variant="secondary" className="text-xs">{profile.company_wing}</Badge>
                  <Badge variant="outline" className="text-xs capitalize">{roleLabel[role]}</Badge>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
