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

export async function computePayroll(
  profile: PayrollProfile,
  year: number,
  month: number,
  currency: string,
): Promise<PayrollComputation> {
  const [otHours, incentives] = await Promise.all([
    fetchApprovedOTHours(profile.id, year, month),
    fetchIncentivesTotal(profile.id, year, month),
  ]);
  const base = Number(profile.base_salary || 0);
  const otAmount = otHours * Number(profile.hourly_overtime_rate || 0);
  const gross = base + otAmount + incentives;
  const pfPct = Number(profile.pf_contribution_pct || 0);
  const pfEmployee = (base * pfPct) / 100;
  const pfEmployer = pfEmployee; // matching contribution
  const otherDeductions = 0;
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
  const company = args.companyName || "Office Management System";
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
