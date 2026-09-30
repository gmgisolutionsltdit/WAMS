import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Mail, Phone, Calendar, IdCard, Briefcase, UserCheck,
  Users, MapPin, Building2, TrendingUp, DollarSign, FolderKanban, UserCog,
  ClipboardList, Pencil, KeyRound, Trash2, Copy, Camera, Clock3, ShieldAlert,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { invokeAdminUserManagement, edgeErrorMessage } from "@/lib/adminUsers";
import EmployeeDocumentsTab from "@/components/EmployeeDocumentsTab";
import { DEFAULT_GRACE_MINUTES, DEFAULT_OFFICE_END, DEFAULT_OFFICE_START } from "@/lib/officeTime";
import { DEFAULT_WORKING_DAYS } from "@/lib/workSchedule";

const SERVICE_STATUS = ["Permanent", "Contractual", "Intern", "Short-Term", "Consultant"];
const EMPLOYEE_STATUS = ["Active", "Inactive", "Resigned"];
const DOW = [
  { v: 0, label: "Sun" }, { v: 1, label: "Mon" }, { v: 2, label: "Tue" }, { v: 3, label: "Wed" },
  { v: 4, label: "Thu" }, { v: 5, label: "Fri" }, { v: 6, label: "Sat" },
];

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  department: string | null;
  designation: string | null;
  company_wing: string | null;
  wing_id: string | null;
  service_status: string | null;
  employee_status: string | null;
  joining_date: string | null;
  promotion_date: string | null;
  resign_date: string | null;
  reporting_manager_id: string | null;
  reporting_manager_ids: string[] | null;
  daily_ot_cap: number | null;
  monthly_ot_cap: number | null;
  base_salary: number | null;
  hourly_overtime_rate: number | null;
  pf_contribution_pct: number | null;
  office_start_time: string | null;
  office_end_time: string | null;
  standard_daily_hours: number | null;
  unpaid_break_minutes: number | null;
  late_grace_minutes: number | null;
  working_days: number[] | null;
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

