import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import jsPDF from "jspdf";

export interface PayrollProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  designation: string | null;
  department: string | null;
  company_wing: string | null;
  joining_date: string | null;
  base_salary: number;
  hourly_overtime_rate: number;
  pf_contribution_pct: number;
  employee_status: string;
}

export interface PayrollComputation {
  user_id: string;
  period_year: number;
  period_month: number;
  base_salary: number;
  ot_hours: number;
  ot_amount: number;
  incentives_amount: number;
  gross_pay: number;
  pf_employee: number;
  pf_employer: number;
  other_deductions: number;
  net_pay: number;
  currency: string;
  breakdown: Json;
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function fmtMoney(amount: number, currency = "BDT") {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
  const symbol = currency === "BDT" ? "৳" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${formatted}`;
}

/** Sum approved overtime_requests hours (modified_by uses requested_hours which already reflects modifications) for a user/month. */
export async function fetchApprovedOTHours(
  userId: string,
  year: number,
  month: number,
): Promise<number> {
  const start = new Date(year, month - 1, 1).toISOString().slice(0, 10);
  const end = new Date(year, month, 1).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("overtime_requests")
    .select("requested_hours, status, date")
    .eq("user_id", userId)
    .eq("status", "approved")
    .gte("date", start)
    .lt("date", end);
  if (error) throw error;
  return (data || []).reduce((sum, r) => sum + Number(r.requested_hours || 0), 0);
}

export async function fetchIncentivesTotal(
  userId: string,
  year: number,
  month: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("payroll_incentives")
    .select("amount")
    .eq("user_id", userId)
    .eq("period_year", year)
    .eq("period_month", month);
  if (error) throw error;
  return (data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
}

/**
 * Sum this month's Personal Advance payroll-deduction ledger entries for a
 * user. 0 when no advance exists — and also 0 (rather than throwing) if the
 * table doesn't exist yet, since the frontend deploy and the migration that
 * creates this table are two independent, unordered CI jobs: a payslip must
 * never break just because the migration hasn't landed yet.
 */
export async function fetchAdvanceDeductionTotal(
  userId: string,
  year: number,
  month: number,
): Promise<number> {
  const monthStartISO = `${year}-${String(month).padStart(2, "0")}-01`;
  const { data, error } = await supabase
    .from("personal_advance_actions")
    .select("amount")
    .eq("user_id", userId)
    .eq("month", monthStartISO)
    .eq("action_type", "payroll_deduction");
  if (error) {
    console.warn("fetchAdvanceDeductionTotal: treating as 0", error.message);
    return 0;
  }
  return (data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
}

export type AdvanceDeductionResult =
  | { status: "applied"; amount: number; closed: boolean; flagged: boolean }
  | { status: "already_recorded" }
  | { status: "no_active_advance" }
  | { status: "nothing_due" };

/**
 * Apply this employee's due Personal Advance installment for a given month,
 * if one exists and hasn't already been recorded. This is the single place
 * that writes a 'payroll_deduction' row to personal_advance_actions — called
 * automatically whenever payroll is generated/recalculated for an employee
 * (so the deduction happens without a separate manual step), and reused by
 * the manual "Record This Month's Deduction" admin action for off-cycle
 * corrections. Idempotent: a second call for a month that already has a
 * payroll_deduction row for this advance is a no-op, so generating or
 * regenerating payroll for the same month never double-deducts, and running
 * the manual action after payroll already applied it this month (or vice
 * versa) is always safe.
 */
export async function applyDuePersonalAdvanceDeduction(
  profile: PayrollProfile,
  year: number,
  month: number,
  actorId: string,
): Promise<AdvanceDeductionResult> {
  const monthStartISO = `${year}-${String(month).padStart(2, "0")}-01`;

  const { data: advances, error: advErr } = await supabase
    .from("personal_advances")
    .select("id, user_id, remaining_balance, monthly_deduction")
    .eq("user_id", profile.id)
    .eq("status", "approved")
    .gt("remaining_balance", 0)
    .limit(1);
  if (advErr) throw advErr;
  const advance = advances?.[0];
  if (!advance) return { status: "no_active_advance" };

  const { data: existing, error: existErr } = await supabase
    .from("personal_advance_actions")
    .select("id")
    .eq("personal_advance_id", advance.id)
    .eq("month", monthStartISO)
    .eq("action_type", "payroll_deduction")
    .limit(1);
  if (existErr) throw existErr;
  if (existing && existing.length > 0) return { status: "already_recorded" };

  // computePayroll() reads other_deductions from this same ledger table for
  // this user/month — since no payroll_deduction row exists yet (checked
  // above), this net_pay figure is "before this deduction", which is exactly
  // the cap we need.
  const computation = await computePayroll(profile, year, month, "BDT");
  const remainingBalance = Number(advance.remaining_balance);
  const monthlyDeduction = Number(advance.monthly_deduction);
  const netPayCap = Math.max(0, computation.net_pay);
  const proposedBeforeCap = Math.min(monthlyDeduction, remainingBalance);
  const actualDeduction = Math.min(monthlyDeduction, remainingBalance, netPayCap);
  if (actualDeduction <= 0) return { status: "nothing_due" };

  const remainingAfter = remainingBalance - actualDeduction;
  const { error: ledgerErr } = await supabase.from("personal_advance_actions").insert({
    personal_advance_id: advance.id, user_id: advance.user_id, action_type: "payroll_deduction",
    amount: actualDeduction, remaining_after: remainingAfter, month: monthStartISO, created_by: actorId,
  });
  if (ledgerErr) throw ledgerErr;

  const willClose = remainingAfter <= 0;
  const shortfallFromNetPay = actualDeduction < monthlyDeduction && netPayCap < proposedBeforeCap;
  const adminFlagNote = shortfallFromNetPay
    ? `Deduction capped by net pay: wanted ${monthlyDeduction}, net pay only allowed ${netPayCap.toFixed(2)}.`
    : undefined;

  const { error: updErr } = await supabase.from("personal_advances").update({
    remaining_balance: remainingAfter,
    ...(willClose ? { status: "closed" } : {}),
    ...(shortfallFromNetPay ? { admin_flag: true, admin_flag_note: adminFlagNote } : {}),
  }).eq("id", advance.id);
  if (updErr) throw updErr;

  if (willClose) {
    await supabase.from("personal_advance_actions").insert({
      personal_advance_id: advance.id, user_id: advance.user_id, action_type: "closed",
      amount: 0, remaining_after: 0, month: monthStartISO, created_by: actorId,
    });
  }
  if (shortfallFromNetPay) {
    await supabase.from("personal_advance_actions").insert({
      personal_advance_id: advance.id, user_id: advance.user_id, action_type: "admin_flag",
      amount: 0, month: monthStartISO, note: adminFlagNote, created_by: actorId,
    });
  }

  return { status: "applied", amount: actualDeduction, closed: willClose, flagged: shortfallFromNetPay };
}

export async function computePayroll(
  profile: PayrollProfile,
  year: number,
  month: number,
  currency: string,
): Promise<PayrollComputation> {
  const [otHours, incentives, advanceDeduction] = await Promise.all([
    fetchApprovedOTHours(profile.id, year, month),
    fetchIncentivesTotal(profile.id, year, month),
    fetchAdvanceDeductionTotal(profile.id, year, month),
  ]);
  const base = Number(profile.base_salary || 0);
  const otAmount = otHours * Number(profile.hourly_overtime_rate || 0);
  const gross = base + otAmount + incentives;
  const pfPct = Number(profile.pf_contribution_pct || 0);
  const pfEmployee = (base * pfPct) / 100;
  const pfEmployer = pfEmployee; // matching contribution
  const otherDeductions = advanceDeduction;
  const net = gross - pfEmployee - otherDeductions;
  return {
    user_id: profile.id,
    period_year: year,
    period_month: month,
    base_salary: base,
    ot_hours: otHours,
    ot_amount: otAmount,
    incentives_amount: incentives,
    gross_pay: gross,
    pf_employee: pfEmployee,
    pf_employer: pfEmployer,
    other_deductions: otherDeductions,
    net_pay: net,
    currency,
    breakdown: {
      base_salary: base,
      overtime: { hours: otHours, rate: Number(profile.hourly_overtime_rate || 0), amount: otAmount },
      incentives_total: incentives,
      pf: { pct: pfPct, employee: pfEmployee, employer_match: pfEmployer },
    },
  };
}

/** Standard gratuity formula: (Last Drawn Salary × 15 × Years of Service) / 26. */
export function computeGratuity(lastSalary: number, joiningDate: string | null) {
  if (!joiningDate || !lastSalary) return { years: 0, amount: 0, eligible: false };
  const start = new Date(joiningDate);
  const now = new Date();
  const ms = now.getTime() - start.getTime();
  const years = ms / (1000 * 60 * 60 * 24 * 365.25);
  const eligible = years >= 5;
  const amount = (lastSalary * 15 * years) / 26;
  return { years, amount, eligible };
}

export function downloadPayslipPDF(args: {
  profile: PayrollProfile;
  record: PayrollComputation & { id?: string };
  companyName?: string;
}) {
  const { profile, record } = args;
  const company = args.companyName || "Workforce & Attendance Management System (WAMS)";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  let y = 56;
  const period = `${MONTHS[record.period_month - 1]} ${record.period_year}`;

  doc.setFontSize(18);
  doc.text(company, left, y);
  y += 22;
  doc.setFontSize(13);
  doc.text(`Pay Slip — ${period}`, left, y);
  y += 24;

  doc.setFontSize(10);
  const empLines = [
    `Name:        ${profile.full_name || "—"}`,
    `Email:       ${profile.email || "—"}`,
    `Designation: ${profile.designation || "—"}`,
    `Department:  ${profile.department || "—"}  |  Wing: ${profile.company_wing || "—"}`,
    `Joining:     ${profile.joining_date || "—"}`,
  ];
  empLines.forEach((line) => { doc.text(line, left, y); y += 14; });

  y += 10;
  doc.setDrawColor(180);
  doc.line(left, y, 555, y);
  y += 18;

  const rows: Array<[string, string]> = [
    ["Base Salary", fmtMoney(record.base_salary, record.currency)],
    [`Overtime (${record.ot_hours.toFixed(2)} hrs)`, fmtMoney(record.ot_amount, record.currency)],
    ["Incentives / Bonus", fmtMoney(record.incentives_amount, record.currency)],
    ["Gross Pay", fmtMoney(record.gross_pay, record.currency)],
    ["PF (Employee)", `- ${fmtMoney(record.pf_employee, record.currency)}`],
    ["Other Deductions", `- ${fmtMoney(record.other_deductions, record.currency)}`],
  ];
  doc.setFontSize(11);
  rows.forEach(([k, v]) => {
    doc.text(k, left, y);
    doc.text(v, 555, y, { align: "right" });
    y += 18;
  });

  y += 6;
  doc.setDrawColor(120);
  doc.line(left, y, 555, y);
  y += 22;
  doc.setFontSize(13);
  doc.text("NET PAY", left, y);
  doc.text(fmtMoney(record.net_pay, record.currency), 555, y, { align: "right" });
  y += 26;

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`PF (Employer match): ${fmtMoney(record.pf_employer, record.currency)}`, left, y);
  y += 14;
  doc.text(`Generated: ${new Date().toLocaleString()}`, left, y);

  const safeName = (profile.full_name || profile.email || "employee").replace(/[^a-z0-9]+/gi, "_");
  doc.save(`Payslip_${safeName}_${record.period_year}_${String(record.period_month).padStart(2, "0")}.pdf`);
}
