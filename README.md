# Workforce & Attendance Management System (WAMS)

WAMS manages employees, attendance, overtime, leave, projects, expenses, and payroll. Built with React, TypeScript, Vite, and Supabase (PostgreSQL, Auth, Storage) and Vercel Functions (employee administration).

Repository: https://github.com/gmgisolutionsltdit/WAMS

## Local development

Requires Node.js 22 and npm.

```sh
npm ci
cp .env.example .env.local
# Set your Supabase project URL and publishable key in .env.local.
npm run dev
```

An existing local `.env` can also supply these settings. Local environment files are ignored by Git. Only the public project URL and publishable/anon key belong in `VITE_*` variables; never put database passwords or service-role keys there.

```sh
npm run build
npm test
npm run lint
```

## Supabase setup

Use a Supabase Free project, either directly at https://supabase.com/dashboard or through the Vercel Marketplace integration: https://supabase.com/docs/guides/integrations/vercel-marketplace. Supabase provides the database; Vercel hosts the frontend.

For a **new, empty project**, authenticate the CLI, link the intended project, review the migration plan, and apply the checked-in migrations:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

The migrations create the application schema, access policies, and the `avatars` and `task-attachments` storage buckets. `supabase/config.toml` identifies the WAMS Supabase project. Explicitly link/select the intended project before remote commands. Employee administration runs at `/api/admin-user-management` on Vercel and validates the caller's Supabase session and admin role. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as server-only Vercel environment variables; never prefix the service-role key with `VITE_`. Use `npx vercel dev` to run frontend and API together locally.

Migrations do **not** transfer existing users, attendance records, or uploaded files. To move an existing installation, export and restore its database/auth data and storage objects with source and destination access before switching environment variables. Do not apply a fresh-project migration sequence blindly to an existing database.

In Supabase Authentication:

- Set Site URL to the final deployment origin.
- Allow that origin and its `/reset-password` URL, plus `http://localhost:8080` and `http://localhost:8080/reset-password` for development.
- Enable and configure the Google provider to use Google sign-in, including the Supabase callback URL in the Google OAuth client, then set `VITE_ENABLE_GOOGLE_AUTH=true` and redeploy. The button is hidden until this is enabled.
- Configure email delivery for password recovery.
- Create the initial administrator through the dashboard. Existing migrations grant admin to the configured bootstrap email; for a different administrator, assign the `admin` role in `public.user_roles` using the trusted dashboard after creating the auth user.

## Vercel deployment

Vercel Hobby is restricted to personal, non-commercial use. Company operations require an eligible hosting plan; do not choose a paid plan if a zero-cost deployment is required. Check https://vercel.com/docs/plans/hobby and https://supabase.com/pricing for current eligibility and quotas.

1. Import the WAMS repository into Vercel, or deploy this directory with the Vercel CLI. Git integration availability also depends on the account plan and repository ownership.
2. Use the Vite preset. `vercel.json` configures `npm ci`, `npm run build`, the `dist` output, and client-side route handling.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the intended Supabase project to the Vercel environment. If Marketplace supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY`, copy their corresponding public values into these `VITE_*` names; Vite only exposes prefixed variables.
4. Deploy, then configure Supabase's authentication URLs as described above. Rebuild/redeploy whenever frontend environment variables change.
5. Verify email login, Google login (if enabled), password recovery, a direct visit to `/attendance`, admin user creation, and file uploads against the selected backend.

A successful frontend build does not confirm that a new database has been provisioned, migrated, or configured for authentication.

## Production

Frontend: https://wams-five.vercel.app

Supabase project: `vnocjkpeuprzowffsgfe`. The initial schema is managed through the checked-in migrations. Only public Supabase values are included in the browser build.
