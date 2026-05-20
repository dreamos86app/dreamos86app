-- Run once in Supabase Dashboard → SQL Editor for project xycqutvqxtkbszytaxbe
-- (or your project ref from NEXT_PUBLIC_SUPABASE_URL).
-- Fixes: Could not find the 'onboarding_answers' column of 'profiles' in the schema cache

alter table public.profiles
  add column if not exists onboarding_answers jsonb not null default '{}'::jsonb;

alter table public.profiles
  add column if not exists signup_wizard_completed boolean not null default false;

alter table public.profiles
  add column if not exists use_case text;

notify pgrst, 'reload schema';
