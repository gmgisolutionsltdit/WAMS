// Bootstrap or reset a WAMS administrator account directly against Supabase Auth.
//
// Used by the "Manage admin user" GitHub Action (workflow_dispatch) so this never
// needs a local machine. Can also be run locally:
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   ADMIN_EMAIL=admin@example.com \
//   node scripts/create-admin.mjs
//
// Env:
//   SUPABASE_URL                (required)
//   SUPABASE_SERVICE_ROLE_KEY   (required)
//   ADMIN_EMAIL                 (required)
//   ADMIN_PASSWORD              (optional - generated if omitted)
//   ADMIN_FULL_NAME             (optional - defaults to "WAMS Administrator")

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const FULL_NAME = process.env.ADMIN_FULL_NAME || "WAMS Administrator";

if (!URL || !SERVICE || !EMAIL) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or ADMIN_EMAIL");
  process.exit(1);
}

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const b = randomBytes(18);
  let p = "";
  for (let i = 0; i < 18; i++) p += chars[b[i] % chars.length];
  return p + "!7q";
}

const password = process.env.ADMIN_PASSWORD || genPassword();
const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let user;
for (let page = 1; page <= 20 && !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => (u.email || "").toLowerCase() === EMAIL);
  if (data.users.length < 200) break;
}

if (user) {
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`Reset existing user ${EMAIL} (${user.id})`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  });
  if (error) throw error;
  user = data.user;
  console.log(`Created user ${EMAIL} (${user.id})`);
}

// The handle_new_user trigger creates the profile + a default role. Make sure the
// profile exists and the account holds the admin role.
await admin
  .from("profiles")
  .upsert({ id: user.id, email: EMAIL, full_name: FULL_NAME }, { onConflict: "id" });

await admin.from("user_roles").delete().eq("user_id", user.id);
const { error: roleErr } = await admin
  .from("user_roles")
  .insert({ user_id: user.id, role: "admin" });
if (roleErr) throw roleErr;

const { data: roles } = await admin
  .from("user_roles")
  .select("role")
  .eq("user_id", user.id);

const summary = [
  "### WAMS admin ready",
  "",
  `- **Email:** ${EMAIL}`,
  `- **Password:** \`${password}\``,
  `- **Roles:** ${(roles || []).map((r) => r.role).join(", ")}`,
  "",
  "> Change this password after first sign-in.",
].join("\n");

console.log("\n" + summary.replace(/[`*]/g, ""));
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
}
