-- Backfill profiles + roles for existing auth users that were created before the handle_new_user trigger
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

-- Assign admin role to shahriar@gmgisolutionsltd.com, employee to everyone else missing a role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
  CASE WHEN LOWER(u.email) = 'shahriar@gmgisolutionsltd.com' THEN 'admin'::public.app_role
       ELSE 'employee'::public.app_role END
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id);