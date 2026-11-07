import { BookOpen, Calendar, School, Home, LogOut, Users, ClipboardCheck, GraduationCap, CalendarDays, Layers, BookMarked, UserCog, UserCircle, Link2 } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const studentItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "My Attendance", url: "/attendance", icon: ClipboardCheck },
  { title: "My Results", url: "/results", icon: GraduationCap },
  { title: "My Timetable", url: "/timetable", icon: Calendar },
  { title: "My Profile", url: "/profile", icon: UserCircle },
];

const teacherItems = [
  { title: "Dashboard", url: "/teacher", icon: Home },
  { title: "Mark Attendance", url: "/teacher/attendance", icon: ClipboardCheck },
  { title: "Enter Results", url: "/teacher/results", icon: GraduationCap },
  { title: "My Timetable", url: "/teacher/timetable", icon: Calendar },
  { title: "My Profile", url: "/profile", icon: UserCircle },
];

// Admins manage the school; teachers only see their own teaching tools.
const adminItems = [
  { title: "Dashboard", url: "/admin", icon: Home },
  { title: "Users & Roles", url: "/admin/users", icon: UserCog },
  { title: "Students", url: "/admin/students", icon: Users },
  { title: "Teachers", url: "/admin/teachers", icon: GraduationCap },
  { title: "Classes", url: "/admin/classes", icon: Layers },
  { title: "Subjects", url: "/admin/subjects", icon: BookMarked },
  { title: "Subject Teachers", url: "/admin/assignments", icon: Link2 },
  { title: "Timetable", url: "/admin/timetable", icon: CalendarDays },
  { title: "Terms", url: "/admin/terms", icon: BookOpen },
  { title: "My Profile", url: "/profile", icon: UserCircle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { role, signOut, user } = useAuth();

  const items = role === "admin" ? adminItems : role === "teacher" ? teacherItems : studentItems;


  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-heading text-xs uppercase tracking-wider">
            {!collapsed ? (
              <span className="flex items-center gap-2"><School className="h-4 w-4" />SchoolHub</span>
            ) : (
              <School className="h-4 w-4" />
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === "/dashboard" || item.url === "/admin" || item.url === "/teacher"} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        {!collapsed && <div className="mb-2 text-xs text-sidebar-foreground/60 truncate">{user?.email}</div>}
        <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
