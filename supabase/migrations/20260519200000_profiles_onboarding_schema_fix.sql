-- Fixes POST /api/onboarding when profiles.onboarding_answers is missing from PostgREST cache.
alter table public.profiles
  add column if not exists onboarding_answers jsonb not null default '{}'::jsonb;

alter table public.profiles
  add column if not exists signup_wizard_completed boolean not null default false;

alter table public.profiles
  add column if not exists use_case text;

notify pgrst, 'reload schema';

-- Service-role self-heal (optional; safe to re-run).
create or replace function public.ensure_profiles_onboarding_schema()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  alter table public.profiles
    add column if not exists onboarding_answers jsonb not null default '{}'::jsonb;
  alter table public.profiles
    add column if not exists signup_wizard_completed boolean not null default false;
  alter table public.profiles
    add column if not exists use_case text;
  notify pgrst, 'reload schema';
end;
$$;

revoke all on function public.ensure_profiles_onboarding_schema() from public;
grant execute on function public.ensure_profiles_onboarding_schema() to service_role;
