// Admin User Management API hosted on Vercel
// Actions: create_user, reset_password, set_password, delete_user, bulk_create
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface CreateUserPayload {
  email: string;
  password?: string;
  full_name?: string;
  department?: string;
  designation?: string;
  phone?: string;
  company_wing?: "GMGI" | "MORU";
  service_status?: string;
  employee_status?: string;
  joining_date?: string | null;
  reporting_manager_id?: string | null;
  daily_ot_cap?: number;
  monthly_ot_cap?: number;
  role?: "admin" | "manager" | "employee";
}

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let p = "";
  for (let i = 0; i < 12; i++) p += chars[bytes[i] % chars.length];
  return p + "!";
}

async function isAdmin(userId: string, admin: any) {
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

async function createSingleUser(admin: any, p: CreateUserPayload) {
  const email = (p.email ?? "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("A valid email address is required");
  }

  // Friendly duplicate check before hitting the auth admin API
  const { data: dupe } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (dupe) throw new Error(`An employee with the email ${email} already exists`);

  const password = p.password && p.password.length >= 8 ? p.password : genPassword();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: p.full_name ?? "" },
  });
  if (createErr) {
    console.error("createUser failed:", createErr.message);
    const msg = /already been registered|already exists|duplicate/i.test(createErr.message)
      ? `An account with the email ${email} already exists`
      : createErr.message;
    throw new Error(msg);
  }

  const userId = created.user!.id;

  // Update profile (handle_new_user trigger created the row already)
  const profileUpdate: Record<string, unknown> = {};
  if (p.full_name !== undefined) profileUpdate.full_name = p.full_name;
  if (p.department !== undefined) profileUpdate.department = p.department || null;
  if (p.designation !== undefined) profileUpdate.designation = p.designation || null;
  if (p.phone !== undefined) profileUpdate.phone = p.phone || null;
  if (p.company_wing) profileUpdate.company_wing = p.company_wing;
  if (p.service_status) profileUpdate.service_status = p.service_status;
  if (p.employee_status) profileUpdate.employee_status = p.employee_status;
  if (p.joining_date !== undefined) profileUpdate.joining_date = p.joining_date || null;
  if (p.reporting_manager_id !== undefined)
    profileUpdate.reporting_manager_id = p.reporting_manager_id || null;
  if (p.daily_ot_cap !== undefined) profileUpdate.daily_ot_cap = p.daily_ot_cap;
  if (p.monthly_ot_cap !== undefined) profileUpdate.monthly_ot_cap = p.monthly_ot_cap;

  if (Object.keys(profileUpdate).length > 0) {
    const { error: profErr } = await admin.from("profiles").update(profileUpdate).eq("id", userId);
    if (profErr) {
      console.error("profile update failed:", profErr.message);
      throw new Error(`User created but profile update failed: ${profErr.message}`);
    }
  }

  if (p.role && p.role !== "employee") {
    await admin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleErr } = await admin.from("user_roles").insert({ user_id: userId, role: p.role });
    if (roleErr) {
      console.error("role assignment failed:", roleErr.message);
      throw new Error(`User created but role assignment failed: ${roleErr.message}`);
    }
  }

  return { userId, email, tempPassword: password };
}

export default { async fetch(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Missing Authorization header" }, 401);

    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Malformed Authorization header" }, 401);

    // Validate the JWT with the service-role client (works with signing keys)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.error("Auth validation failed:", userErr?.message);
      return json({ error: `Invalid session: ${userErr?.message ?? "no user"}` }, 401);
    }

    if (!(await isAdmin(userData.user.id, admin))) {
      return json({ error: "Admin role required" }, 403);
    }


    const body = await req.json();
    const action = body.action as string;

    if (action === "create_user") {
      const result = await createSingleUser(admin, body.payload as CreateUserPayload);
      return json({ success: true, ...result });
    }

    if (action === "bulk_create") {
      const items: CreateUserPayload[] = body.payload || [];
      const results: any[] = [];
      for (const it of items) {
        try {
          const r = await createSingleUser(admin, it);
          results.push({ email: it.email, ok: true, tempPassword: r.tempPassword });
        } catch (e) {
          results.push({ email: it.email, ok: false, error: (e as Error).message });
        }
      }
      return json({ success: true, results });
    }

    if (action === "reset_password") {
      const targetUserId = body.user_id as string;
      const newPassword = (body.new_password as string) || genPassword();
      const { error } = await admin.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true, tempPassword: newPassword });
    }

    if (action === "send_reset_link") {
      const email = body.email as string;
      const redirectTo = body.redirect_to as string | undefined;
      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true, link: data.properties?.action_link });
    }

    if (action === "delete_user") {
      const targetUserId = body.user_id as string;
      // Block deleting the bootstrap admin
      const { data: target } = await admin
        .from("profiles")
        .select("email")
        .eq("id", targetUserId)
        .maybeSingle();
      if (target?.email?.toLowerCase() === "shahriar@gmgisolutionsltd.com") {
        return json({ error: "Cannot delete bootstrap admin" }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(targetUserId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("admin-user-management error:", (e as Error).message);
    return json({ error: (e as Error).message }, 400);
  }
} };

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
