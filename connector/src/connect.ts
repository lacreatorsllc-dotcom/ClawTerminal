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

async function resolveUserId(token: string): Promise<{ userId: string }> {
  if (UUID_RE.test(token)) {
    return { userId: token };
  }

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await anonClient
    .from('dev_tokens')
    .select('user_id')
    .eq('token', token)
    .single();

  if (error || !data) {
    console.error(`[claw-connector] Dev token "${token}" not found in dev_tokens table.`);
    process.exit(1);
  }

  return { userId: data.user_id as string };
}

export async function connect({ userId: rawToken, agentName }: ConnectOptions): Promise<void> {
  const { userId } = await resolveUserId(rawToken);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. Upsert agent
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
        protocol_version: '1.0',
      },
    }, { onConflict: 'user_id,name', ignoreDuplicates: false })
    .select('id, name')
    .single();

  if (upsertError || !agent) {
    console.error('[claw-connector] Failed to register agent:', upsertError?.message ?? 'unknown error');
    process.exit(1);
  }

  const agentId: string = agent.id as string;

  // 2. Subscribe to broadcast channel — same channel the app uses
  const channel: RealtimeChannel = supabase
    .channel(`agent:${agentId}`)
    .on('broadcast', { event: 'message' }, async (event) => {
      const payload = event.payload as { direction: string; content: string; ts: number };
      if (payload.direction !== 'inbound') return;

      // Print message for the agent process to consume
      console.log(`[app] ${payload.content}`);
      process.stderr.write(JSON.stringify({ from: 'app', content: payload.content, ts: payload.ts }) + '\n');
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
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

  // 3. Read stdin — each line is an agent response sent back to the app
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Broadcast to app for real-time delivery
    await channel.send({
      type: 'broadcast',
      event: 'message',
      payload: { direction: 'outbound', content: trimmed, ts: Date.now() },
    });

    // Persist to DB
    await supabase.from('messages').insert({
      agent_id: agentId,
      user_id: userId,
      direction: 'outbound',
      content: trimmed,
    });
  });

  rl.on('close', async () => {
    await cleanup(supabase, agentId, channel);
    process.exit(0);
  });

  // 4. Heartbeat every 30s
  let heartbeatRunning = false;
  const heartbeat = setInterval(async () => {
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    try {
      await supabase
        .from('agents')
        .update({ status: 'connected', last_seen: new Date().toISOString() })
        .eq('id', agentId);
    } finally {
      heartbeatRunning = false;
    }
  }, HEARTBEAT_INTERVAL_MS);

  // 5. Graceful shutdown
  const handleExit = async () => {
    clearInterval(heartbeat);
    await cleanup(supabase, agentId, channel);
    process.exit(0);
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);
}

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
  } catch { /* best-effort */ }

  try {
    await supabase.removeChannel(channel);
  } catch { /* best-effort */ }
}
