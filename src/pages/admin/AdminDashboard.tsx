import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Users, GraduationCap, Layers, BookMarked, CheckCircle2, Circle, CalendarDays } from "lucide-react";

export default function AdminDashboard() {
  const counts = useQuery({
    queryKey: ["admin-counts"],
    queryFn: async () => {
      const [students, teachers, classes, subjects, unassigned, assignments, slots, activeTerm] = await Promise.all([
        supabase.from("students").select("*", { count: "exact", head: true }),
        supabase.from("teachers").select("*", { count: "exact", head: true }),
        supabase.from("classes").select("*", { count: "exact", head: true }),
        supabase.from("subjects").select("*", { count: "exact", head: true }),
        supabase.from("students").select("*", { count: "exact", head: true }).is("class_id", null),
        supabase.from("class_subjects").select("*", { count: "exact", head: true }).not("teacher_id", "is", null),
        supabase.from("timetable_entries").select("*", { count: "exact", head: true }),
        supabase.from("terms").select("name, academic_year").eq("is_active", true).maybeSingle(),
      ]);
      return {
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        classes: classes.count ?? 0,
        subjects: subjects.count ?? 0,
        unassigned: unassigned.count ?? 0,
        assignments: assignments.count ?? 0,
        slots: slots.count ?? 0,
        activeTerm: activeTerm.data,
      };
    },
  });

  const items = [
    { label: "Students", value: counts.data?.students, icon: Users },
    { label: "Teachers", value: counts.data?.teachers, icon: GraduationCap },
    { label: "Classes", value: counts.data?.classes, icon: Layers },
    { label: "Subjects", value: counts.data?.subjects, icon: BookMarked },
  ];

  const c = counts.data;
  // What a new school still needs to set up, in order.
  const checklist = [
    { done: (c?.classes ?? 0) > 0, label: "Create classes", to: "/admin/classes" },
    { done: (c?.subjects ?? 0) > 0, label: "Add subjects", to: "/admin/subjects" },
    { done: (c?.teachers ?? 0) > 0, label: "Make staff teachers", to: "/admin/users" },
    { done: (c?.assignments ?? 0) > 0, label: "Assign teachers to subjects", to: "/admin/assignments" },
    { done: (c?.slots ?? 0) > 0, label: "Build the timetable", to: "/admin/timetable" },
    { done: !!c?.activeTerm, label: "Set the active term", to: "/admin/terms" },
    { done: (c?.students ?? 0) > 0 && c?.unassigned === 0, label: "Place every student in a class", to: "/admin/students" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Overview of your school</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((it) => (
          <Card key={it.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{it.label}</CardTitle>
              <it.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{it.value ?? "—"}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Term</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{c?.activeTerm ? `${c.activeTerm.name} — ${c.activeTerm.academic_year}` : "None set"}</div>
            {c && !c.activeTerm && <Link to="/admin/terms" className="text-sm text-primary hover:underline">Set the active term</Link>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Students Without a Class</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{c?.unassigned ?? "—"}</div>
            {(c?.unassigned ?? 0) > 0 && <Link to="/admin/students" className="text-sm text-primary hover:underline">Place them in classes</Link>}
          </CardContent>
        </Card>
      </div>

      {checklist.some((i) => !i.done) && (
        <Card>
          <CardHeader><CardTitle className="font-heading text-base">Setting up your school</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {checklist.map((i) => (
              <div key={i.label} className="flex items-center gap-2 text-sm">
                {i.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                {i.done ? <span className="text-muted-foreground line-through">{i.label}</span> : <Link to={i.to} className="text-primary hover:underline">{i.label}</Link>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
