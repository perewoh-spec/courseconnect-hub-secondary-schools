import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ClipboardCheck, GraduationCap } from "lucide-react";
import { formatTime } from "@/lib/utils";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function TeacherDashboard() {
  const { user } = useAuth();
  const { data: teacher } = useQuery({
    queryKey: ["my-teacher", user?.id],
    queryFn: async () => (await supabase.from("teachers").select("*").eq("user_id", user!.id).maybeSingle()).data,
    enabled: !!user,
  });
  const { data: assignments } = useQuery({
    queryKey: ["my-assignments", teacher?.id],
    queryFn: async () => (await supabase.from("class_subjects").select("*, classes(name), subjects(name, code)").eq("teacher_id", teacher!.id)).data ?? [],
    enabled: !!teacher?.id,
  });
  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => (await supabase.from("profiles").select("full_name").eq("user_id", user!.id).maybeSingle()).data,
    enabled: !!user,
  });

  const today = DAY_NAMES[new Date().getDay()];
  const { data: todaysLessons } = useQuery({
    queryKey: ["teacher-today", teacher?.id, today],
    queryFn: async () => (await supabase.from("timetable_entries").select("*, classes(name), subjects(name)")
      .eq("teacher_id", teacher!.id).eq("day_of_week", today).order("start_time")).data ?? [],
    enabled: !!teacher?.id,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
        <p className="text-muted-foreground">Your lessons today and the classes you teach</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild><Link to="/teacher/attendance"><ClipboardCheck className="mr-2 h-4 w-4" />Mark Attendance</Link></Button>
        <Button asChild variant="outline"><Link to="/teacher/results"><GraduationCap className="mr-2 h-4 w-4" />Enter Results</Link></Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="font-heading text-base">Today ({today})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {todaysLessons?.length === 0 && <p className="text-sm text-muted-foreground">No lessons on your timetable today.</p>}
          {todaysLessons?.map((l) => (
            <div key={l.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
              <span><span className="font-medium">{formatTime(l.start_time)}–{formatTime(l.end_time)}</span> · {l.subjects?.name} · {l.classes?.name}</span>
              {l.room && <span className="text-muted-foreground">Room {l.room}</span>}
            </div>
          ))}
        </CardContent>
      </Card>

      <h2 className="font-heading text-lg font-semibold">My Classes & Subjects</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {assignments?.map((a) => (
          <Card key={a.id}>
            <CardHeader><CardTitle className="font-heading text-base">{a.subjects?.name}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">Class: <span className="font-medium text-foreground">{a.classes?.name}</span></div>
              <div className="text-xs text-muted-foreground mt-1">{a.subjects?.code}</div>
            </CardContent>
          </Card>
        ))}
        {(assignments?.length === 0 || (teacher === null)) && (
          <p className="text-sm text-muted-foreground">No classes assigned yet. The administrator assigns subjects under Subject Teachers.</p>
        )}
      </div>
    </div>
  );
}
