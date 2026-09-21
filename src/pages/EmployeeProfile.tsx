import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Mail, Phone, Calendar, IdCard, Briefcase, UserCheck,
  Users, MapPin, Building2, TrendingUp, DollarSign, FolderKanban, UserCog,
  ClipboardList,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

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
  promotion_date: string | null;
  reporting_manager_id: string | null;
  base_salary: number | null;
  hourly_overtime_rate: number | null;
  pf_contribution_pct: number | null;
  date_of_birth: string | null;
  national_id: string | null;
  passport_number: string | null;
  birth_reg_number: string | null;
  blood_group: string | null;
  religion: string | null;
  father_name: string | null;
  mother_name: string | null;
  present_address: string | null;
  permanent_address: string | null;
  ongoing_education: string | null;
  marital_status: string | null;
  spouse_name: string | null;
  children_count: number | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_swift_code: string | null;
  bank_routing_number: string | null;
};

const PERSONAL_INFO_FIELDS: { key: keyof Profile; label: string; type?: "text" | "date" | "number" | "textarea" }[] = [
  { key: "date_of_birth", label: "Date of Birth", type: "date" },
  { key: "national_id", label: "National ID Number" },
  { key: "passport_number", label: "Passport Number" },
  { key: "birth_reg_number", label: "Birth Registration Number" },
  { key: "blood_group", label: "Blood Group" },
  { key: "religion", label: "Religion" },
  { key: "father_name", label: "Father's Name" },
  { key: "mother_name", label: "Mother's Name" },
  { key: "marital_status", label: "Marital Status" },
  { key: "spouse_name", label: "Spouse's Name" },
  { key: "children_count", label: "Number of Children", type: "number" },
  { key: "ongoing_education", label: "Ongoing Education / Studies" },
  { key: "present_address", label: "Present Address", type: "textarea" },
  { key: "permanent_address", label: "Permanent Address", type: "textarea" },
  { key: "emergency_contact_name", label: "Emergency Contact Name" },
  { key: "emergency_contact_phone", label: "Emergency Contact Mobile" },
  { key: "emergency_contact_relationship", label: "Emergency Contact Relationship" },
  { key: "bank_account_name", label: "Bank Account Name" },
  { key: "bank_account_number", label: "Bank Account Number" },
  { key: "bank_name", label: "Bank Name" },
  { key: "bank_branch", label: "Bank Branch" },
  { key: "bank_swift_code", label: "SWIFT Code" },
  { key: "bank_routing_number", label: "Routing Number" },
];

type Increment = {
  id: string;
  effective_from: string;
  effective_to: string | null;
  base_salary: number;
  increment_amount: number;
  increment_pct: number;
  cycle_label: string;
  reason: string | null;
};

type DirectReport = {
  id: string;
  full_name: string | null;
  email: string | null;
  designation: string | null;
  photo_url: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  project_id: string;
  projects?: { name: string | null; key: string | null } | null;
};

const fmt = (v: string | null | undefined) => (v && v.trim() ? v : "—");
const fmtDate = (d: string | null | undefined) =>
  d ? format(new Date(d), "MMM d, yyyy") : "—";
