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