type WingRow = { id: string; name: string; code: string; active: boolean };
type LeaveType = {
  id: string; name: string; code: string; color: string;
  annual_quota: number; half_day_allowed: boolean; is_paid: boolean; active: boolean;
  sandwich_leave: boolean;
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
  const { user, role: viewerRole, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<string>("employee");
  const [deleting, setDeleting] = useState(false);
  const [tempCredentials, setTempCredentials] = useState<{ email: string; password: string } | null>(null);
  const [manager, setManager] = useState<{ id: string; name: string } | null>(null);
  const [increments, setIncrements] = useState<Increment[]>([]);
  const [reports, setReports] = useState<DirectReport[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [showReports, setShowReports] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personalForm, setPersonalForm] = useState<Partial<Profile>>({});
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const isSelf = !!user && user.id === id;
  const isAdmin = viewerRole === "admin";
  const canEditPayroll = viewerRole === "admin";
  const isDirectManager = viewerRole === "manager" && !!user && !!profile && (
    profile.reporting_manager_id === user.id
    || (profile.reporting_manager_ids || []).includes(user.id)
  );
  const canManageThisEmployee = isAdmin || isDirectManager || isSelf;

  // ---- Editable "Overview" fields (formerly the Edit Employee popup) ----
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingOverview, setSavingOverview] = useState(false);
  const [managers, setManagers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [wings, setWings] = useState<WingRow[]>([]);
  const [overviewForm, setOverviewForm] = useState({
    full_name: "", phone: "", department: "", designation: "",
    photo_url: "", wing_id: "", company_wing: "GMGI",
    role: "employee" as string, reporting_manager_ids: [] as string[],
    service_status: "Permanent", employee_status: "Active",
    joining_date: "", promotion_date: "", resign_date: "",
    daily_ot_cap: "4", monthly_ot_cap: "40",
    office_start_time: DEFAULT_OFFICE_START, office_end_time: DEFAULT_OFFICE_END,
    standard_daily_hours: "8", unpaid_break_minutes: "60",
    late_grace_minutes: String(DEFAULT_GRACE_MINUTES),
    working_days: [...DEFAULT_WORKING_DAYS] as number[],
  });

  // ---- Editable "Financial" (Compensation) fields — admin only ----
  const [savingCompensation, setSavingCompensation] = useState(false);
  const [compForm, setCompForm] = useState({ base_salary: "0", hourly_overtime_rate: "0", pf_contribution_pct: "0" });

  // ---- Editable "Projects & Tasks" assignment — admin only ----
  const [projects, setProjects] = useState<{ id: string; name: string; key: string }[]>([]);
  const [memberProjectIds, setMemberProjectIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [savingProjects, setSavingProjects] = useState(false);

  // ---- Editable "Team" (Leave Defaults) — admin only, org-wide ----
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [savingLeave, setSavingLeave] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!id) return;
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
    setPersonalForm(p as Profile);
    setRole((r?.role as string) || "employee");
    setOverviewForm({
      full_name: p.full_name || "", phone: p.phone || "",
      department: p.department || "", designation: p.designation || "",
      photo_url: p.photo_url || "", wing_id: p.wing_id || "", company_wing: p.company_wing || "GMGI",
      role: (r?.role as string) || "employee",
      reporting_manager_ids: p.reporting_manager_ids?.length
        ? p.reporting_manager_ids
        : (p.reporting_manager_id ? [p.reporting_manager_id] : []),
      service_status: p.service_status || "Permanent",
      employee_status: p.employee_status || "Active",
      joining_date: p.joining_date || "", promotion_date: p.promotion_date || "", resign_date: p.resign_date || "",
      daily_ot_cap: String(p.daily_ot_cap ?? 4), monthly_ot_cap: String(p.monthly_ot_cap ?? 40),
      office_start_time: (p.office_start_time || DEFAULT_OFFICE_START).slice(0, 5),
      office_end_time: (p.office_end_time || DEFAULT_OFFICE_END).slice(0, 5),
      standard_daily_hours: String(p.standard_daily_hours ?? 8),
      unpaid_break_minutes: String(p.unpaid_break_minutes ?? 60),
      late_grace_minutes: String(p.late_grace_minutes ?? DEFAULT_GRACE_MINUTES),
      working_days: p.working_days?.length ? p.working_days.map(Number) : [...DEFAULT_WORKING_DAYS],
    });
    setCompForm({
      base_salary: String(p.base_salary ?? 0),
      hourly_overtime_rate: String(p.hourly_overtime_rate ?? 0),
      pf_contribution_pct: String(p.pf_contribution_pct ?? 0),
    });

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
    const m: any = mgrRes.data;
    setManager(m ? { id: m.id, name: m.full_name || m.email || "—" } : null);
    setIncrements((incRes.data as Increment[]) || []);
    setReports((repRes.data as DirectReport[]) || []);
    setTasks((taskRes.data as any[]) || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchProfile(); }, [fetchProfile, reloadKey]);

  // Data needed only for editing: managers/wings (Overview), projects (Projects & Tasks), leave types (Team).
  useEffect(() => {
    if (!canManageThisEmployee || !id) return;
    (async () => {
      const [{ data: mgrs }, { data: wingRows }, { data: projectRows }, { data: memberRows }, { data: leaveTypeRows }] = await Promise.all([
        supabase.rpc("manager_candidates"),
        supabase.from("company_wings").select("id, name, code, active").order("name", { ascending: true }),
        supabase.from("projects").select("id, name, key").eq("archived", false).order("name", { ascending: true }),
        supabase.from("project_members").select("project_id").eq("user_id", id),
        supabase.from("leave_types").select("*").order("name"),
      ]);
      setManagers(mgrs || []);
      setWings((wingRows || []) as WingRow[]);
      setProjects((projectRows || []) as { id: string; name: string; key: string }[]);
      const ids = (memberRows || []).map((m: { project_id: string }) => m.project_id);
      setMemberProjectIds(ids);
      setSelectedProjectIds(ids);
      setLeaveTypes((leaveTypeRows || []) as LeaveType[]);
    })();
  }, [canManageThisEmployee, id]);

  const activeWings = wings.filter((w) => w.active);

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/employees"));

  const handlePhotoSelect = async (file: File) => {
    if (!id) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image"); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error("Image must be under 3MB"); return; }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      setOverviewForm((f) => ({ ...f, photo_url: pub.publicUrl }));
      await supabase.from("profiles").update({ photo_url: pub.publicUrl }).eq("id", id);
      setProfile((p) => (p ? { ...p, photo_url: pub.publicUrl } : p));
      toast.success("Photo uploaded");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const saveOverview = async () => {
    if (!id || !overviewForm.full_name.trim()) { toast.error("Name is required"); return; }
    setSavingOverview(true);
    try {
      const selectedWing = wings.find((w) => w.id === overviewForm.wing_id);
      const profilePayload: any = {
        full_name: overviewForm.full_name,
        phone: overviewForm.phone || null,
        department: overviewForm.department || null,
        designation: overviewForm.designation || null,
        photo_url: overviewForm.photo_url || null,
        wing_id: overviewForm.wing_id || null,
        company_wing: (selectedWing?.name || overviewForm.company_wing) as any,
        service_status: overviewForm.service_status as any,
        employee_status: overviewForm.employee_status as any,
        joining_date: overviewForm.joining_date || null,
        promotion_date: overviewForm.promotion_date || null,
        resign_date: overviewForm.resign_date || null,
        daily_ot_cap: parseFloat(overviewForm.daily_ot_cap) || 4,
        monthly_ot_cap: parseFloat(overviewForm.monthly_ot_cap) || 40,
        office_start_time: `${overviewForm.office_start_time}:00`,
        office_end_time: `${overviewForm.office_end_time}:00`,
        standard_daily_hours: parseFloat(overviewForm.standard_daily_hours) || 8,
        unpaid_break_minutes: parseInt(overviewForm.unpaid_break_minutes, 10) || 0,
        late_grace_minutes: parseInt(overviewForm.late_grace_minutes, 10) || 0,
        working_days: overviewForm.working_days.length ? [...overviewForm.working_days].sort((a, b) => a - b) : [...DEFAULT_WORKING_DAYS],
      };
      if (isAdmin) {
        profilePayload.reporting_manager_id = overviewForm.reporting_manager_ids[0] || null;
        profilePayload.reporting_manager_ids = overviewForm.reporting_manager_ids;
      }
      const { error } = await supabase.from("profiles").update(profilePayload).eq("id", id);
      if (error) { toast.error(error.message); return; }
      if (isAdmin) {
        const { data: existing } = await supabase.from("user_roles").select("id").eq("user_id", id).maybeSingle();
        if (existing) await supabase.from("user_roles").update({ role: overviewForm.role as any }).eq("user_id", id);
        else await supabase.from("user_roles").insert({ user_id: id, role: overviewForm.role as any });
      }
      toast.success("Profile updated");
      setReloadKey((k) => k + 1);
    } finally {
      setSavingOverview(false);
    }
  };

  const saveCompensation = async () => {
    if (!id) return;
    setSavingCompensation(true);
    try {
      const { error } = await supabase.from("profiles").update({
        base_salary: parseFloat(compForm.base_salary) || 0,
        hourly_overtime_rate: parseFloat(compForm.hourly_overtime_rate) || 0,
        pf_contribution_pct: parseFloat(compForm.pf_contribution_pct) || 0,
      }).eq("id", id);
      if (error) { toast.error(error.message); return; }
      toast.success("Compensation updated");
      setReloadKey((k) => k + 1);
    } finally {
      setSavingCompensation(false);
    }
  };

  const saveProjectAssignment = async () => {
    if (!id) return;
    setSavingProjects(true);
    try {
      const added = selectedProjectIds.filter((pid) => !memberProjectIds.includes(pid));
      const removed = memberProjectIds.filter((pid) => !selectedProjectIds.includes(pid));
      if (added.length) {
        const { error } = await supabase
          .from("project_members")
          .upsert(added.map((project_id) => ({ project_id, user_id: id })), { onConflict: "project_id,user_id" });
        if (error) { toast.error(`Project assignment failed: ${error.message}`); return; }
      }
      if (removed.length) {
        const { error } = await supabase
          .from("project_members")
          .delete()
          .eq("user_id", id)
          .in("project_id", removed);
        if (error) { toast.error(`Project removal failed: ${error.message}`); return; }
      }
      setMemberProjectIds(selectedProjectIds);
      toast.success("Project assignment updated");
    } finally {
      setSavingProjects(false);
    }
  };

  const updateLeaveType = (ltId: string, patch: Partial<LeaveType>) => {
    setLeaveTypes((prev) => prev.map((lt) => (lt.id === ltId ? { ...lt, ...patch } : lt)));
  };

  const saveLeaveDefaults = async () => {
    setSavingLeave(true);
    const updates = leaveTypes.map((lt) =>
      supabase.from("leave_types").update({
        annual_quota: Number(lt.annual_quota) || 0,
        half_day_allowed: lt.half_day_allowed,
        is_paid: lt.is_paid,
        color: lt.color,
        sandwich_leave: lt.sandwich_leave,
      }).eq("id", lt.id)
    );
    const results = await Promise.all(updates);
    const firstErr = results.find((r) => r.error);
    if (firstErr?.error) toast.error(firstErr.error.message);
    else toast.success("Leave defaults updated");
    setSavingLeave(false);
  };

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

  const handleResetPassword = async () => {
    if (!id || !profile) return;
    const { data, error } = await invokeAdminUserManagement({
      body: { action: "reset_password", user_id: id },
    });
    if (error || (data as any)?.error) {
      toast.error(await edgeErrorMessage(error, data, "Reset failed"), { duration: 8000 });
      return;
    }
    setTempCredentials({ email: profile.email || "", password: (data as any).tempPassword });
    toast.success("Password reset");
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      const { data, error } = await invokeAdminUserManagement({
        body: { action: "delete_user", user_id: id },
      });
      if (error || (data as any)?.error) {
        toast.error(await edgeErrorMessage(error, data, "Delete failed"), { duration: 8000 });
        return;
      }
      toast.success(isSelf ? "Your account has been deleted" : "Employee deleted");
      if (isSelf) {
        await signOut();
        navigate("/login");
      } else {
        navigate(isAdmin ? "/employees" : "/profile");
      }
    } finally {
      setDeleting(false);
    }
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
        <TabsList className="grid grid-cols-2 sm:grid-cols-6 w-full sm:w-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="personal">Personal Info</TabsTrigger>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="tasks">Projects & Tasks</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="documents">Contract Documents</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {canManageThisEmployee && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Pencil className="h-4 w-4" /> Edit Profile</CardTitle>
                <CardDescription>Basic info, role &amp; reporting, and work schedule.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={overviewForm.photo_url || undefined} />
                    <AvatarFallback>{(overviewForm.full_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <input
                      id="profile-photo-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(f); }}
                    />
                    <Button size="sm" variant="outline" disabled={uploadingPhoto}
                      onClick={() => document.getElementById("profile-photo-input")?.click()}>
                      <Camera className="mr-1 h-4 w-4" />
                      {uploadingPhoto ? "Uploading…" : "Upload Photo"}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">JPG / PNG, up to 3MB</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div><Label>Full Name *</Label><Input value={overviewForm.full_name} onChange={(e) => setOverviewForm((f) => ({ ...f, full_name: e.target.value }))} /></div>
                  <div><Label>Email</Label><Input type="email" value={profile.email || ""} disabled /></div>
                  <div><Label>Phone</Label><Input value={overviewForm.phone} onChange={(e) => setOverviewForm((f) => ({ ...f, phone: e.target.value }))} /></div>
                  <div><Label>Department</Label><Input value={overviewForm.department} onChange={(e) => setOverviewForm((f) => ({ ...f, department: e.target.value }))} /></div>
                  <div><Label>Designation</Label><Input value={overviewForm.designation} onChange={(e) => setOverviewForm((f) => ({ ...f, designation: e.target.value }))} /></div>
                  <div>
                    <Label>Wing</Label>
                    <Select value={overviewForm.wing_id || "none"} onValueChange={(v) => setOverviewForm((f) => ({ ...f, wing_id: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="Select wing" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {activeWings.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Role</Label>
                    <Select value={overviewForm.role} onValueChange={(v) => setOverviewForm((f) => ({ ...f, role: v }))} disabled={!isAdmin}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager / Reporting Boss</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Reporting To <span className="text-xs text-muted-foreground">(admin only)</span></Label>
                    <div className="rounded-md border p-2 max-h-32 overflow-y-auto space-y-1">
                      {managers.filter((m) => m.id !== id).length === 0 ? (
                        <p className="text-xs text-muted-foreground px-1">No managers/admins available</p>
                      ) : managers.filter((m) => m.id !== id).map((m) => (
                        <label key={m.id} className="flex items-center gap-2 text-sm px-1 py-0.5">
                          <Checkbox
                            disabled={!isAdmin}
                            checked={overviewForm.reporting_manager_ids.includes(m.id)}
                            onCheckedChange={() =>
                              setOverviewForm((f) => ({
                                ...f,
                                reporting_manager_ids: f.reporting_manager_ids.includes(m.id)
                                  ? f.reporting_manager_ids.filter((x) => x !== m.id)
                                  : [...f.reporting_manager_ids, m.id],
                              }))
                            }
                          />
                          {m.full_name || m.email}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Service Status</Label>
                    <Select value={overviewForm.service_status} onValueChange={(v) => setOverviewForm((f) => ({ ...f, service_status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{SERVICE_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Employee Status</Label>
                    <Select value={overviewForm.employee_status} onValueChange={(v) => setOverviewForm((f) => ({ ...f, employee_status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{EMPLOYEE_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Joining Date</Label><Input type="date" value={overviewForm.joining_date} onChange={(e) => setOverviewForm((f) => ({ ...f, joining_date: e.target.value }))} /></div>
                  <div><Label>Promotion Date</Label><Input type="date" value={overviewForm.promotion_date} onChange={(e) => setOverviewForm((f) => ({ ...f, promotion_date: e.target.value }))} /></div>
                  <div><Label>Resign Date</Label><Input type="date" value={overviewForm.resign_date} onChange={(e) => setOverviewForm((f) => ({ ...f, resign_date: e.target.value }))} /></div>
                  <div><Label>Daily OT Cap (hrs)</Label><Input type="number" step="0.5" value={overviewForm.daily_ot_cap} onChange={(e) => setOverviewForm((f) => ({ ...f, daily_ot_cap: e.target.value }))} /></div>
                  <div><Label>Monthly OT Cap (hrs)</Label><Input type="number" step="1" value={overviewForm.monthly_ot_cap} onChange={(e) => setOverviewForm((f) => ({ ...f, monthly_ot_cap: e.target.value }))} /></div>
                </div>

                <div className="rounded-md border p-3 bg-muted/30">
                  <Label className="text-sm font-semibold flex items-center gap-2"><Clock3 className="h-4 w-4" /> Office Hours &amp; Work Schedule</Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-3">
                    Attendance, late arrival, due time, overtime and leave are all calculated against these values.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Office Start</Label>
                      <Input type="time" value={overviewForm.office_start_time} onChange={(e) => setOverviewForm((f) => ({ ...f, office_start_time: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Office End</Label>
                      <Input type="time" value={overviewForm.office_end_time} onChange={(e) => setOverviewForm((f) => ({ ...f, office_end_time: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Standard Shift Hours</Label>
                      <Input type="number" step="0.5" min="0.5" max="24" value={overviewForm.standard_daily_hours} onChange={(e) => setOverviewForm((f) => ({ ...f, standard_daily_hours: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Daily Break Allowance (minutes)</Label>
                      <Input type="number" step="5" min="0" value={overviewForm.unpaid_break_minutes} onChange={(e) => setOverviewForm((f) => ({ ...f, unpaid_break_minutes: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Late Grace (minutes)</Label>
                      <Input type="number" step="1" min="0" value={overviewForm.late_grace_minutes} onChange={(e) => setOverviewForm((f) => ({ ...f, late_grace_minutes: e.target.value }))} />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Working Days <span className="text-xs text-muted-foreground">(unchecked days count as weekend)</span></Label>
                      <div className="flex flex-wrap gap-3 mt-1">
                        {DOW.map((d) => (
                          <label key={d.v} className="flex items-center gap-1.5 text-sm">
                            <Checkbox
                              checked={overviewForm.working_days.includes(d.v)}
                              onCheckedChange={() =>
                                setOverviewForm((f) => ({
                                  ...f,
                                  working_days: f.working_days.includes(d.v)
                                    ? f.working_days.filter((x) => x !== d.v)
                                    : [...f.working_days, d.v].sort((a, b) => a - b),
                                }))
                              }
                            />
                            {d.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <Button onClick={saveOverview} disabled={savingOverview}>
                  {savingOverview ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          )}

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

          {canManageThisEmployee && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Account Actions</CardTitle>
                <CardDescription>Reset password or permanently remove this account.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <KeyRound className="h-4 w-4 mr-1" /> Reset Password
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset password?</AlertDialogTitle>
                      <AlertDialogDescription>
                        A new temporary password will be generated for <strong>{profile.email}</strong>.
                        You'll see it once and need to share it securely.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleResetPassword}>Reset</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Trash2 className="h-4 w-4 mr-1 text-destructive" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{isSelf ? "Delete your account?" : "Delete employee?"}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {isSelf
                          ? "This permanently removes your account and login. You'll be signed out immediately. This cannot be undone."
                          : <>This permanently removes <strong>{fmt(profile.full_name)}</strong> and their login. This cannot be undone.</>}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                        {deleting ? "Deleting…" : "Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          )}
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

          {canEditPayroll && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Compensation</CardTitle>
                  <Badge variant="outline" className="text-[10px]">Admin only</Badge>
                </div>
                <CardDescription>Update base salary on promotion or revision. Changes take effect on the next payroll generation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Base Salary (monthly)</Label>
                    <Input type="number" step="0.01" min="0" value={compForm.base_salary}
                      onChange={(e) => setCompForm((f) => ({ ...f, base_salary: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Hourly OT Rate</Label>
                    <Input type="number" step="0.01" min="0" value={compForm.hourly_overtime_rate}
                      onChange={(e) => setCompForm((f) => ({ ...f, hourly_overtime_rate: e.target.value }))} />
                  </div>
                  <div>
                    <Label>PF Contribution (%)</Label>
                    <Input type="number" step="0.01" min="0" max="100" value={compForm.pf_contribution_pct}
                      onChange={(e) => setCompForm((f) => ({ ...f, pf_contribution_pct: e.target.value }))} />
                  </div>
                </div>
                <Button onClick={saveCompensation} disabled={savingCompensation}>
                  {savingCompensation ? "Saving..." : "Save Compensation"}
                </Button>
              </CardContent>
            </Card>
          )}

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
        <TabsContent value="tasks" className="mt-4 space-y-4">
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assigned Projects</CardTitle>
                <CardDescription>Which projects this employee is a member of.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {projects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No active projects yet — create one on the Projects page to assign it here.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 rounded-md border p-2 max-h-32 overflow-y-auto">
                    {projects.map((p) => {
                      const checked = selectedProjectIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm cursor-pointer ${checked ? "bg-primary/10 border-primary/40" : ""}`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() =>
                              setSelectedProjectIds((ids) =>
                                checked ? ids.filter((x) => x !== p.id) : [...ids, p.id]
                              )
                            }
                          />
                          {p.name}
                        </label>
                      );
                    })}
                  </div>
                )}
                <Button size="sm" onClick={saveProjectAssignment} disabled={savingProjects}>
                  {savingProjects ? "Saving..." : "Save Project Assignment"}
                </Button>
              </CardContent>
            </Card>
          )}

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
        <TabsContent value="team" className="mt-4 space-y-4">
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

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Leave Defaults</CardTitle>
                <CardDescription>Applies to every employee for each leave type — not just this one.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3">
                  {leaveTypes.map((lt) => (
                    <div key={lt.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center rounded-lg border p-3 bg-card">
                      <div className="md:col-span-5 flex items-center gap-3">
                        <input
                          type="color"
                          value={lt.color}
                          onChange={(e) => updateLeaveType(lt.id, { color: e.target.value })}
                          className="h-8 w-8 rounded border cursor-pointer"
                        />
                        <div>
                          <div className="font-medium text-sm">{lt.name}</div>
                          <div className="text-xs text-muted-foreground">{lt.code}</div>
                        </div>
                      </div>
                      <div className="md:col-span-4 space-y-1">
                        <Label className="text-xs">Annual Quota (days)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.5"
                          value={lt.annual_quota}
                          onChange={(e) => updateLeaveType(lt.id, { annual_quota: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="md:col-span-3 flex items-center gap-2" title="Charge weekends/holidays adjacent (either side) to leave days">
                        <Switch checked={!!lt.sandwich_leave} onCheckedChange={(v) => updateLeaveType(lt.id, { sandwich_leave: v })} />
                        <Label className="text-xs">Sandwich</Label>
                      </div>
                    </div>
                  ))}
                </div>
                <Button onClick={saveLeaveDefaults} disabled={savingLeave}>
                  {savingLeave ? "Saving..." : "Save Leave Defaults"}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* CONTRACT DOCUMENTS */}
        <TabsContent value="documents" className="mt-4">
          <EmployeeDocumentsTab userId={id!} canManage={isSelf || isAdmin} />
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

      {/* Temp credentials dialog */}
      <Dialog open={!!tempCredentials} onOpenChange={(o) => !o && setTempCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary Password</DialogTitle>
            <DialogDescription>
              Share these credentials securely with the user. They can change the password after first sign-in.
            </DialogDescription>
          </DialogHeader>
          {tempCredentials && (
            <div className="space-y-3">
              <div>
                <Label>Email</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={tempCredentials.email} />
                  <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(tempCredentials.email); toast.success("Copied"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Temporary Password</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={tempCredentials.password} className="font-mono" />
                  <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(tempCredentials.password); toast.success("Copied"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setTempCredentials(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeeProfile;
