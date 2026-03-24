-- ClawTerminal: Telegram Connector
-- Stores Telegram bot connections per user

create table if not exists public.connectors (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  agent_id            uuid references public.agents(id) on delete set null,
  type                text not null default 'telegram'
                        check (type in ('telegram')),
  token               text not null,          -- Telegram bot token — only readable via service role
  bot_username        text,                   -- e.g. "MyAgentBot"
  bot_name            text,                   -- display name from getMe
  telegram_chat_id    text,                   -- set on first inbound message
  webhook_registered  boolean not null default false,
  created_at          timestamptz default now()
);

create index if not exists connectors_user_id_idx on public.connectors(user_id);
create index if not exists connectors_agent_id_idx on public.connectors(agent_id);

-- ─────────────────────────────────────────────
-- RLS
-- Users can manage their own connectors.
-- Token column is protected: SELECT via anon/user key never returns it.
-- Service role bypasses RLS entirely and can read all columns.
-- ─────────────────────────────────────────────

alter table public.connectors enable row level security;

create policy "users can insert own connectors"
  on public.connectors for insert
  with check (auth.uid() = user_id);

create policy "users can select own connectors"
  on public.connectors for select
  using (auth.uid() = user_id);

create policy "users can update own connectors"
  on public.connectors for update
  using (auth.uid() = user_id);

create policy "users can delete own connectors"
  on public.connectors for delete
  using (auth.uid() = user_id);
