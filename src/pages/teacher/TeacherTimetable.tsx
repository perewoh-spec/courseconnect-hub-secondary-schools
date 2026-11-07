import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function TeacherTimetable() {
  const { user } = useAuth();
  const { data: teacher } = useQuery({ queryKey: ["my-teacher", user?.id], queryFn: async () => (await supabase.from("teachers").select("*").eq("user_id", user!.id).maybeSingle()).data, enabled: !!user });
  const { data: entries } = useQuery({
    queryKey: ["teacher-tt", teacher?.id],
    queryFn: async () => (await supabase.from("timetable_entries").select("*, classes(name), subjects(name)").eq("teacher_id", teacher!.id).order("start_time")).data ?? [],
    enabled: !!teacher?.id,
  });

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">My Timetable</h1>
      {entries?.length === 0 && <p className="text-sm text-muted-foreground">You have no lessons on the timetable yet.</p>}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {DAYS.map((d) => (
          <Card key={d}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-heading">{d}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {entries?.filter((e) => e.day_of_week === d).map((e) => (
                <div key={e.id} className="text-xs border rounded p-2">
                  <div className="font-medium">{e.subjects?.name}</div>
                  <div className="text-muted-foreground">{e.classes?.name}</div>
                  <div className="text-muted-foreground">{formatTime(e.start_time)}–{formatTime(e.end_time)}</div>
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
