import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { friendlyDbError } from "@/lib/utils";

const LEVELS = ["JSS1", "JSS2", "JSS3", "SS1", "SS2", "SS3"];

export default function ManageClasses() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", level: "JSS1", stream: "", academic_year: "2025/2026" });

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await supabase.from("classes").select("*").order("name")).data ?? [],
  });
  const { data: studentCounts } = useQuery({
    queryKey: ["class-student-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("class_id");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((s) => { if (s.class_id) counts[s.class_id] = (counts[s.class_id] ?? 0) + 1; });
      return counts;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("classes").insert(form);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["classes"] }); setForm({ name: "", level: "JSS1", stream: "", academic_year: "2025/2026" }); toast({ title: "Class created" }); },
    onError: (e) => toast({ title: "Failed", description: friendlyDbError(e).replace("That already exists.", "A class with this name already exists."), variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("classes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["classes"] }); toast({ title: "Class deleted" }); },
    onError: (e) => toast({ title: "Couldn't delete class", description: friendlyDbError(e), variant: "destructive" }),
  });

  const confirmDelete = (c: { id: string; name: string }) => {
    const n = studentCounts?.[c.id] ?? 0;
    const warning = n > 0 ? ` ${n} student(s) will be left without a class, and its timetable will be removed.` : "";
    if (window.confirm(`Delete ${c.name}?${warning}`)) del.mutate(c.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Classes</h1>
        <p className="text-muted-foreground">Create and manage school classes</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="font-heading text-base">Add Class</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="JSS1A" required /></div>
            <div>
              <Label>Level</Label>
              <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Stream</Label><Input value={form.stream} onChange={(e) => setForm({ ...form, stream: e.target.value })} placeholder="A" /></div>
            <div><Label>Academic Year</Label><Input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} /></div>
            <div className="flex items-end"><Button type="submit" disabled={create.isPending} className="w-full">Add</Button></div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {classes?.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.level} · {c.academic_year} · {studentCounts?.[c.id] ?? 0} students</div>
              </div>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirmDelete(c)}><Trash2 className="h-4 w-4" /></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
