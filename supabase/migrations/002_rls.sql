-- ClawTerminal: Row Level Security Policies
-- Apply after 001_schema.sql
-- IMPORTANT: Test with a second user account before any production traffic

-- ─────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────
alter table public.users enable row level security;

create policy "users_own_profile" on public.users
  using (id = auth.uid());

-- ─────────────────────────────────────────────
-- agents
-- ─────────────────────────────────────────────
alter table public.agents enable row level security;

-- Users can read, insert, update, delete their own agents
create policy "users_own_agents" on public.agents
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- messages
-- ─────────────────────────────────────────────
alter table public.messages enable row level security;

-- Users can read and insert their own messages
create policy "users_own_messages" on public.messages
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- skills (public read — curated catalog)
-- ─────────────────────────────────────────────
alter table public.skills enable row level security;

create policy "skills_public_read" on public.skills
  for select using (true);

-- No insert/update/delete from client — admin only via service role

-- ─────────────────────────────────────────────
-- agent_skills
-- ─────────────────────────────────────────────
alter table public.agent_skills enable row level security;

-- Users can manage skill assignments for agents they own
create policy "users_own_agent_skills" on public.agent_skills
  using (
    exists (
      select 1 from public.agents
      where agents.id = agent_skills.agent_id
        and agents.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.agents
      where agents.id = agent_skills.agent_id
        and agents.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- RLS Test Checklist
-- ─────────────────────────────────────────────
-- Run the following manual checks with two separate user accounts (user_a, user_b):
--
-- 1. user_a inserts agent → can select it → user_b cannot select it
-- 2. user_a inserts message for their agent → user_b cannot select it
-- 3. user_a assigns skill to their agent → user_b cannot select assignment
-- 4. both users can select all skills (public read)
-- 5. user_a cannot update/delete user_b's agent
-- 6. connector (service role) can read/write any row — bypasses RLS by design
