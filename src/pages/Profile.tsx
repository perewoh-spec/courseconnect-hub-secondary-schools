import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { errorMessage } from "@/lib/utils";

export default function Profile() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [teacherForm, setTeacherForm] = useState({ phone: "", specialization: "" });
  const [saving, setSaving] = useState(false);
  const [passwords, setPasswords] = useState({ password: "", confirm: "" });
  const [changingPassword, setChangingPassword] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle()).data,
    enabled: !!user,
  });
  const { data: student } = useQuery({
    queryKey: ["my-student", user?.id],
    queryFn: async () => (await supabase.from("students").select("*, classes(*)").eq("user_id", user!.id).maybeSingle()).data,
    enabled: !!user && role === "student",
  });
  const { data: teacher } = useQuery({
    queryKey: ["my-teacher", user?.id],
    queryFn: async () => (await supabase.from("teachers").select("*").eq("user_id", user!.id).maybeSingle()).data,
    enabled: !!user && role === "teacher",
  });

  useEffect(() => {
    if (profile) setFullName(profile.full_name);
  }, [profile]);
  useEffect(() => {
    if (teacher) setTeacherForm({ phone: teacher.phone ?? "", specialization: teacher.specialization ?? "" });
  }, [teacher]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("user_id", user!.id);
      if (error) throw error;
      if (teacher) {
        const { error: tErr } = await supabase.from("teachers")
          .update({ phone: teacherForm.phone.trim() || null, specialization: teacherForm.specialization.trim() || null })
          .eq("id", teacher.id);
        if (tErr) throw tErr;
      }
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      qc.invalidateQueries({ queryKey: ["my-teacher"] });
      toast({ title: "Profile saved" });
    } catch (error) {
      toast({ title: "Error", description: errorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.password !== passwords.confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwords.password });
    setChangingPassword(false);
    if (error) {
      toast({ title: "Error", description: errorMessage(error), variant: "destructive" });
    } else {
      toast({ title: "Password changed" });
      setPasswords({ password: "", confirm: "" });
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-heading text-2xl font-bold">My Profile</h1>
        <p className="text-muted-foreground">Your account details and password</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Account</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                {role === "student" && (
                  <>
                    <div className="space-y-2">
                      <Label>Admission Number</Label>
                      <Input value={student?.admission_number ?? ""} disabled placeholder="Not assigned yet" />
                    </div>
                    <div className="space-y-2">
                      <Label>Class</Label>
                      <Input value={student?.classes?.name ?? ""} disabled placeholder="Not assigned yet" />
                    </div>
                  </>
                )}
                {role === "teacher" && (
                  <>
                    <div className="space-y-2">
                      <Label>Staff ID</Label>
                      <Input value={teacher?.staff_id ?? ""} disabled placeholder="Not assigned yet" />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input type="tel" value={teacherForm.phone} onChange={(e) => setTeacherForm((f) => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Specialization</Label>
                      <Input value={teacherForm.specialization} onChange={(e) => setTeacherForm((f) => ({ ...f, specialization: e.target.value }))} />
                    </div>
                  </>
                )}
              </div>
              {role !== "admin" && (
                <p className="text-xs text-muted-foreground">Admission numbers, staff IDs and classes are set by the school administrator.</p>
              )}
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-heading text-lg">Change Password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>New Password</Label>
                <Input type="password" value={passwords.password} onChange={(e) => setPasswords((p) => ({ ...p, password: e.target.value }))} required minLength={6} autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <Input type="password" value={passwords.confirm} onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))} required minLength={6} autoComplete="new-password" />
              </div>
            </div>
            <Button type="submit" variant="outline" disabled={changingPassword}>
              {changingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
