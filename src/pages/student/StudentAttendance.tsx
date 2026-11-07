import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default function StudentAttendance() {
  const { user } = useAuth();
  const { data: student } = useQuery({ queryKey: ["my-student", user?.id], queryFn: async () => (await supabase.from("students").select("*").eq("user_id", user!.id).maybeSingle()).data, enabled: !!user });
  const { data: records } = useQuery({
    queryKey: ["my-attendance", student?.id],
    queryFn: async () => (await supabase.from("attendance").select("*").eq("student_id", student!.id).order("date", { ascending: false })).data ?? [],
    enabled: !!student?.id,
  });

  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = { present: "default", absent: "destructive", late: "secondary", excused: "outline" };

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">My Attendance</h1>
      {records && records.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["present", "absent", "late", "excused"] as const).map((st) => (
            <Card key={st}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground capitalize">{st}</div>
                <div className="text-2xl font-bold">{records.filter((r) => r.status === st).length}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardHeader><CardTitle className="font-heading text-base">History</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {records?.map((r) => (
            <div key={r.id} className="flex items-center justify-between border rounded-lg p-3">
              <div className="text-sm">{formatDate(r.date)}</div>
              <Badge variant={variants[r.status] ?? "default"} className="capitalize">{r.status}</Badge>
            </div>
          ))}
          {records?.length === 0 && <p className="text-sm text-muted-foreground">No attendance records yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
