import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Mail, Phone, Calendar, IdCard, Briefcase, UserCheck,
  Users, MapPin, Building2,
} from "lucide-react";
import { format } from "date-fns";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  department: string | null;
  designation: string | null;
  company_wing: string | null;
  service_status: string | null;
  employee_status: string | null;
  joining_date: string | null;
  reporting_manager_id: string | null;
};

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : "—");
const fmtDate = (d: string | null | undefined) =>
  d ? format(new Date(d), "MMM d, yyyy") : "—";

const Row = ({
  icon: Icon, label, value,
}: { icon: any; label: string; value: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    <Icon className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium break-words">{value}</div>
    </div>
  </div>
);

const EmployeeProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<string>("employee");
  const [managerName, setManagerName] = useState<string>("—");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const [{ data: p, error: pErr }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id).maybeSingle(),
      ]);
      if (pErr || !p) {
        setError(pErr?.message || "Employee not found");
        setLoading(false);
        return;
      }
      setProfile(p as Profile);
      setRole((r?.role as string) || "employee");
      if (p.reporting_manager_id) {
        const { data: m } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", p.reporting_manager_id)
          .maybeSingle();
        setManagerName(m?.full_name || m?.email || "—");
      } else {
        setManagerName("—");
      }
      setLoading(false);
    })();
  }, [id]);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/employees");
  };

  if (loading) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">Loading profile…</CardContent></Card>
    );
  }
  if (error || !profile) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-destructive">{error || "Employee not found"}</p>
          <Button variant="outline" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back to Directory</Button>
        </CardContent>
      </Card>
    );
  }

  const initials = (profile.full_name || profile.email || "?").slice(0, 2).toUpperCase();
  const statusClass =
    profile.employee_status === "Active"
      ? "bg-green-100 text-green-700 border-green-300"
      : profile.employee_status === "Resigned"
      ? "bg-red-100 text-red-700 border-red-300"
      : "bg-gray-100 text-gray-700 border-gray-300";

  return (
    <div className="space-y-4">
      <div>
        <Button variant="outline" size="sm" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Directory
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Avatar className="h-24 w-24">
              <AvatarImage src={profile.photo_url || undefined} />
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold truncate">{fmt(profile.full_name)}</h1>
              <p className="text-muted-foreground">{fmt(profile.designation)}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {profile.department && <Badge variant="outline">{profile.department}</Badge>}
                {profile.company_wing && <Badge variant="secondary">{profile.company_wing}</Badge>}
                <Badge variant="outline" className={statusClass}>{fmt(profile.employee_status)}</Badge>
                <Badge>{role}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Row icon={Mail} label="Email" value={fmt(profile.email)} />
            <Row icon={Phone} label="Phone" value={fmt(profile.phone)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Employment</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Row icon={IdCard} label="Employee ID" value={<span className="font-mono text-xs">{profile.id}</span>} />
            <Row icon={Calendar} label="Hire Date" value={fmtDate(profile.joining_date)} />
            <Row icon={Briefcase} label="Employment Type" value={fmt(profile.service_status)} />
            <Row icon={UserCheck} label="Status" value={fmt(profile.employee_status)} />
            <Row icon={Users} label="Reporting Manager" value={managerName} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Location</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Row icon={Building2} label="Wing" value={fmt(profile.company_wing)} />
            <Row icon={MapPin} label="Department" value={fmt(profile.department)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmployeeProfile;
