import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Search } from "lucide-react";
import { friendlyDbError } from "@/lib/utils";

type TeacherFields = { staff_id?: string; phone?: string; specialization?: string };

export default function ManageTeachers() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Record<string, TeacherFields>>({});
  const [search, setSearch] = useState("");

  const { data: profiles } = useQuery({ queryKey: ["all-profiles"], queryFn: async () => (await supabase.from("profiles").select("*")).data ?? [] });
  const { data: roles } = useQuery({ queryKey: ["all-roles"], queryFn: async () => (await supabase.from("user_roles").select("user_id, role")).data ?? [] });
  const { data: teachers } = useQuery({ queryKey: ["all-teachers"], queryFn: async () => (await supabase.from("teachers").select("*")).data ?? [] });
  const { data: assignments } = useQuery({
    queryKey: ["all-class-subjects"],
    queryFn: async () => (await supabase.from("class_subjects").select("teacher_id, classes(name), subjects(name)")).data ?? [],
  });

  const teacherUserIds = new Set(roles?.filter((r) => r.role === "teacher").map((r) => r.user_id));
  const q = search.trim().toLowerCase();
  const teacherProfiles = (profiles ?? []).filter((p) => teacherUserIds.has(p.user_id) &&
    (!q || [p.full_name, p.email, teachers?.find((t) => t.user_id === p.user_id)?.staff_id].some((v) => v?.toLowerCase().includes(q))));

  const save = useMutation({
    mutationFn: async ({ user_id, payload }: { user_id: string; payload: { staff_id: string | null; phone: string | null; specialization: string | null } }) => {
      const existing = teachers?.find((t) => t.user_id === user_id);
      if (existing) {
        const { error } = await supabase.from("teachers").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("teachers").insert({ user_id, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-teachers"] }); toast({ title: "Saved" }); },
    onError: (e) => toast({ title: "Failed", description: friendlyDbError(e).replace("That already exists.", "That staff ID is already in use."), variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Teachers</h1>
        <p className="text-muted-foreground">Manage teacher profiles</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search name, email or staff ID..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="space-y-3">
        {teacherProfiles.map((p) => {
          const rec = teachers?.find((t) => t.user_id === p.user_id);
          const e = editing[p.user_id] ?? {};
          const get = (k: keyof TeacherFields) => e[k] ?? rec?.[k] ?? "";
          const teaches = assignments?.filter((a) => rec && a.teacher_id === rec.id) ?? [];
          return (
            <Card key={p.user_id}>
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-base">{p.full_name || p.email}</CardTitle>
                <div className="flex flex-wrap gap-1 pt-1">
                  {teaches.length === 0
                    ? <span className="text-xs text-muted-foreground">No subjects assigned yet (see Subject Teachers)</span>
                    : teaches.map((a, i) => <Badge key={i} variant="secondary">{a.subjects?.name} · {a.classes?.name}</Badge>)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div><Label>Staff ID</Label><Input value={get("staff_id")} onChange={(ev) => setEditing({ ...editing, [p.user_id]: { ...e, staff_id: ev.target.value } })} /></div>
                  <div><Label>Phone</Label><Input value={get("phone")} onChange={(ev) => setEditing({ ...editing, [p.user_id]: { ...e, phone: ev.target.value } })} /></div>
                  <div><Label>Specialization</Label><Input value={get("specialization")} onChange={(ev) => setEditing({ ...editing, [p.user_id]: { ...e, specialization: ev.target.value } })} /></div>
                  <div className="flex items-end"><Button onClick={() => save.mutate({ user_id: p.user_id, payload: { staff_id: get("staff_id") || null, phone: get("phone") || null, specialization: get("specialization") || null } })}>Save</Button></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {teacherProfiles.length === 0 && (
          <p className="text-sm text-muted-foreground">{q ? "No teachers match." : "No teachers yet. Make a registered user a teacher under Users & Roles."}</p>
        )}
      </div>
    </div>
  );
}
