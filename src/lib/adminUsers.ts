import { supabase } from "@/integrations/supabase/client";

/** Extracts the real error text from a Supabase edge-function failure (non-2xx bodies). */
export async function edgeErrorMessage(error: any, data: any, fallback: string) {
  if (data?.error) return String(data.error);
  const res = error?.context;
  if (res && typeof res.json === "function") {
    try {
      const body = await res.clone().json();
      if (body?.error) return String(body.error);
    } catch { /* body not JSON */ }
  }
  return error?.message || fallback;
}

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
