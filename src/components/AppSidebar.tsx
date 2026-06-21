import { Clock, LayoutDashboard, CalendarDays, FileText, CheckSquare, BarChart3, Settings, LogOut, Users, CalendarHeart, FolderKanban, Plane, Wallet, Megaphone, Receipt, Banknote, CalendarClock, TrendingUp } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const employeeItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "My Attendance", url: "/attendance", icon: CalendarDays },
  { title: "OT Requests", url: "/ot-requests", icon: FileText },
  { title: "Leave", url: "/leave", icon: Plane },
  { title: "Expenses", url: "/expenses", icon: Receipt },
  { title: "Notice Board", url: "/notices", icon: Megaphone },
  { title: "Projects", url: "/projects", icon: FolderKanban },
];

const managerItems = [
  { title: "Pending Approvals", url: "/approvals", icon: CheckSquare },
  { title: "Reports", url: "/reports", icon: BarChart3 },
];

const adminItems = [
  { title: "Employees", url: "/employees", icon: Users },
  { title: "Roster & Shifts", url: "/roster", icon: CalendarClock },
  { title: "Holidays", url: "/holidays", icon: CalendarHeart },
  { title: "Settings", url: "/settings", icon: Settings },
];


export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { role, profile, signOut } = useAuth();

  const isActive = (path: string) => location.pathname === path;
  const isManagerOrAdmin = role === "manager" || role === "admin" || role === "supervisor";
  const isAdmin = role === "admin";
  const canPayroll = role === "admin" || role === "hr" || role === "executive";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <Clock className="mr-2 h-4 w-4" />
            {!collapsed && "OT Tracker"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {employeeItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} end className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isManagerOrAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{!collapsed && "Management"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {managerItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink to={item.url} end className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{!collapsed && "Admin"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink to={item.url} end className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {canPayroll && (
          <SidebarGroup>
            <SidebarGroupLabel>{!collapsed && "HR"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/payroll")}>
                    <NavLink to="/payroll" end className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                      <Wallet className="mr-2 h-4 w-4" />
                      {!collapsed && <span>Payroll</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/loans")}>
                    <NavLink to="/loans" end className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                      <Banknote className="mr-2 h-4 w-4" />
                      {!collapsed && <span>Loans</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/salary-increments")}>
                    <NavLink to="/salary-increments" end className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                      <TrendingUp className="mr-2 h-4 w-4" />
                      {!collapsed && <span>Salary Increments</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="p-2">
          {!collapsed && profile && (
            <p className="text-xs text-muted-foreground mb-2 truncate">{profile.full_name || profile.email}</p>
          )}
          <Button variant="ghost" size={collapsed ? "icon" : "sm"} className="w-full" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
