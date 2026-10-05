-- Normalize the duplicate machine status "working" to "on_hire".
-- Run once in the Supabase SQL Editor after the core schema exists.
begin;

update public.machine
set current_status = 'on_hire'
where current_status::text = 'working';

commit;
