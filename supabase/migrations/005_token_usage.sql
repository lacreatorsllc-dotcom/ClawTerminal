-- ClawTerminal: Token usage tracking
-- Adds input/output token counts to messages (nullable — Telegram messages won't have these)

alter table public.messages
  add column if not exists input_tokens  integer,
  add column if not exists output_tokens integer;
