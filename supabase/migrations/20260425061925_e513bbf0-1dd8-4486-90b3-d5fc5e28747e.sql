-- Row-level guard: prevent deleting any profile linked to an admin role
CREATE OR REPLACE FUNCTION public.prevent_admin_profile_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = OLD.id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Safety Lock: Cannot delete an admin profile (id=%). Remove the admin role first.', OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS block_admin_profile_delete ON public.profiles;
CREATE TRIGGER block_admin_profile_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_profile_delete();

-- Statement-level guard: block DELETE without a WHERE clause
CREATE OR REPLACE FUNCTION public.prevent_unfiltered_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO deleted_count FROM old_table;
  SELECT COUNT(*) INTO total_count FROM public.profiles;
  -- If the delete affects every row currently in the table, treat it as an unfiltered wipe
  IF deleted_count > 0 AND deleted_count = (deleted_count + total_count) THEN
    RAISE EXCEPTION 'Safety Lock: Refusing DELETE that would wipe all profiles. Use a WHERE clause.';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS block_unfiltered_profile_delete ON public.profiles;
CREATE TRIGGER block_unfiltered_profile_delete
AFTER DELETE ON public.profiles
REFERENCING OLD TABLE AS old_table
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_unfiltered_delete();