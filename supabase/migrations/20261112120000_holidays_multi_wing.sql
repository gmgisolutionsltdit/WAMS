-- Holidays' Wing field becomes multi-select (an admin can mark a holiday as
-- applying to any combination of wings, not just one or "all"), and reads
-- from the dynamic company_wings list instead of the hardcoded GMGI/MORU
-- enum — admins can already add new wings there (Employee Management), and
-- holidays should follow suit rather than being stuck with MORU forever.
--
-- wing_names holds the matched wings by name (text, since every read site
-- compares against profiles.company_wing, a text column, not a wing id) —
-- NULL or empty = applies to every wing, same meaning the old `wing IS
-- NULL` had. The legacy `wing` enum column is left in place (nullable
-- already) for any historical reference, but the app no longer writes or
-- reads it.
ALTER TABLE public.holidays ADD COLUMN IF NOT EXISTS wing_names text[];

UPDATE public.holidays SET wing_names = ARRAY[wing::text] WHERE wing IS NOT NULL AND wing_names IS NULL;
