-- The "MORU" wing is being renamed to "GroupMappers" — same employees, same
-- holidays, same OT/attendance/salary calculations, just a new label. The
-- company_wings table row was already renamed by an admin via the UI; this
-- migration catches up the two places that still hold the old literal value:
--
-- 1. The company_wing enum backing profiles.company_wing. Renaming the enum
--    value (rather than adding a new one) updates every existing row that
--    currently reads 'MORU' to read 'GroupMappers' in place — no row data
--    changes, just the label, so no profile needs to be re-saved and no
--    calculation that reads profiles.company_wing is affected.
-- 2. holidays.wing_names, a plain text[] column (added so read sites don't
--    have to query the enum type), which does NOT follow the enum rename
--    automatically and must be backfilled by value.

ALTER TYPE public.company_wing RENAME VALUE 'MORU' TO 'GroupMappers';

UPDATE public.holidays
SET wing_names = array_replace(wing_names, 'MORU', 'GroupMappers')
WHERE 'MORU' = ANY (wing_names);
