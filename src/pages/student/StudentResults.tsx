import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export default function StudentResults() {
  const { user } = useAuth();
  const [termId, setTermId] = useState("");

  const { data: profile } = useQuery({ queryKey: ["my-profile", user?.id], queryFn: async () => (await supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle()).data, enabled: !!user });
  const { data: student } = useQuery({ queryKey: ["my-student", user?.id], queryFn: async () => (await supabase.from("students").select("*, classes(name)").eq("user_id", user!.id).maybeSingle()).data, enabled: !!user });
  const { data: terms } = useQuery({ queryKey: ["terms"], queryFn: async () => (await supabase.from("terms").select("*").order("start_date", { ascending: false })).data ?? [] });

  // A report card is for one term; start on the active term.
  useEffect(() => {
    if (!termId && terms?.length) setTermId(terms.find((t) => t.is_active)?.id ?? "");
  }, [terms, termId]);
  const { data: results } = useQuery({
    queryKey: ["my-results", student?.id, termId],
    queryFn: async () => {
      let q = supabase.from("results").select("*, subjects(name, code), terms(name, academic_year)").eq("student_id", student!.id);
      if (termId) q = q.eq("term_id", termId);
      return (await q).data ?? [];
    },
    enabled: !!student?.id,
  });

  const total = results?.reduce((sum, r) => sum + (r.total ?? 0), 0) ?? 0;
  const avg = results && results.length > 0 ? Math.round(total / results.length) : 0;

  return (
    <div className="space-y-6 print:space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="font-heading text-2xl font-bold">My Results</h1>
        <div className="flex gap-2">
          <Select value={termId || "all"} onValueChange={(v) => setTermId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All terms" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All terms</SelectItem>
              {terms?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} — {t.academic_year}{t.is_active ? " (current)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print Report Card</Button>
        </div>
      </div>

      <Card className="print:border-none print:shadow-none">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Report Card</CardTitle>
          <div className="text-sm text-muted-foreground">
            {profile?.full_name} · {student?.classes?.name ?? "—"} · Adm #{student?.admission_number ?? "—"}
            {termId && terms && ` · ${terms.find((t) => t.id === termId)?.name ?? ""} ${terms.find((t) => t.id === termId)?.academic_year ?? ""}`}
          </div>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Subject</th>
                {!termId && <th>Term</th>}
                <th>CA (40)</th>
                <th>Exam (60)</th>
                <th>Total</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {results?.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2">{r.subjects?.name}</td>
                  {!termId && <td className="text-muted-foreground">{r.terms?.name} {r.terms?.academic_year}</td>}
                  <td>{r.ca_score}</td>
                  <td>{r.exam_score}</td>
                  <td className="font-medium">{r.total}</td>
                  <td><span className="font-bold">{r.grade}</span></td>
                </tr>
              ))}
              {results?.length === 0 && <tr><td colSpan={6} className="py-4 text-muted-foreground text-center">No results for this term yet.</td></tr>}
            </tbody>
            {/* An average only makes sense within one term. */}
            {termId && results && results.length > 0 && (
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-2">Average</td>
                  <td colSpan={3}></td>
                  <td>{avg}/100</td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