const fmtMoney = (n: number | null | undefined, currency = "BDT") =>
  n == null || isNaN(Number(n)) ? "—" : `${currency} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const initialsOf = (name?: string | null, email?: string | null) =>
  (name || email || "?").slice(0, 2).toUpperCase();

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

const statusVariant = (s: string): "default" | "secondary" | "outline" | "destructive" => {
  switch (s) {
    case "done":
    case "completed": return "default";
    case "in_progress": return "secondary";
    case "blocked": return "destructive";
    default: return "outline";
  }
};

const EmployeeProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<string>("employee");
  const [manager, setManager] = useState<{ id: string; name: string } | null>(null);
  const [increments, setIncrements] = useState<Increment[]>([]);
  const [reports, setReports] = useState<DirectReport[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [showReports, setShowReports] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personalForm, setPersonalForm] = useState<Partial<Profile>>({});
  const [savingPersonal, setSavingPersonal] = useState(false);
  const isSelf = !!user && user.id === id;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: p, error: pErr }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id).maybeSingle(),
      ]);
      if (cancelled) return;
      if (pErr || !p) {
        setError(pErr?.message || "Employee not found");
        setLoading(false);
        return;
      }
      setProfile(p as Profile);
      setPersonalForm(p as Profile);
      setRole((r?.role as string) || "employee");

      const [mgrRes, incRes, repRes, taskRes] = await Promise.all([
        p.reporting_manager_id
          ? supabase.from("profiles").select("id, full_name, email").eq("id", p.reporting_manager_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("salary_increments").select("*").eq("user_id", id).order("effective_from", { ascending: false }),
        supabase.from("profiles").select("id, full_name, email, designation, photo_url").eq("reporting_manager_id", id),
        supabase.from("tasks")
          .select("id, title, status, priority, due_date, project_id, projects(name, key)")
          .eq("assignee_id", id)
          .order("updated_at", { ascending: false })
          .limit(50),
      ]);
      if (cancelled) return;
      const m: any = mgrRes.data;
      setManager(m ? { id: m.id, name: m.full_name || m.email || "—" } : null);
      setIncrements((incRes.data as Increment[]) || []);
      setReports((repRes.data as DirectReport[]) || []);
      setTasks((taskRes.data as any[]) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/employees"));

  const savePersonalInfo = async () => {
    if (!id || !isSelf) return;
    setSavingPersonal(true);
    const payload: Record<string, unknown> = {};
    PERSONAL_INFO_FIELDS.forEach(({ key, type }) => {
      const v = personalForm[key];
      payload[key] = type === "number" ? (v === "" || v == null ? null : Number(v)) : (v || null);
    });
    const { error } = await supabase.from("profiles").update(payload as never).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Personal information saved");
      setProfile((p) => (p ? { ...p, ...payload } as Profile : p));
    }
    setSavingPersonal(false);
  };

  const salaryBreakdown = useMemo(() => {
    const gross = Number(profile?.base_salary || 0);
    // Common convention: Basic = 60%, Allowances = 40% (display-only when no detailed fields exist)
    const basic = gross * 0.6;
    const allowances = gross - basic;
    return { gross, basic, allowances };
  }, [profile]);

  if (loading) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">Loading profile…</CardContent></Card>;
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

  const initials = initialsOf(profile.full_name, profile.email);
  const statusClass =
    profile.employee_status === "Active"
      ? "bg-green-100 text-green-700 border-green-300"
      : profile.employee_status === "Resigned"
      ? "bg-red-100 text-red-700 border-red-300"
      : "bg-gray-100 text-gray-700 border-gray-300";

  const reportCount = reports.length;

  return (
    <div className="space-y-4">
      <div>
        <Button variant="outline" size="sm" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Directory
        </Button>
      </div>

      {/* Header */}
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

            {reportCount > 0 && (
              <button
                type="button"
                onClick={() => setShowReports(true)}
                className="rounded-lg border bg-card hover:bg-accent transition-colors p-4 text-left min-w-[180px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <UserCog className="h-4 w-4" /> Employees Reporting
                </div>
                <div className="text-3xl font-bold mt-1">{reportCount}</div>
                <div className="text-xs text-primary mt-1">Click to view list →</div>
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="personal">Personal Info</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="tasks">Projects & Tasks</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4">
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
                <Row icon={Briefcase} label="Designation" value={fmt(profile.designation)} />
                <Row icon={Calendar} label="Joining Date" value={fmtDate(profile.joining_date)} />
                <Row icon={UserCheck} label="Date of Permanency" value={fmtDate(profile.promotion_date)} />
                <Row icon={Briefcase} label="Employment Type" value={fmt(profile.service_status)} />
                <Row icon={Users} label="Reporting To" value={
                  manager
                    ? <Link to={`/employees/${manager.id}`} className="text-primary hover:underline">{manager.name}</Link>
                    : "—"
                } />
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
        </TabsContent>

        {/* PERSONAL INFO */}
        <TabsContent value="personal" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Personal Information</CardTitle>
              <CardDescription>
                {isSelf
                  ? "Fill this in yourself — it's used for HR records and only visible to you and management."
                  : "Filled in by the account holder. Read-only here."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isSelf ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {PERSONAL_INFO_FIELDS.map(({ key, label, type }) => (
                    <div key={key} className={type === "textarea" ? "md:col-span-2 space-y-1" : "space-y-1"}>
                      <Label className="text-xs">{label}</Label>
                      {type === "textarea" ? (
                        <Textarea
                          rows={2}
                          value={(personalForm[key] as string) || ""}
                          onChange={(e) => setPersonalForm((f) => ({ ...f, [key]: e.target.value }))}
                        />
                      ) : (
                        <Input
                          type={type === "date" ? "date" : type === "number" ? "number" : "text"}
                          value={(personalForm[key] as string | number) ?? ""}
                          onChange={(e) => setPersonalForm((f) => ({ ...f, [key]: e.target.value }))}
                        />
                      )}
                    </div>
                  ))}
                  <div className="md:col-span-2">
                    <Button onClick={savePersonalInfo} disabled={savingPersonal}>
                      {savingPersonal ? "Saving..." : "Save Personal Information"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {PERSONAL_INFO_FIELDS.map(({ key, label }) => (
                    <Row key={key} icon={ClipboardList} label={label} value={fmt(profile[key] != null ? String(profile[key]) : null)} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FINANCIAL */}
        <TabsContent value="financial" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" /> Gross Salary</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{fmtMoney(salaryBreakdown.gross)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Basic (≈60%)</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{fmtMoney(salaryBreakdown.basic)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Allowances (≈40%)</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{fmtMoney(salaryBreakdown.allowances)}</div></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Promotion & Increment History</CardTitle>
            </CardHeader>
            <CardContent>
              {increments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No increment history recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Effective Date</TableHead>
                        <TableHead>Cycle</TableHead>
                        <TableHead className="text-right">Previous Salary</TableHead>
                        <TableHead className="text-right">Increment</TableHead>
                        <TableHead className="text-right">%</TableHead>
                        <TableHead className="text-right">New Salary</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {increments.map((inc) => {
                        const prev = Number(inc.base_salary) || 0;
                        const incAmt = Number(inc.increment_amount) || 0;
                        const newSal = prev + incAmt;
                        return (
                          <TableRow key={inc.id}>
                            <TableCell>{fmtDate(inc.effective_from)}</TableCell>
                            <TableCell>{fmt(inc.cycle_label)}</TableCell>
                            <TableCell className="text-right">{fmtMoney(prev)}</TableCell>
                            <TableCell className="text-right text-green-600 font-medium">+{fmtMoney(incAmt)}</TableCell>
                            <TableCell className="text-right">{Number(inc.increment_pct || 0).toFixed(2)}%</TableCell>
                            <TableCell className="text-right font-semibold">{fmtMoney(newSal)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{fmt(inc.reason)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TASKS */}
        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FolderKanban className="h-4 w-4" /> Assigned Projects & Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No tasks assigned.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Task</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium max-w-[320px] truncate">{t.title}</TableCell>
                          <TableCell>
                            {t.projects?.name ? (
                              <Link to={`/projects/${t.project_id}`} className="text-primary hover:underline">
                                {t.projects.name}
                              </Link>
                            ) : "—"}
                          </TableCell>
                          <TableCell><Badge variant="outline">{t.priority}</Badge></TableCell>
                          <TableCell>{fmtDate(t.due_date)}</TableCell>
                          <TableCell><Badge variant={statusVariant(t.status)}>{t.status.replace("_", " ")}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TEAM */}
        <TabsContent value="team" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><UserCog className="h-4 w-4" /> Direct Reports ({reportCount})</CardTitle>
            </CardHeader>
            <CardContent>
              {reportCount === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No direct reports.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {reports.map((r) => (
                    <Link
                      key={r.id}
                      to={`/employees/${r.id}`}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={r.photo_url || undefined} />
                        <AvatarFallback>{initialsOf(r.full_name, r.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{fmt(r.full_name)}</div>
                        <div className="text-xs text-muted-foreground truncate">{fmt(r.designation)}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Direct reports modal */}
      <Dialog open={showReports} onOpenChange={setShowReports}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserCog className="h-5 w-5" /> Employees Reporting to {fmt(profile.full_name)}</DialogTitle>
            <DialogDescription>{reportCount} direct {reportCount === 1 ? "report" : "reports"}. Click a row to open their profile.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {reports.map((r) => (
              <Link
                key={r.id}
                to={`/employees/${r.id}`}
                onClick={() => setShowReports(false)}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors"
              >
                <Avatar className="h-12 w-12">
                  <AvatarImage src={r.photo_url || undefined} />
                  <AvatarFallback>{initialsOf(r.full_name, r.email)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{fmt(r.full_name)}</div>
                  <div className="text-sm text-muted-foreground truncate">{fmt(r.designation)}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{r.id}</div>
                </div>
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeeProfile;
