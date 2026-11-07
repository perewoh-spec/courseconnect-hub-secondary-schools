import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";
import { friendlyDbError } from "@/lib/utils";

const UNASSIGNED = "none";

// Which teacher teaches which subject to which class. This is what lets a teacher
// mark attendance and enter results for a class.
export default function ManageAssignments() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [classId, setClassId] = useState("");
  const [form, setForm] = useState({ subject_id: "", teacher_id: "" });

  const { data: classes } = useQuery({ queryKey: ["classes"], queryFn: async () => (await supabase.from("classes").select("*").order("name")).data ?? [] });
  const { data: subjects } = useQuery({ queryKey: ["subjects"], queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data ?? [] });
  const { data: teachers } = useQuery({
    queryKey: ["teachers-with-profile"],
    queryFn: async () => (await supabase.from("teachers").select("id, user_id, profiles:user_id(full_name)")).data ?? [],
  });
  const { data: assignments } = useQuery({
    queryKey: ["class-subjects", classId],
    queryFn: async () => (await supabase.from("class_subjects").select("*, subjects(name, code)").eq("class_id", classId)).data ?? [],
    enabled: !!classId,
  });

  const teacherName = (id: string | null) => teachers?.find((t) => t.id === id)?.profiles?.full_name ?? "Unassigned";

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("class_subjects").insert({
        class_id: classId, subject_id: form.subject_id, teacher_id: form.teacher_id && form.teacher_id !== UNASSIGNED ? form.teacher_id : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["class-subjects"] }); setForm({ subject_id: "", teacher_id: "" }); toast({ title: "Subject added to class" }); },
    onError: (e) => toast({ title: "Failed", description: friendlyDbError(e), variant: "destructive" }),
  });

  const changeTeacher = useMutation({
    mutationFn: async ({ id, teacher_id }: { id: string; teacher_id: string | null }) => {
      const { error } = await supabase.from("class_subjects").update({ teacher_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["class-subjects"] }); toast({ title: "Teacher updated" }); },
    onError: (e) => toast({ title: "Failed", description: friendlyDbError(e), variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("class_subjects").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["class-subjects"] }); toast({ title: "Subject removed from class" }); },
    onError: (e) => toast({ title: "Failed", description: friendlyDbError(e), variant: "destructive" }),
  });

  const assignedSubjectIds = new Set(assignments?.map((a) => a.subject_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Subject Teachers</h1>
        <p className="text-muted-foreground">Choose the subjects each class takes and who teaches them</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Label>Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="max-w-xs"><SelectValue placeholder="Select a class" /></SelectTrigger>
            <SelectContent>{classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      {classId && (
        <>
          <Card>
            <CardHeader><CardTitle className="font-heading text-base">Add a subject</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Subject</Label>
                <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>
                    {subjects?.filter((s) => !assignedSubjectIds.has(s.id)).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Teacher</Label>
                <Select value={form.teacher_id} onValueChange={(v) => setForm({ ...form, teacher_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned for now</SelectItem>
                    {teachers?.map((t) => <SelectItem key={t.id} value={t.id}>{t.profiles?.full_name || "Unnamed teacher"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => add.mutate()} disabled={!form.subject_id || add.isPending}>Add</Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {assignments?.length === 0 && <p className="text-sm text-muted-foreground">No subjects for this class yet.</p>}
            {assignments?.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{a.subjects?.code}</Badge>
                    <span className="font-medium">{a.subjects?.name}</span>
                    {!a.teacher_id && <Badge variant="secondary">No teacher</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={a.teacher_id ?? UNASSIGNED}
                      onValueChange={(v) => changeTeacher.mutate({ id: a.id, teacher_id: v === UNASSIGNED ? null : v })}>
                      <SelectTrigger className="w-[200px]"><SelectValue>{teacherName(a.teacher_id)}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {teachers?.map((t) => <SelectItem key={t.id} value={t.id}>{t.profiles?.full_name || "Unnamed teacher"}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="text-destructive"
                      onClick={() => { if (window.confirm(`Remove ${a.subjects?.name} from this class?`)) remove.mutate(a.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
