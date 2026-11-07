import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Search } from "lucide-react";
import { friendlyDbError } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type StudentFields = Partial<Pick<Database["public"]["Tables"]["students"]["Row"],
  "admission_number" | "class_id" | "guardian_name" | "guardian_phone" | "date_of_birth" | "gender">>;

export default function ManageStudents() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Record<string, StudentFields>>({});
  const [search, setSearch] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const { data: profiles } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("*").order("full_name")).data ?? [],
  });
  const { data: roles } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => (await supabase.from("user_roles").select("user_id, role")).data ?? [],
  });
  const { data: students } = useQuery({
    queryKey: ["all-students"],
    queryFn: async () => (await supabase.from("students").select("*, classes(name)")).data ?? [],
  });
  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await supabase.from("classes").select("*").order("name")).data ?? [],
  });

  const studentUserIds = new Set(roles?.filter((r) => r.role === "student").map((r) => r.user_id));
  const q = search.trim().toLowerCase();
  const studentProfiles = (profiles ?? []).filter((p) => {
    if (!studentUserIds.has(p.user_id)) return false;
    const record = students?.find((s) => s.user_id === p.user_id);
    if (unassignedOnly && record?.class_id) return false;
    return !q || [p.full_name, p.email, record?.admission_number, record?.classes?.name].some((v) => v?.toLowerCase().includes(q));
  });

  const upsert = useMutation({
    mutationFn: async ({ user_id, payload }: { user_id: string; payload: StudentFields }) => {
      const existing = students?.find((s) => s.user_id === user_id);
      if (existing) {
        const { error } = await supabase.from("students").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("students").insert({ user_id, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: (_d, { user_id }) => {
      qc.invalidateQueries({ queryKey: ["all-students"] });
      setEditing((ed) => { const next = { ...ed }; delete next[user_id]; return next; });
      toast({ title: "Student record saved" });
    },
    onError: (e) => toast({ title: "Failed", description: friendlyDbError(e).replace("That already exists.", "That admission number is already in use."), variant: "destructive" }),
  });

  // One database call changes the role and creates the teacher record.
  const promoteToTeacher = useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await supabase.rpc("set_user_role", { _user_id: user_id, _role: "teacher" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries(); toast({ title: "Promoted to teacher" }); },
    onError: (e) => toast({ title: "Failed", description: friendlyDbError(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Students</h1>
        <p className="text-muted-foreground">Manage student records and class assignments</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, email, admission # or class..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={unassignedOnly} onCheckedChange={setUnassignedOnly} /> Not in a class yet
        </label>
      </div>

      <div className="space-y-3">
        {studentProfiles.map((p) => {
          const record = students?.find((s) => s.user_id === p.user_id);
          const e = editing[p.user_id] ?? {};
          const get = (k: keyof StudentFields) => e[k] ?? record?.[k] ?? "";
          const set = (k: keyof StudentFields, v: string) => setEditing({ ...editing, [p.user_id]: { ...e, [k]: v } });
          return (
            <Card key={p.user_id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-heading flex flex-wrap items-center gap-2">
                  {p.full_name || p.email}
                  {!record?.class_id && <Badge variant="secondary">No class</Badge>}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{p.email}</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div><Label>Admission #</Label><Input value={get("admission_number")} onChange={(ev) => set("admission_number", ev.target.value)} /></div>
                  <div>
                    <Label>Class</Label>
                    <Select value={get("class_id") || undefined} onValueChange={(v) => set("class_id", v)}>
                      <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                      <SelectContent>{classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Date of Birth</Label><Input type="date" value={get("date_of_birth")} onChange={(ev) => set("date_of_birth", ev.target.value)} /></div>
                  <div>
                    <Label>Gender</Label>
                    <Select value={get("gender") || undefined} onValueChange={(v) => set("gender", v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Guardian</Label><Input value={get("guardian_name")} onChange={(ev) => set("guardian_name", ev.target.value)} /></div>
                  <div><Label>Guardian Phone</Label><Input type="tel" value={get("guardian_phone")} onChange={(ev) => set("guardian_phone", ev.target.value)} /></div>
                  <div className="flex items-end gap-2 md:col-span-2">
                    <Button onClick={() => upsert.mutate({ user_id: p.user_id, payload: {
                      admission_number: get("admission_number") || null, class_id: get("class_id") || null,
                      date_of_birth: get("date_of_birth") || null, gender: get("gender") || null,
                      guardian_name: get("guardian_name") || null, guardian_phone: get("guardian_phone") || null,
                    } })} disabled={upsert.isPending}>Save</Button>
                    <Button variant="outline" disabled={promoteToTeacher.isPending} onClick={() => {
                      if (window.confirm(`Make ${p.full_name || p.email} a teacher? They will no longer be listed as a student.`)) promoteToTeacher.mutate(p.user_id);
                    }}>→ Teacher</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {studentProfiles.length === 0 && (
          <p className="text-sm text-muted-foreground">{q || unassignedOnly ? "No students match." : "No students registered yet. Students appear here after they sign up."}</p>
        )}
      </div>
    </div>
  );
}
