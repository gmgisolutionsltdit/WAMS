-- Add 'modified' to the ot_status enum
ALTER TYPE public.ot_status ADD VALUE IF NOT EXISTS 'modified';