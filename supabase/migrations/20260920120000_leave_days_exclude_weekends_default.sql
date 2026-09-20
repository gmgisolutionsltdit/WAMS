-- Leave chargeable-days were being inflated: bridge_holidays defaulted to
-- true for every leave type, with no UI to turn it off, so weekends
-- immediately touching a request (which is virtually every Monday-start or
-- Friday-end leave) were silently bridged into the charge on top of any
-- weekends actually inside the date range. Leave requests should not
-- charge weekends/holidays unless a leave type explicitly opts in (or the
-- separate "sandwich" toggle is used).

ALTER TABLE public.leave_types ALTER COLUMN bridge_holidays SET DEFAULT false;
UPDATE public.leave_types SET bridge_holidays = false WHERE bridge_holidays = true;
