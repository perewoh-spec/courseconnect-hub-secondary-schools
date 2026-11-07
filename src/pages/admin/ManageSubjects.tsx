import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";
import { friendlyDbError } from "@/lib/utils";

export default function ManageSubjects() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", code: "", description: "" });

  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("subjects").insert(form); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subjects"] }); setForm({ name: "", code: "", description: "" }); toast({ title: "Subject added" }); },
    onError: (e) => toast({ title: "Failed", description: friendlyDbError(e).replace("That already exists.", "A subject with this code already exists."), variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("subjects").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subjects"] }); toast({ title: "Subject deleted" }); },
    onError: (e) => toast({ title: "Couldn't delete subject", description: friendlyDbError(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Subjects</h1>
        <p className="text-muted-foreground">Manage the school subject catalogue</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="font-heading text-base">Add Subject</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mathematics" required /></div>
            <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MTH" required /></div>
            <div className="md:col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={1} /></div>
            <div className="md:col-span-4"><Button type="submit" disabled={create.isPending}>Add Subject</Button></div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {subjects?.map((s) => (
          <Card key={s.id}>
            <CardContent className="p-4 flex items-start justify-between">
              <div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.code}</div>
                {s.description && <p className="text-sm mt-2">{s.description}</p>}
              </div>
              <Button size="icon" variant="ghost" className="text-destructive"
                onClick={() => { if (window.confirm(`Delete ${s.name}? It will be removed from every class and timetable.`)) del.mutate(s.id); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
