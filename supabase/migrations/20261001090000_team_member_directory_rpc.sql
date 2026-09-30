-- Team Member Details is a company-wide, read-only directory (name,
-- designation, personal email, official Gmail, official OneDrive, phone)
-- visible to every authenticated role — not just what each viewer's own
-- profiles RLS would let them see (self, or their management chain). A
-- security-definer function exposes just these columns for everyone,
-- the same pattern already used by role_labels_for for a narrower purpose.

CREATE OR REPLACE FUNCTION public.team_member_directory()
RETURNS TABLE(
  id uuid,
  full_name text,
  designation text,
  personal_email text,
  official_gmail text,
  official_onedrive text,
  phone text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.designation, p.personal_email, p.official_gmail, p.official_onedrive, p.phone, p.created_at
  FROM public.profiles p
  ORDER BY p.created_at ASC
$$;

GRANT EXECUTE ON FUNCTION public.team_member_directory() TO authenticated;
