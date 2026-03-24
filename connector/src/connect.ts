import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import * as readline from 'readline';
import * as os from 'os';

const SUPABASE_URL = 'https://davonrtdydhdgbwnpuxy.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhdm9ucnRkeWRoZGdid25wdXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjI4NjgsImV4cCI6MjA4OTc5ODg2OH0.EakW4lWGWbvbBNesauOiQYzZUL1TM4zJQrxDTSa3-EE';
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhdm9ucnRkeWRoZGdid25wdXh5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDIyMjg2OCwiZXhwIjoyMDg5Nzk4ODY4fQ.3LNbwLYn0zLmck-nRG-VclmKAFggLU0BV0HsZz3MyfQ';

const HEARTBEAT_INTERVAL_MS = 30_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ConnectOptions {
  userId: string;
  agentName: string;
}

async function resolveUserId(token: string): Promise<{ userId: string; serviceClient: SupabaseClient | null }> {
  // If it's already a UUID, use it directly (production path — caller must auth externally)
  if (UUID_RE.test(token)) {
    return { userId: token, serviceClient: null };
  }

  // Dev token path: look up token in dev_tokens table (public read, anon key is fine)
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) {
    console.error(
      '[claw-connector] Token is not a UUID and SUPABASE_SERVICE_KEY env var is not set.\n' +
      '  Set it to your Supabase service role key to use dev tokens, or pass a UUID directly.'
    );
    process.exit(1);
  }

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await anonClient
    .from('dev_tokens')
    .select('user_id')
    .eq('token', token)
    .single();

  if (error || !data) {
    console.error(`[claw-connector] Dev token "${token}" not found in dev_tokens table.`);
    console.error('  Seed it with: INSERT INTO public.dev_tokens (token, user_id) VALUES (\'<token>\', \'<user-uuid>\');');
    process.exit(1);
  }

  const serviceClient = createClient(SUPABASE_URL, serviceKey);
  return { userId: data.user_id as string, serviceClient };
}

interface MessageRow {
  id: string;
  agent_id: string;
  user_id: string;
  direction: string;
  content: string;
  created_at: string;
}

export async function connect({ userId: rawToken, agentName }: ConnectOptions): Promise<void> {
  const { userId, serviceClient } = await resolveUserId(rawToken);

  // Always use service key to bypass RLS — connector is a trusted server-side process
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (serviceClient) {
    console.log(`[claw-connector] Dev token resolved → user_id: ${userId}`);
  }

  // 1. Upsert agent — update existing if same user+name, else insert
  const { data: agent, error: upsertError } = await supabase
    .from('agents')
    .upsert({
      user_id: userId,
      name: agentName,
      status: 'connecting',
      last_seen: new Date().toISOString(),
      metadata: {
        hostname: os.hostname(),
        platform: os.platform(),
        node_version: process.version,
      },
    }, { onConflict: 'user_id,name', ignoreDuplicates: false })
    .select('id, name')
    .single();

  if (upsertError || !agent) {
    console.error('[claw-connector] Failed to register agent:', upsertError?.message ?? 'unknown error');
    process.exit(1);
  }

  const agentId: string = agent.id as string;

  // 2. Subscribe to Realtime for inbound messages
  const channel: RealtimeChannel = supabase
    .channel(`agent:${agentId}:messages`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `agent_id=eq.${agentId}`,
      },
      (payload) => {
        const row = payload.new as MessageRow;
        if (row.direction === 'inbound') {
          const output = JSON.stringify({ from: 'app', content: row.content, ts: row.created_at });
          console.log(`[app] ${row.content}`);
          // Also emit structured JSON on a dedicated line for programmatic consumers
          process.stderr.write(output + '\n');
        }
      }
    )
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // 3. Update agent status to 'connected'
        await supabase
          .from('agents')
          .update({ status: 'connected', last_seen: new Date().toISOString() })
          .eq('id', agentId);

        console.log(`[claw-connector] Connected as "${agentName}" (id: ${agentId})`);
        console.log('[claw-connector] Listening for messages. Type to reply.');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(`[claw-connector] Realtime channel error: ${status}`);
        await cleanup(supabase, agentId, channel);
        process.exit(1);
      }
    });

  // 4. Read stdin line by line — each line is an outbound message
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const { error } = await supabase.from('messages').insert({
      agent_id: agentId,
      user_id: userId,
      direction: 'outbound',
      content: trimmed,
    });

    if (error) {
      console.error('[claw-connector] Failed to send message:', error.message);
    }
  });

  rl.on('close', async () => {
    // stdin closed (e.g. pipe ended)
    await cleanup(supabase, agentId, channel);
    process.exit(0);
  });

  // 5. Heartbeat every 30s
  const heartbeat = setInterval(async () => {
    const { error } = await supabase
      .from('agents')
      .update({ status: 'connected', last_seen: new Date().toISOString() })
      .eq('id', agentId);

    if (error) {
      console.error('[claw-connector] Heartbeat failed:', error.message);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // 6. Graceful shutdown on SIGINT / SIGTERM
  const handleExit = async () => {
    clearInterval(heartbeat);
    await cleanup(supabase, agentId, channel);
    process.exit(0);
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cleanup(
  supabase: SupabaseClient<any>,
  agentId: string,
  channel: RealtimeChannel
): Promise<void> {
  try {
    await supabase
      .from('agents')
      .update({ status: 'disconnected', last_seen: new Date().toISOString() })
      .eq('id', agentId);
  } catch {
    // best-effort
  }

  try {
    await supabase.removeChannel(channel);
  } catch {
    // best-effort
  }
}
