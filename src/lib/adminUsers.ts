import { supabase } from "@/integrations/supabase/client";

export async function invokeAdminUserManagement(options: { body: Record<string, unknown> }) {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!session) throw new Error("Please sign in to manage employees.");
    const response = await fetch("/api/admin-user-management", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(options.body),
    });
    const data = await response.json();
    if (!response.ok) return { data, error: new Error(data.error || "Employee management request failed") };
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Employee management request failed") };
  }
}
