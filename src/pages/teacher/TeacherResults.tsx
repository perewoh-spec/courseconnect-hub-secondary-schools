import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { friendlyDbError } from "@/lib/utils";

export default function TeacherResults() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [classSubjectId, setClassSubjectIdState] = useState("");
  const [termId, setTermIdState] = useState("");
  const [scores, setScores] = useState<Record<string, { ca: string; exam: string }>>({});
  // Unsaved scores belong to one class, subject and term; switching starts fresh.
  const setClassSubjectId = (v: string) => { setClassSubjectIdState(v); setScores({}); };
  const setTermId = (v: string) => { setTermIdState(v); setScores({}); };

  const { data: teacher } = useQuery({ queryKey: ["my-teacher", user?.id], queryFn: async () => (await supabase.from("teachers").select("*").eq("user_id", user!.id).maybeSingle()).data, enabled: !!user });
  const { data: assignments } = useQuery({
    queryKey: ["my-assignments", teacher?.id],
    queryFn: async () => (await supabase.from("class_subjects").select("id, class_id, subject_id, classes(name), subjects(name)").eq("teacher_id", teacher!.id)).data ?? [],
    enabled: !!teacher?.id,
  });
  const { data: terms } = useQuery({ queryKey: ["terms"], queryFn: async () => (await supabase.from("terms").select("*").order("start_date", { ascending: false })).data ?? [] });

  // Start on the active term.
  useEffect(() => {
    if (!termId && terms?.length) setTermIdState(terms.find((t) => t.is_active)?.id ?? "");
  }, [terms, termId]);

  const assignment = assignments?.find((a) => a.id === classSubjectId);

  const { data: students, error: studentsError } = useQuery({
    queryKey: ["class-students", assignment?.class_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id, admission_number, profiles:user_id(full_name)").eq("class_id", assignment!.class_id);
      if (error) throw error;
      return (data ?? []).sort((a, b) => (a.profiles?.full_name ?? "").localeCompare(b.profiles?.full_name ?? ""));
    },
    enabled: !!assignment?.class_id,
  });
  const { data: existing } = useQuery({
    queryKey: ["results", assignment?.class_id, assignment?.subject_id, termId],
    queryFn: async () => (await supabase.from("results").select("*").eq("class_id", assignment!.class_id).eq("subject_id", assignment!.subject_id).eq("term_id", termId)).data ?? [],
    enabled: !!assignment && !!termId,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!assignment || !termId) return;
      // Refuse out-of-range scores instead of silently changing them.
      const bad = Object.values(scores).some((v) =>
        [[v.ca, 40], [v.exam, 60]].some(([val, max]) => val !== "" && (Number(val) < 0 || Number(val) > Number(max) || !Number.isInteger(Number(val)))));
      if (bad) throw new Error("Scores must be whole numbers: CA 0–40 and Exam 0–60.");
      const rows = Object.entries(scores).map(([student_id, v]) => ({
        student_id,
        subject_id: assignment.subject_id,
        class_id: assignment.class_id,
        term_id: termId,
        ca_score: Number(v.ca) || 0,
        exam_score: Number(v.exam) || 0,
      }));
      if (rows.length === 0) throw new Error("No scores have been changed.");
      const { error } = await supabase.from("results").upsert(rows, { onConflict: "student_id,subject_id,term_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["results"] }); setScores({}); toast({ title: "Results saved" }); },
    onError: (e) => toast({ title: "Couldn't save results", description: friendlyDbError(e), variant: "destructive" }),
  });

  const get = (sid: string) => {
    const ex = existing?.find((r) => r.student_id === sid);
    const s = scores[sid] ?? { ca: ex?.ca_score?.toString() ?? "", exam: ex?.exam_score?.toString() ?? "" };
    return s;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Enter Results</h1>
        <p className="text-muted-foreground">Record CA (max 40) and Exam (max 60) scores</p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Class & Subject</Label>
            <Select value={classSubjectId} onValueChange={setClassSubjectId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{assignments?.map((a) => <SelectItem key={a.id} value={a.id}>{a.classes?.name} — {a.subjects?.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Term</Label>
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
              <SelectContent>{terms?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} — {t.academic_year}{t.is_active ? " (active)" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-end"><Button onClick={() => save.mutate()} disabled={!assignment || !termId || save.isPending} className="w-full">Save Results</Button></div>
        </CardContent>
      </Card>

      {assignments?.length === 0 && (
        <p className="text-sm text-muted-foreground">You haven't been assigned any subjects yet. Ask the administrator to add you under Subject Teachers.</p>
      )}

      {assignment && termId && (
        <Card>
          <CardHeader><CardTitle className="font-heading text-base">Scores</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {studentsError && <p className="text-sm text-destructive">Couldn't load students: {friendlyDbError(studentsError)}</p>}
            {students?.length === 0 && <p className="text-sm text-muted-foreground">No students in this class yet.</p>}
            {students?.map((s) => {
              const v = get(s.id);
              const total = (Number(v.ca) || 0) + (Number(v.exam) || 0);
              const grade = total >= 70 ? "A" : total >= 60 ? "B" : total >= 50 ? "C" : total >= 40 ? "D" : "F";
              return (
                <div key={s.id} className="grid grid-cols-12 gap-2 items-center border rounded-lg p-3">
                  <div className="col-span-5">
                    <div className="font-medium text-sm">{s.profiles?.full_name ?? "Unnamed"}</div>
                    <div className="text-xs text-muted-foreground">{s.admission_number}</div>
                  </div>
                  <div className="col-span-2"><Input type="number" min={0} max={40} placeholder="CA" value={v.ca} onChange={(e) => setScores({ ...scores, [s.id]: { ...v, ca: e.target.value } })} /></div>
                  <div className="col-span-2"><Input type="number" min={0} max={60} placeholder="Exam" value={v.exam} onChange={(e) => setScores({ ...scores, [s.id]: { ...v, exam: e.target.value } })} /></div>
                  <div className="col-span-3 text-right text-sm"><span className="font-semibold">{total}/100</span> <span className="text-muted-foreground">({grade})</span></div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
