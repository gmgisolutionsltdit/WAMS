import { supabase } from "@/integrations/supabase/client";

const MOCK_IDS = {
  admin: "00000000-0000-0000-0000-000000000001",
  manager: "00000000-0000-0000-0000-000000000002",
  employee: "00000000-0000-0000-0000-000000000003",
};

export async function notifyManagersAndAdmins(title: string, message: string, relatedId?: string) {
  const notifications = [MOCK_IDS.admin, MOCK_IDS.manager].map((uid) => ({
    user_id: uid,
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
