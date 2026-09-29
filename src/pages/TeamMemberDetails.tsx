import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IdCard, Users } from "lucide-react";
import { toast } from "sonner";
import { PERSONAL_INFO_FIELDS, TEAM_MEMBER_CONTACT_FIELDS } from "@/lib/personalInfoFields";

type ProfileRow = { id: string; full_name: string | null; email: string | null } & Record<string, any>;

const ALL_FIELDS = [...TEAM_MEMBER_CONTACT_FIELDS, ...PERSONAL_INFO_FIELDS];

const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

const TeamMemberDetails = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      setEmployees(data || []);
    })();
  }, [isAdmin]);

  const targetId = isAdmin ? selectedId : user?.id;

  const fetchProfile = useCallback(async () => {
    if (!targetId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").eq("id", targetId).maybeSingle();
    setProfile(data as ProfileRow | null);
    setForm(data || {});
    setLoading(false);
  }, [targetId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const save = async () => {
    if (!targetId) return;
    setSaving(true);
    const payload: Record<string, unknown> = {};
    ALL_FIELDS.forEach(({ key, type }) => {
      const v = form[key];
      payload[key] = type === "number" ? (v === "" || v == null ? null : Number(v)) : (v || null);
    });
    const { error } = await supabase.from("profiles").update(payload as never).eq("id", targetId);
    if (error) toast.error(error.message);
    else {
      toast.success("Team member details saved");
      setProfile((p) => (p ? { ...p, ...payload } : p));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><IdCard className="h-5 w-5" /> Team Member Details</CardTitle>
          <CardDescription>
            {isAdmin
              ? "Personal and contact information for any employee. Only admins can edit these fields."
              : "Your personal and contact information. Only an admin can edit these fields."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdmin && (
            <div className="max-w-sm">
              <Label>Employee</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger><SelectValue placeholder="Select an employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !targetId || !profile ? (
            <div className="text-center text-muted-foreground py-8">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              {isAdmin ? "Select an employee to view their details." : "No profile found."}
            </div>
          ) : isAdmin ? (
            <div className="grid gap-4 md:grid-cols-2">
              {ALL_FIELDS.map(({ key, label, type }) => (
                <div key={key} className={type === "textarea" ? "md:col-span-2 space-y-1" : "space-y-1"}>
                  <Label className="text-xs">{label}</Label>
                  {type === "textarea" ? (
                    <Textarea
                      rows={2}
                      value={form[key] ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      type={type === "date" ? "date" : type === "number" ? "number" : "text"}
                      value={form[key] ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
              <div className="md:col-span-2">
                <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {ALL_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-sm font-medium break-words">{fmt(profile[key])}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamMemberDetails;
