import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";
import { formatTime, friendlyDbError } from "@/lib/utils";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function ManageTimetable() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ class_id: "", subject_id: "", teacher_id: "", day_of_week: "Monday", start_time: "08:00", end_time: "09:00", room: "" });

  const { data: classes } = useQuery({ queryKey: ["classes"], queryFn: async () => (await supabase.from("classes").select("*").order("name")).data ?? [] });
  const { data: subjects } = useQuery({ queryKey: ["subjects"], queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data ?? [] });
  const { data: teachers } = useQuery({ queryKey: ["teachers-with-profile"], queryFn: async () => (await supabase.from("teachers").select("id, user_id, profiles:user_id(full_name)")).data ?? [] });
  const { data: classSubjects } = useQuery({
    queryKey: ["class-subjects", form.class_id],
    queryFn: async () => (await supabase.from("class_subjects").select("*").eq("class_id", form.class_id)).data ?? [],
    enabled: !!form.class_id,
  });
  const { data: entries } = useQuery({
    queryKey: ["timetable", form.class_id],
    queryFn: async () => {
      let q = supabase.from("timetable_entries").select("*, classes(name), subjects(name)").order("start_time");
      if (form.class_id) q = q.eq("class_id", form.class_id);
      const rows = (await q).data ?? [];
      // Monday first, then by start time (the database would sort day names alphabetically).
      return rows.sort((a, b) => DAYS.indexOf(a.day_of_week) - DAYS.indexOf(b.day_of_week) || a.start_time.localeCompare(b.start_time));
    },
  });

  const teacherName = (id: string | null) => teachers?.find((t) => t.id === id)?.profiles?.full_name;

  // Picking a subject pre-selects the teacher already assigned to it for this class.
  const chooseSubject = (subject_id: string) => {
    const assigned = classSubjects?.find((cs) => cs.subject_id === subject_id)?.teacher_id;
    setForm({ ...form, subject_id, teacher_id: assigned ?? form.teacher_id });
  };

  // The database rejects clashes (class or teacher double-booked) with a clear message.
  const add = useMutation({
    mutationFn: async () => {
      if (formatTime(form.end_time) <= formatTime(form.start_time)) throw new Error("End time must be after start time");
      const { error } = await supabase.from("timetable_entries").insert({ ...form, room: form.room || null, teacher_id: form.teacher_id || null });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["timetable"] }); toast({ title: "Slot added" }); },
    onError: (e) => toast({ title: "Couldn't add slot", description: friendlyDbError(e), variant: "destructive" }),
  });

  // Make sure the class takes this subject. An existing teacher assignment is left alone;
  // change it under Subject Teachers.
  const upsertClassSubject = useMutation({
    mutationFn: async () => {
      if (!form.class_id || !form.subject_id) return;
      await supabase.from("class_subjects").upsert(
        { class_id: form.class_id, subject_id: form.subject_id, teacher_id: form.teacher_id || null },
        { onConflict: "class_id,subject_id", ignoreDuplicates: true },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["class-subjects"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("timetable_entries").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["timetable"] }); toast({ title: "Slot removed" }); },
    onError: (e) => toast({ title: "Failed", description: friendlyDbError(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Class Timetable</h1>
        <p className="text-muted-foreground">Assign subjects, teachers, and time slots to classes</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="font-heading text-base">Add Slot</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={async (e) => { e.preventDefault(); await upsertClassSubject.mutateAsync(); add.mutate(); }} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label>Class</Label>
              <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>{classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject</Label>
              <Select value={form.subject_id} onValueChange={chooseSubject}>
                <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>{subjects?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Teacher</Label>
              <Select value={form.teacher_id} onValueChange={(v) => setForm({ ...form, teacher_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>{teachers?.map((t) => <SelectItem key={t.id} value={t.id}>{t.profiles?.full_name || "Unnamed teacher"}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Day</Label>
              <Select value={form.day_of_week} onValueChange={(v) => setForm({ ...form, day_of_week: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Start</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
            <div><Label>End</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
            <div><Label>Room</Label><Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} /></div>
            <div className="flex items-end"><Button type="submit" className="w-full" disabled={!form.class_id || !form.subject_id || add.isPending}>Add Slot</Button></div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {entries?.length === 0 && <p className="text-sm text-muted-foreground">{form.class_id ? "No slots for this class yet." : "No timetable slots yet."}</p>}
        {entries?.map((e) => (
          <Card key={e.id}>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium">{e.classes?.name}</span> · {e.subjects?.name} · {e.day_of_week} {formatTime(e.start_time)}–{formatTime(e.end_time)}
                {e.room && ` · ${e.room}`} · <span className="text-muted-foreground">{teacherName(e.teacher_id) ?? "No teacher"}</span>
              </div>
              <Button size="icon" variant="ghost" className="text-destructive"
                onClick={() => { if (window.confirm(`Remove ${e.subjects?.name} on ${e.day_of_week} at ${formatTime(e.start_time)}?`)) del.mutate(e.id); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
