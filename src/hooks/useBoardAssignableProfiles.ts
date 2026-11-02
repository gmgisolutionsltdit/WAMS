import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VisibleEmployee } from "@/hooks/useVisibleEmployees";

/**
 * Every company employee, for picking board members / task assignees —
 * unlike useVisibleEmployees() this isn't scoped by the profiles RLS
 * wing/reporting-chain rules, since anyone should be able to share a board
 * or assign a task to anyone else in the company.
 */
export const useBoardAssignableProfiles = (enabled: boolean) => {
  const [profiles, setProfiles] = useState<VisibleEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    supabase.rpc("get_board_assignable_profiles").then(({ data, error: err }) => {
      if (!active) return;
      if (err) {
        setError(err.message);
        setProfiles([]);
      } else {
        setError(null);
        setProfiles((data || []) as VisibleEmployee[]);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [enabled]);

  return { profiles, loading, error };
};
