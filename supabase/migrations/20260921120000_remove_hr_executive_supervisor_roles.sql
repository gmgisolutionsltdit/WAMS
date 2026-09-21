-- Collapse the role system down to employee, manager and admin only.
-- Postgres enums can't drop values, so the 'hr'/'executive'/'supervisor'
-- labels remain in the app_role type, but every account holding one of
-- them is reassigned to manager, and no application code offers or
-- checks for these roles anymore.

-- Drop the reassigned role first wherever the user already also holds
-- 'manager', to avoid violating the (user_id, role) unique constraint.
DELETE FROM public.user_roles ur
WHERE ur.role IN ('hr', 'executive', 'supervisor')
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = ur.user_id AND ur2.role = 'manager'::public.app_role
  );

UPDATE public.user_roles
SET role = 'manager'
WHERE role IN ('hr', 'executive', 'supervisor');

-- Approval tiers: only employee (1), manager (2), admin (3) remain.
CREATE OR REPLACE FUNCTION public.approval_tier(_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(
    CASE role
      WHEN 'admin' THEN 3
      WHEN 'manager' THEN 2
      ELSE 1
    END
  ), 1)
  FROM public.user_roles
  WHERE user_id = _user_id;
$$;

-- 48h retro-lock bypass: admin only (hr no longer exists).
CREATE OR REPLACE FUNCTION public.enforce_48h_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.date IS NOT NULL
     AND NEW.date < (CURRENT_DATE - INTERVAL '2 days')::date THEN
    RAISE EXCEPTION 'Submissions for dates older than 48 hours are restricted.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_48h_window_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.start_date IS NOT NULL
     AND NEW.start_date < (CURRENT_DATE - INTERVAL '2 days')::date THEN
    RAISE EXCEPTION 'Submissions for dates older than 48 hours are restricted.';
  END IF;
  RETURN NEW;
END;
$$;
