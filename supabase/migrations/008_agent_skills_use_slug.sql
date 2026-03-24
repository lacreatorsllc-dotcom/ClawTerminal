-- Migration 008: Replace skill_id UUID FK with skill_slug text
-- Reason: app installs skills by slug from ClawHub, not by UUID from local skills table

-- Drop old agent_skills table (no production data to preserve)
drop table if exists public.agent_skills;

-- Recreate with skill_slug instead of skill_id
create table public.agent_skills (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.agents(id) on delete cascade,
  skill_slug  text not null,
  config      jsonb not null default '{}',
  status      text not null default 'active'
                check (status in ('active', 'pending', 'error')),
  assigned_at timestamptz default now(),
  unique (agent_id, skill_slug)
);

create index if not exists agent_skills_agent_id_idx on public.agent_skills(agent_id);
