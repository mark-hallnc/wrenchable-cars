create table if not exists public.admin_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_job_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.admin_jobs(id) on delete cascade,
  level text not null default 'info',
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_jobs_status_created_at_idx
on public.admin_jobs (status, created_at);

create index if not exists admin_job_logs_job_id_created_at_idx
on public.admin_job_logs (job_id, created_at);

create or replace function public.set_admin_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_admin_jobs_updated_at on public.admin_jobs;

create trigger set_admin_jobs_updated_at
before update on public.admin_jobs
for each row
execute function public.set_admin_jobs_updated_at();

alter table public.admin_jobs enable row level security;
alter table public.admin_job_logs enable row level security;

-- Temporary admin-console access for the current password-gated static admin page.
-- Secure this later with real authentication/authorization before exposing sensitive jobs.
create policy "Temporary anon select admin jobs"
on public.admin_jobs
for select
to anon
using (true);

-- Temporary admin-console access for creating local-worker jobs from the static admin page.
-- Secure this later with real authentication/authorization before exposing sensitive jobs.
create policy "Temporary anon insert admin jobs"
on public.admin_jobs
for insert
to anon
with check (true);

-- Temporary admin-console access for viewing local-worker logs from the static admin page.
-- Secure this later with real authentication/authorization before exposing sensitive logs.
create policy "Temporary anon select admin job logs"
on public.admin_job_logs
for select
to anon
using (true);

grant select, insert on public.admin_jobs to anon;
grant select on public.admin_job_logs to anon;
