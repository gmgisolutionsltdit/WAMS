import { supabase } from "@/integrations/supabase/client";

/**
 * Notify the requester's chosen reporting manager(s) only. Admins are
 * notified instead only when the requester has no reporting manager set
 * at all — an assigned manager means that's who owns the request, not
 * every admin in the org too. With no requester context (e.g. a generic
 * broadcast), falls back to every admin + manager.
 */
export async function notifyManagersAndAdmins(
  title: string,
  message: string,
  relatedId?: string,
  options?: { route?: string; type?: string; requesterId?: string }
) {
  const recipients = new Set<string>();

  if (options?.requesterId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("reporting_manager_ids, reporting_manager_id")
      .eq("id", options.requesterId)
      .maybeSingle();
    const managerIds = (prof?.reporting_manager_ids?.length
      ? prof.reporting_manager_ids
      : (prof?.reporting_manager_id ? [prof.reporting_manager_id] : [])) as string[];

    if (managerIds.length) {
      managerIds.forEach((id) => recipients.add(id));
    } else {
      // No reporting manager assigned — admins are the fallback owner.
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      (admins || []).forEach((r) => recipients.add(r.user_id));
    }
  } else {
    const [{ data: admins }, { data: mgrs }] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
      supabase.from("user_roles").select("user_id").eq("role", "manager"),
    ]);
    (admins || []).forEach((r) => recipients.add(r.user_id));
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

/** Notify every account holder (employee, manager, admin). */
export async function notifyAllUsers(
  title: string,
  message: string,
  relatedId?: string,
  options?: { route?: string; type?: string }
) {
  const { data: profiles } = await supabase.from("profiles").select("id");
  const rows = (profiles || []).map((p) => ({
    user_id: p.id,
    type: options?.type || "update",
    title,
    message,
    related_id: relatedId || null,
    route: options?.route || null,
  }));
  if (rows.length) await supabase.from("notifications").insert(rows);
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
