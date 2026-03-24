-- ClawTerminal: Initial Schema
-- Run against your Supabase project SQL editor or via supabase db push

-- ─────────────────────────────────────────────
-- Users profile table (extends auth.users)
-- ─────────────────────────────────────────────
create table if not exists public.users (
  id          uuid primary key references auth.users on delete cascade,
  email       text,
  created_at  timestamptz default now()
);

-- Auto-create profile row when auth user is created
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────
-- Agents
-- ─────────────────────────────────────────────
create table if not exists public.agents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null,
  status      text not null default 'disconnected'
                check (status in ('disconnected','connecting','connected','stale','error')),
  last_seen   timestamptz,
  metadata    jsonb not null default '{}',  -- connector_version, env, protocol_version, etc.
  created_at  timestamptz default now()
);

create index if not exists agents_user_id_idx on public.agents(user_id);

-- ─────────────────────────────────────────────
-- Messages
-- ─────────────────────────────────────────────
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.agents(id) on delete cascade,
  user_id     uuid not null references public.users(id),
  direction   text not null check (direction in ('inbound', 'outbound')),
  content     text not null,
  created_at  timestamptz default now()
);

create index if not exists messages_agent_id_idx on public.messages(agent_id);
create index if not exists messages_created_at_idx on public.messages(agent_id, created_at desc);

-- ─────────────────────────────────────────────
-- Skills (curated catalog — seeded, no client insert in v1)
-- ─────────────────────────────────────────────
create table if not exists public.skills (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text not null,
  category      text,
  version       text not null default '1.0.0',
  config_schema jsonb not null default '{}',  -- describes required/optional config fields
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────────
-- Agent Skill Assignments
-- ─────────────────────────────────────────────
create table if not exists public.agent_skills (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.agents(id) on delete cascade,
  skill_id    uuid not null references public.skills(id),
  config      jsonb not null default '{}',  -- user-provided config values
  status      text not null default 'active'
                check (status in ('active', 'pending', 'error')),
  assigned_at timestamptz default now(),
  unique (agent_id, skill_id)
);

create index if not exists agent_skills_agent_id_idx on public.agent_skills(agent_id);
