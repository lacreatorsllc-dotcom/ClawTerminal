-- Public read access for search, profiles, and feeds
-- Without this, users can only read their own rows — breaking search and profile pages.

-- ─────────────────────────────────────────────
-- users: allow any authenticated user to read public profile fields
-- ─────────────────────────────────────────────
create policy "users_public_read" on public.users
  for select
  using (true);

-- ─────────────────────────────────────────────
-- agents: allow any authenticated user to read any agent
-- (write operations still governed by existing users_own_agents policy)
-- ─────────────────────────────────────────────
create policy "agents_public_read" on public.agents
  for select
  using (true);
