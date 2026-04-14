import { supabase } from "@/integrations/supabase/client";

export async function notifyManagersAndAdmins(title: string, message: string, relatedId?: string) {
  // Fetch all admin and manager user IDs dynamically
  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "manager"]);

  if (!roles || roles.length === 0) return;

  const notifications = roles.map((r) => ({
    user_id: r.user_id,
    type: "ot_request",
    title,
    message,
    related_id: relatedId || null,
  }));
  await supabase.from("notifications").insert(notifications);
}

export async function notifyEmployee(employeeId: string, title: string, message: string, relatedId?: string) {
  await supabase.from("notifications").insert({
    user_id: employeeId,
    type: "ot_update",
    title,
    message,
    related_id: relatedId || null,
  });
}
