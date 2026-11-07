import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { friendlyDbError, todayLocal } from "@/lib/utils";

const STATUSES = ["present", "absent", "late", "excused"] as const;

export default function TeacherAttendance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [classId, setClassIdState] = useState("");
  const [date, setDateState] = useState(todayLocal());
  const [marks, setMarks] = useState<Record<string, string>>({});
  // Unsaved changes belong to one class and day; switching either starts fresh.
  const setClassId = (v: string) => { setClassIdState(v); setMarks({}); };
  const setDate = (v: string) => { setDateState(v); setMarks({}); };

  const { data: teacher } = useQuery({ queryKey: ["my-teacher", user?.id], queryFn: async () => (await supabase.from("teachers").select("*").eq("user_id", user!.id).maybeSingle()).data, enabled: !!user });
  const { data: myClasses } = useQuery({
    queryKey: ["my-classes", teacher?.id],
    queryFn: async () => {
      const { data } = await supabase.from("class_subjects").select("class_id, classes(id, name)").eq("teacher_id", teacher!.id);
      const seen = new Set<string>();
      return (data ?? []).filter((d) => { if (seen.has(d.class_id)) return false; seen.add(d.class_id); return true; });
    },
    enabled: !!teacher?.id,
  });
  const { data: students, error: studentsError } = useQuery({
    queryKey: ["class-students", classId],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id, user_id, admission_number, profiles:user_id(full_name)").eq("class_id", classId);
      if (error) throw error;
      return (data ?? []).sort((a, b) => (a.profiles?.full_name ?? "").localeCompare(b.profiles?.full_name ?? ""));
    },
    enabled: !!classId,
  });
  const { data: existing } = useQuery({
    queryKey: ["attendance", classId, date],
    queryFn: async () => (await supabase.from("attendance").select("*").eq("class_id", classId).eq("date", date)).data ?? [],
    enabled: !!classId,
  });

  // Saves every student's status as shown, including the default "present"; before, only
  // changed entries were saved, so an untouched register recorded nothing.
  const save = useMutation({
    mutationFn: async () => {
      const rows = (students ?? []).map((s) => ({ student_id: s.id, class_id: classId, date, status: currentStatus(s.id), marked_by: user!.id }));
      if (rows.length === 0) return;
      const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "student_id,date" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance"] }); setMarks({}); toast({ title: "Attendance saved" }); },
    onError: (e) => toast({ title: "Failed", description: friendlyDbError(e), variant: "destructive" }),
  });

  const currentStatus = (sid: string) => marks[sid] ?? existing?.find((a) => a.student_id === sid)?.status ?? "present";
  const alreadyRecorded = (existing?.length ?? 0) > 0;
  const markAllPresent = () => setMarks(Object.fromEntries((students ?? []).map((s) => [s.id, "present"])));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Mark Attendance</h1>
        <p className="text-muted-foreground">Daily attendance for your classes</p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>{myClasses?.map((c) => <SelectItem key={c.class_id} value={c.class_id}>{c.classes?.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Date</Label><Input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="flex items-end"><Button onClick={() => save.mutate()} disabled={!classId || !students?.length || save.isPending} className="w-full">Save Attendance</Button></div>
        </CardContent>
      </Card>

      {myClasses?.length === 0 && (
        <p className="text-sm text-muted-foreground">You haven't been assigned to any class yet. Ask the administrator to add you under Subject Teachers.</p>
      )}

      {classId && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="font-heading text-base">Students</CardTitle>
              <p className="text-xs text-muted-foreground">
                {alreadyRecorded ? "Attendance for this day is already recorded; saving updates it." : "Not recorded yet for this day."}
              </p>
            </div>
            {!!students?.length && <Button variant="outline" size="sm" onClick={markAllPresent}>Mark all present</Button>}
          </CardHeader>
          <CardContent className="space-y-2">
            {studentsError && <p className="text-sm text-destructive">Couldn't load students: {friendlyDbError(studentsError)}</p>}
            {students?.map((s) => (
              <div key={s.id} className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <div className="font-medium">{s.profiles?.full_name ?? "Unnamed"}</div>
                  <div className="text-xs text-muted-foreground">{s.admission_number}</div>
                </div>
                <Select value={currentStatus(s.id)} onValueChange={(v) => setMarks({ ...marks, [s.id]: v })}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((st) => <SelectItem key={st} value={st} className="capitalize">{st}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
            {students?.length === 0 && <p className="text-sm text-muted-foreground">No students in this class.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
