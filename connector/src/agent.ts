import Anthropic from '@anthropic-ai/sdk';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const SUPABASE_URL = 'https://davonrtdydhdgbwnpuxy.supabase.co';
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhdm9ucnRkeWRoZGdid25wdXh5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDIyMjg2OCwiZXhwIjoyMDg5Nzk4ODY4fQ.3LNbwLYn0zLmck-nRG-VclmKAFggLU0BV0HsZz3MyfQ';
const HEARTBEAT_INTERVAL_MS = 30_000;
const HISTORY_LIMIT = 50;
const PROJECT_ROOT = '/Users/mememarketer/Pentagon/ClawTerminal';

interface AgentOptions {
  userId: string;
  agentName: string;
  systemPrompt: string;
  apiKey: string;
}

interface MessageHistoryItem {
  role: 'user' | 'assistant';
  content: string | Anthropic.Messages.ContentBlock[];
}

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file in the ClawTerminal project',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path relative to project root or absolute' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file in the ClawTerminal project',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path relative to project root or absolute' },
        content: { type: 'string', description: 'Full file content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'bash',
    description: 'Run a shell command in the ClawTerminal project directory',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
      },
      required: ['command'],
    },
  },
];

function resolvePath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(PROJECT_ROOT, filePath);
}

function executeTool(name: string, input: any): string {
  try {
    if (name === 'read_file') {
      const resolved = resolvePath(input.path);
      return fs.readFileSync(resolved, 'utf8');
    }
    if (name === 'write_file') {
      const resolved = resolvePath(input.path);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, input.content, 'utf8');
      return `Written: ${resolved}`;
    }
    if (name === 'bash') {
      const result = execSync(input.command, {
        cwd: PROJECT_ROOT,
        timeout: 30000,
        encoding: 'utf8',
      });
      return result || '(no output)';
    }
    return `Unknown tool: ${name}`;
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}

export async function runAgent({ userId, agentName, systemPrompt, apiKey }: AgentOptions): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const anthropic = new Anthropic({ apiKey });

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

  // Load conversation history
  const history: MessageHistoryItem[] = [];
  const { data: pastMessages } = await supabase
    .from('messages')
    .select('direction, content')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true })
    .limit(HISTORY_LIMIT);

  if (pastMessages && pastMessages.length > 0) {
    for (const msg of pastMessages) {
      history.push({
        role: msg.direction === 'inbound' ? 'user' : 'assistant',
        content: msg.content,
      });
    }
    console.log(`[claw-agent] Loaded ${history.length} messages from history`);
  }

  let responding = false;

  const channel: RealtimeChannel = supabase
    .channel(`agent:${agentId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `agent_id=eq.${agentId}` },
      async (event) => {
      const row = event.new as { direction: string; content: string; id: string };
      if (row.direction !== 'inbound') return;
      if (responding) return;

      const userMessage = row.content;
      console.log(`[user] ${userMessage}`);
      responding = true;

      try {
        history.push({ role: 'user', content: userMessage });

        // Agentic loop — keep going until no more tool calls
        let inputTokens = 0;
        let outputTokens = 0;
        let finalReply = '';

        const messages = history.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : m.content,
        })) as Anthropic.Messages.MessageParam[];

        while (true) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            tools: TOOLS,
            messages,
          });

          inputTokens += response.usage.input_tokens;
          outputTokens += response.usage.output_tokens;

          if (response.stop_reason === 'tool_use') {
            // Add assistant message with tool calls
            messages.push({ role: 'assistant', content: response.content });

            // Execute each tool and collect results
            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
            for (const block of response.content) {
              if (block.type === 'tool_use') {
                console.log(`[tool] ${block.name}(${JSON.stringify(block.input)})`);
                const result = executeTool(block.name, block.input);
                console.log(`[tool result] ${result.slice(0, 100)}${result.length > 100 ? '…' : ''}`);
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: result,
                });
              }
            }

            messages.push({ role: 'user', content: toolResults });
            continue;
          }

          // Done — extract text reply
          finalReply = response.content
            .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
            .map((b: Anthropic.Messages.TextBlock) => b.text)
            .join('');
          break;
        }

        history.push({ role: 'assistant', content: finalReply });

        // Broadcast back to app
        await channel.send({
          type: 'broadcast',
          event: 'message',
          payload: { direction: 'outbound', content: finalReply, ts: Date.now() },
        });

        // Persist to DB
        await supabase.from('messages').insert({
          agent_id: agentId,
          user_id: userId,
          direction: 'outbound',
          content: finalReply,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        });

        // Forward to Telegram if connected
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/telegram-send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
            body: JSON.stringify({ agentId, userId, text: finalReply }),
          });
        } catch {}

        console.log(`[agent] ${finalReply}`);
      } catch (err: any) {
        console.error('[claw-agent] Error:', err.message);
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
    } catch {}
    process.exit(0);
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);
}
