import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Search } from "lucide-react";
import { errorMessage } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
const ROLE_ORDER: AppRole[] = ["admin", "teacher", "student"];

export default function ManageUsers() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      // One role per user; if there were ever two, show the strongest.
      const roleMap = new Map<string, AppRole>();
      (roles ?? []).forEach((r) => {
        const current = roleMap.get(r.user_id);
        if (!current || ROLE_ORDER.indexOf(r.role) < ROLE_ORDER.indexOf(current)) roleMap.set(r.user_id, r.role);
      });
      return (profiles ?? []).map((p) => ({ ...p, role: roleMap.get(p.user_id) ?? ("student" as AppRole) }));
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("set_user_role", { _user_id: userId, _role: role });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["all-roles"] });
      qc.invalidateQueries({ queryKey: ["all-teachers"] });
      qc.invalidateQueries({ queryKey: ["all-students"] });
      toast({ title: "Role updated" });
    },
    onError: (e) => toast({ title: "Couldn't change role", description: errorMessage(e), variant: "destructive" }),
  });

  const changeRole = (userId: string, name: string, role: AppRole) => {
    if (window.confirm(`Make ${name} a ${role}?`)) setRole.mutate({ userId, role });
  };

  const q = search.trim().toLowerCase();
  const filtered = (users ?? []).filter((u) => !q || [u.full_name, u.email].some((v) => v?.toLowerCase().includes(q)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Users & Roles</h1>
        <p className="text-muted-foreground">Everyone who has signed up, and what they can do</p>
        <p className="text-xs text-muted-foreground mt-1">
          New users sign up as students. Make staff teachers here, then add their details under Teachers and their subjects under Subject Teachers.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name or email..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-[180px]">Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No users found.</TableCell></TableRow>
              ) : (
                filtered.map((u) => {
                  const isMe = u.user_id === currentUser?.id;
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div>{u.full_name || "—"} {isMe && <Badge variant="outline" className="ml-1">You</Badge>}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Select value={u.role} disabled={isMe || setRole.isPending}
                          onValueChange={(v) => changeRole(u.user_id, u.full_name || u.email || "this user", v as AppRole)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="student">Student</SelectItem>
                            <SelectItem value="teacher">Teacher</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
