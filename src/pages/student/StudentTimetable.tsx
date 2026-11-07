import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function StudentTimetable() {
  const { user } = useAuth();
  const { data: student } = useQuery({ queryKey: ["my-student", user?.id], queryFn: async () => (await supabase.from("students").select("class_id, classes(name)").eq("user_id", user!.id).maybeSingle()).data, enabled: !!user });
  const { data: entries } = useQuery({
    queryKey: ["class-tt", student?.class_id],
    queryFn: async () => (await supabase.from("timetable_entries").select("*, subjects(name), teachers(user_id, profiles:user_id(full_name))").eq("class_id", student!.class_id).order("start_time")).data ?? [],
    enabled: !!student?.class_id,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">My Class Timetable</h1>
        <p className="text-muted-foreground">{student?.classes?.name ?? "You're not in a class yet. Your school administrator will place you in one."}</p>
      </div>
      {student?.class_id && entries?.length === 0 && <p className="text-sm text-muted-foreground">Your class timetable hasn't been set up yet.</p>}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {DAYS.map((d) => (
          <Card key={d}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-heading">{d}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {entries?.filter((e) => e.day_of_week === d).map((e) => (
                <div key={e.id} className="text-xs border rounded p-2">
                  <div className="font-medium">{e.subjects?.name}</div>
                  <div className="text-muted-foreground">{formatTime(e.start_time)}–{formatTime(e.end_time)}</div>
                  {e.teachers?.profiles?.full_name && <div className="text-muted-foreground">{e.teachers.profiles.full_name}</div>}
                  {e.room && <div className="text-muted-foreground">Room {e.room}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
