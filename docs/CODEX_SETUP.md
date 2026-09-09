# Working on WAMS from the web (ChatGPT Codex) — CI/CD setup

Codex (and any other "edit files in the browser, push a commit" workflow) has no
shell: it cannot run `vercel`, `supabase`, `psql`, or Node scripts. GitHub
Actions in this repo do all of that instead. Once the secrets below are set, the
only thing you ever do is **edit files and merge to `main`**.

## What each limitation maps to

| Needs a machine / CLI | Handled by | Trigger |
| --- | --- | --- |
| Deploy the site to Vercel | `.github/workflows/deploy.yml` | every push to `main`, or run manually |
| Vercel blocks deploys from non–team-member commit authors | same workflow — it deploys with a team-owned `VERCEL_TOKEN`, so the commit author is irrelevant. Vercel's own Git auto-deploy for `main` is disabled in `vercel.json`. | — |
| Apply new database migrations | `.github/workflows/supabase-migrations.yml` (`supabase db push`) | push to `main` touching `supabase/migrations/**`, or run manually |
| Create / reset an admin login | `.github/workflows/admin-user.yml` | manual (Actions tab → *Manage admin user* → Run workflow) |
| Build / test feedback before merge | `.github/workflows/ci.yml` | pull requests and non-`main` branches |

## One-time setup — add repository secrets

GitHub → repo **Settings → Secrets and variables → Actions → New repository secret**.
**These are already set** — listed here for rotation / reference:

| Secret | How to get it |
| --- | --- |
| `VERCEL_TOKEN` | https://vercel.com/account/tokens (signed in as **gmgisolutionsltdit-8300**). A project token for `wams` is enough. `vercel deploy` works with it; `vercel pull` / `vercel build` do not (they need team-level reads) — that's why `deploy.yml` builds server-side. |
| `SUPABASE_DB_URL` | Supabase dashboard → project `vnocjkpeuprzowffsgfe` → **Project Settings → Database → Connection string → URI**, pick the **Session pooler** (port `5432`). Percent-encode symbols in the password. Shape: `postgresql://postgres.vnocjkpeuprzowffsgfe:<PASSWORD>@aws-0-us-east-1.pooler.supabase.com:5432/postgres` |
| `SUPABASE_URL` | `https://vnocjkpeuprzowffsgfe.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → **Project Settings → API → `service_role` secret**. Only used by the *Manage admin user* workflow. |

The Vercel project/org IDs are not secret and are committed in
`.vercel/project.json`:

- org (team `gmgi`): `team_Cf4jFHGaoEIprOnJnp9HxtF8`
- project `wams`: `prj_peLoedwajLddA6H2O9C5eOfkcqa6`

The frontend's `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are set as
env vars **on the Vercel project itself**, so the cloud build picks them up — they
are not needed as GitHub secrets.

## Day-to-day flow with Codex

1. Codex edits code / adds a migration file under `supabase/migrations/` and opens a PR.
2. **CI** runs build + tests on the PR.
3. Merge to `main`.
4. **Supabase migrations** runs first if any `.sql` file changed, then **Deploy** ships the site.
5. Live at <https://wams-gmgi.vercel.app>.

### Adding a database migration by hand

Create `supabase/migrations/<UTC-timestamp>_<slug>.sql`, e.g.
`supabase/migrations/20260910120000_add_widget_table.sql`. The timestamp must be
newer than every existing file. `supabase db push` applies only files not yet in
the remote `supabase_migrations.schema_migrations` table, so merges are
idempotent.

## Notes / limits

- **Vercel plan is Hobby (free).** Vercel's terms restrict Hobby to
  non-commercial use; a company HR system in production should move the `wams`
  project to a Pro team. The workflows are unaffected by the upgrade.
- If you ever want Vercel's native preview deployments for PRs back, remove the
  `git.deploymentEnabled` block from `vercel.json` — but then commits authored
  outside the Vercel team will show up as blocked deployments again (harmless,
  just noise; the Action is still the source of truth for `main`).
- The deploy workflow always targets **production**. There is no staging project.
- `scripts/create-admin.mjs` can also be run locally with the same env vars if needed.
