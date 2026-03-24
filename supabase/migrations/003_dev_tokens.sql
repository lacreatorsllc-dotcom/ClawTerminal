-- ClawTerminal: Dev Preview Tokens
-- Allows non-UUID string tokens to be resolved to a user_id for local development.
-- The connector resolves the token here before inserting into agents.
-- IMPORTANT: Only seed rows in dev/staging — never production.

create table if not exists public.dev_tokens (
  token      text primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  label      text,
  created_at timestamptz default now()
);

alter table public.dev_tokens enable row level security;

-- Anon key can read (needed for token resolution in connector)
create policy "dev_tokens_public_read" on public.dev_tokens
  for select using (true);

-- Only service role / admin can insert or delete
-- (no client-side insert policy intentionally)
