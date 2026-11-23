-- Follow-up to 20261122100000_rename_moru_wing_to_groupmappers.sql, per
-- Codex review on PR #352: that migration renamed the company_wing enum
-- value and backfilled holidays.wing_names, but never touched the
-- company_wings table's own seed row (name/code 'MORU', inserted by
-- 20260524175545_ad2b40ae-19d2-46f7-922b-86fd71a2fd30.sql) — the table the
-- UI actually reads to populate the Wing checkboxes. Production's row was
-- already renamed by an admin via the UI before any of this, so this is a
-- no-op there; it matters for any environment built by replaying migrations
-- from scratch, which would otherwise still offer "MORU" as a wing name,
-- clashing with the now-renamed enum value.

UPDATE public.company_wings
SET name = 'GroupMappers', code = 'GROUPMAPPERS'
WHERE name = 'MORU';
