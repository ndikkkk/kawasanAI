-- Run once in the SQL Editor of your own Supabase project.
-- Re-running this script does not erase existing history.
create table if not exists public.kawasan_history (
  id text primary key check (id = 'shared'),
  revision uuid not null default gen_random_uuid(),
  conversations jsonb not null default '[]'::jsonb,
  constraint conversations_array check (jsonb_typeof(conversations) = 'array'),
  constraint conversations_count check (jsonb_array_length(conversations) <= 100),
  constraint conversations_size check (octet_length(conversations::text) <= 4194304)
);

alter table public.kawasan_history enable row level security;
revoke all on public.kawasan_history from public, anon, authenticated;
grant select, update on public.kawasan_history to service_role;
-- No browser-facing RLS policy: only the server secret may read/write.
insert into public.kawasan_history (id) values ('shared') on conflict (id) do nothing;

-- Private successful-login audit. View only in the owner's Supabase dashboard.
create table if not exists public.kawasan_login_events (
  id uuid primary key default gen_random_uuid(),
  logged_in_at timestamptz not null default now(),
  subject text not null,
  ip_address inet,
  country text,
  region text,
  city text,
  location_source text not null,
  user_agent text
);
create index if not exists kawasan_login_events_time_idx on public.kawasan_login_events (logged_in_at desc);
alter table public.kawasan_login_events enable row level security;
revoke all on public.kawasan_login_events from public, anon, authenticated;
grant insert, select on public.kawasan_login_events to service_role;