import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck, GraduationCap, Calendar } from "lucide-react";

export default function StudentDashboard() {
  const { user } = useAuth();

  const { data: student } = useQuery({
    queryKey: ["my-student", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("*, classes(*)").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => (await supabase.from("profiles").select("full_name").eq("user_id", user!.id).maybeSingle()).data,
    enabled: !!user,
  });

  const { data: attendance } = useQuery({
    queryKey: ["my-attendance-summary", student?.id],
    queryFn: async () => {
      const { data } = await supabase.from("attendance").select("status").eq("student_id", student!.id);
      return data ?? [];
    },
    enabled: !!student?.id,
  });

  const { data: results } = useQuery({
    queryKey: ["my-recent-results", student?.id],
    queryFn: async () => {
      const { data } = await supabase.from("results").select("*, subjects(name, code)").eq("student_id", student!.id).order("updated_at", { ascending: false }).limit(5);
      return data ?? [];
    },
    enabled: !!student?.id,
  });

  const total = attendance?.length ?? 0;
  const present = attendance?.filter((a) => a.status === "present").length ?? 0;
  const pct = total ? Math.round((present / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
        <p className="text-muted-foreground">
          {student?.classes ? `Class: ${student.classes.name}` : "You are not yet assigned to a class. Your school administrator will place you in one."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Attendance Rate</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pct}%</div>
            <p className="text-xs text-muted-foreground">{present}/{total} days present</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Recent Results</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{results?.length ?? 0}</div>
            <p className="text-xs text-muted-foreground">subjects graded</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Class</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{student?.classes?.name ?? "—"}</div>
            <p className="text-xs text-muted-foreground">{student?.classes?.academic_year ?? ""}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="font-heading text-base">Recent Results</CardTitle></CardHeader>
        <CardContent>
          {results && results.length > 0 ? (
            <div className="space-y-2">
              {results.map((r) => (
                <div key={r.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <div className="font-medium">{r.subjects?.name}</div>
                    <div className="text-xs text-muted-foreground">{r.subjects?.code}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{r.total}/100</div>
                    <div className="text-xs text-muted-foreground">Grade {r.grade}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No results yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
