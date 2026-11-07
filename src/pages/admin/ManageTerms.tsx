import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";
import { formatDate, friendlyDbError } from "@/lib/utils";

export default function ManageTerms() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "First Term", academic_year: "2025/2026", start_date: "", end_date: "" });

  const { data: terms } = useQuery({ queryKey: ["terms"], queryFn: async () => (await supabase.from("terms").select("*").order("start_date", { ascending: false })).data ?? [] });

  const create = useMutation({
    mutationFn: async () => {
      if (form.start_date && form.end_date && form.end_date < form.start_date) throw new Error("The term can't end before it starts");
      const { error } = await supabase.from("terms").insert({ ...form, start_date: form.start_date || null, end_date: form.end_date || null });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["terms"] }); toast({ title: "Term added" }); },
    onError: (e) => toast({ title: "Failed", description: friendlyDbError(e), variant: "destructive" }),
  });
  // One database call switches the active term, so there's never more than one.
  const setActive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("set_active_term", { _term_id: id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["terms"] }); toast({ title: "Active term changed" }); },
    onError: (e) => toast({ title: "Failed", description: friendlyDbError(e), variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("terms").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["terms"] }); toast({ title: "Term deleted" }); },
    onError: (e) => toast({ title: "Couldn't delete term", description: friendlyDbError(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Academic Terms</h1>
        <p className="text-muted-foreground">Define and activate school terms</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="font-heading text-base">Add Term</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><Label>Academic Year</Label><Input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} required /></div>
            <div><Label>Start</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><Label>End</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            <div className="flex items-end"><Button type="submit" className="w-full">Add</Button></div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {terms?.map((t) => (
          <Card key={t.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold flex items-center gap-2">{t.name} <span className="text-muted-foreground text-sm">— {t.academic_year}</span> {t.is_active && <Badge>Active</Badge>}</div>
                <div className="text-xs text-muted-foreground">{formatDate(t.start_date)} → {formatDate(t.end_date)}</div>
              </div>
              <div className="flex gap-2">
                {!t.is_active && <Button size="sm" variant="outline" onClick={() => setActive.mutate(t.id)}>Set Active</Button>}
                <Button size="icon" variant="ghost" className="text-destructive"
                  onClick={() => { if (window.confirm(`Delete ${t.name} (${t.academic_year})?`)) del.mutate(t.id); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
