import Anthropic from '@anthropic-ai/sdk';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import * as os from 'os';

const SUPABASE_URL = 'https://davonrtdydhdgbwnpuxy.supabase.co';
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhdm9ucnRkeWRoZGdid25wdXh5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDIyMjg2OCwiZXhwIjoyMDg5Nzk4ODY4fQ.3LNbwLYn0zLmck-nRG-VclmKAFggLU0BV0HsZz3MyfQ';
const HEARTBEAT_INTERVAL_MS = 30_000;

interface AgentOptions {
  userId: string;
  agentName: string;
  systemPrompt: string;
  apiKey: string;
}

interface MessageHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export async function runAgent({ userId, agentName, systemPrompt, apiKey }: AgentOptions): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const anthropic = new Anthropic({ apiKey });
  const history: MessageHistoryItem[] = [];

  // Register agent
  const { data: agent, error } = await supabase
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
        powered_by: 'claude',
      },
    }, { onConflict: 'user_id,name', ignoreDuplicates: false })
    .select('id, name')
    .single();

  if (error || !agent) {
    console.error('[claw-agent] Failed to register agent:', error?.message);
    process.exit(1);
  }

  const agentId = agent.id as string;
  let responding = false;

  const channel: RealtimeChannel = supabase
    .channel(`agent:${agentId}`)
    .on('broadcast', { event: 'message' }, async (event) => {
      const payload = event.payload as { direction: string; content: string; ts: number };
      if (payload.direction !== 'inbound') return;
      if (responding) return; // drop if already responding

      const userMessage = payload.content;
      console.log(`[user] ${userMessage}`);
      responding = true;

      try {
        history.push({ role: 'user', content: userMessage });

        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: systemPrompt,
          messages: history,
        });

        const reply = response.content[0].type === 'text' ? response.content[0].text : '';
        history.push({ role: 'assistant', content: reply });

        // Broadcast back to app
        await channel.send({
          type: 'broadcast',
          event: 'message',
          payload: { direction: 'outbound', content: reply, ts: Date.now() },
        });

        // Persist to DB with token usage
        await supabase.from('messages').insert({
          agent_id: agentId,
          user_id: userId,
          direction: 'outbound',
          content: reply,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        });

        console.log(`[agent] ${reply}`);
      } catch (err: any) {
        console.error('[claw-agent] Claude error:', err.message);
      } finally {
        responding = false;
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await supabase
          .from('agents')
          .update({ status: 'connected', last_seen: new Date().toISOString() })
          .eq('id', agentId);

        console.log(`[claw-agent] "${agentName}" is online (id: ${agentId})`);
        console.log(`[claw-agent] Powered by Claude. Waiting for messages…`);
      }
    });

  // Heartbeat
  const heartbeat = setInterval(async () => {
    await supabase
      .from('agents')
      .update({ status: 'connected', last_seen: new Date().toISOString() })
      .eq('id', agentId);
  }, HEARTBEAT_INTERVAL_MS);

  const handleExit = async () => {
    clearInterval(heartbeat);
    try {
      await supabase.from('agents').update({ status: 'disconnected' }).eq('id', agentId);
      await supabase.removeChannel(channel);
    } catch { /* best-effort */ }
    process.exit(0);
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);
}
