import { supabase } from "@/integrations/supabase/client";

/**
 * Notify the requester's reporting manager (chain) and all admins.
 * Falls back to all admins/managers if reporting manager isn't set.
 */
export async function notifyManagersAndAdmins(
  title: string,
  message: string,
  relatedId?: string,
  options?: { route?: string; type?: string; requesterId?: string }
) {
  const recipients = new Set<string>();

  // Direct reporting manager (if requester provided)
  if (options?.requesterId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("reporting_manager_id")
      .eq("id", options.requesterId)
      .maybeSingle();
    if (prof?.reporting_manager_id) recipients.add(prof.reporting_manager_id);
  }

  // All admins always get notified
  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  (admins || []).forEach((r) => recipients.add(r.user_id));

  // If no direct manager known, also notify all managers as fallback
  if (!options?.requesterId) {
    const { data: mgrs } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "manager");
    (mgrs || []).forEach((r) => recipients.add(r.user_id));
  }

  if (recipients.size === 0) return;

  const rows = Array.from(recipients).map((uid) => ({
    user_id: uid,
    type: options?.type || "request",
    title,
    message,
    related_id: relatedId || null,
    route: options?.route || null,
  }));
  await supabase.from("notifications").insert(rows);
}

export async function notifyEmployee(
  employeeId: string,
  title: string,
  message: string,
  relatedId?: string,
  options?: { route?: string; type?: string }
) {
  await supabase.from("notifications").insert({
    user_id: employeeId,
    type: options?.type || "update",
    title,
    message,
    related_id: relatedId || null,
    route: options?.route || null,
  });
}
