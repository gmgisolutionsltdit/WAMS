-- Team Member Details shows the full Personal Info record for every
-- employee/manager/admin, not just the four contact fields — extend the
-- directory RPC with every field on the Personal Info tab.

DROP FUNCTION IF EXISTS public.team_member_directory();

CREATE FUNCTION public.team_member_directory()
RETURNS TABLE(
  id uuid,
  full_name text,
  designation text,
  personal_email text,
  official_gmail text,
  official_onedrive text,
  phone text,
  date_of_birth date,
  national_id text,
  passport_number text,
  birth_reg_number text,
  blood_group text,
  religion text,
  father_name text,
  mother_name text,
  marital_status text,
  spouse_name text,
  children_count integer,
  ongoing_education text,
  present_address text,
  permanent_address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  bank_account_name text,
  bank_account_number text,
  bank_name text,
  bank_branch text,
  bank_swift_code text,
  bank_routing_number text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.designation, p.personal_email, p.official_gmail, p.official_onedrive, p.phone,
    p.date_of_birth, p.national_id, p.passport_number, p.birth_reg_number, p.blood_group, p.religion,
    p.father_name, p.mother_name, p.marital_status, p.spouse_name, p.children_count, p.ongoing_education,
    p.present_address, p.permanent_address, p.emergency_contact_name, p.emergency_contact_phone,
    p.emergency_contact_relationship, p.bank_account_name, p.bank_account_number, p.bank_name, p.bank_branch,
    p.bank_swift_code, p.bank_routing_number, p.created_at
  FROM public.profiles p
  ORDER BY p.created_at ASC
$$;

GRANT EXECUTE ON FUNCTION public.team_member_directory() TO authenticated;
