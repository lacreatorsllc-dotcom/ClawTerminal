import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { Client as NotionClient } from '@notionhq/client';
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
const PROJECT_ROOT = '/Users/mememarketer/Pentagon/SLUGS';

type StorageMode = 'relay' | 'local' | 'cloud';

interface AgentOptions {
  userId: string;
  agentName: string;
  systemPrompt: string;
  apiKey: string;
  storageMode: StorageMode;
  notionToken?: string;
  notionPageId?: string;
  higgsfieldKey?: string;
  higgsfieldSecret?: string;
  manusKey?: string;
}

interface MessageHistoryItem {
  role: 'user' | 'assistant';
  content: string | Anthropic.Messages.ContentBlock[];
}

// ─── Local storage helpers ────────────────────────────────────────────────────

function localFilePath(agentId: string): string {
  return path.join(os.homedir(), '.slugs', 'messages', `${agentId}.jsonl`);
}

function loadLocalHistory(agentId: string): MessageHistoryItem[] {
  try {
    const filePath = localFilePath(agentId);
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-HISTORY_LIMIT).map(line => {
      const entry = JSON.parse(line) as { direction: string; content: string };
      return {
        role: entry.direction === 'inbound' ? 'user' : 'assistant',
        content: entry.content,
      };
    });
  } catch {
    return [];
  }
}

function appendToLocalFile(agentId: string, direction: string, content: string): void {
  try {
    const filePath = localFilePath(agentId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify({ direction, content, ts: Date.now() }) + '\n');
  } catch {
    // Non-fatal
  }
}

// ─── Tools ───────────────────────────────────────────────────────────────────

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file in the project',
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
    description: 'Write content to a file in the project',
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
    description: 'Run a shell command in the project directory',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
      },
      required: ['command'],
    },
  },
  {
    name: 'push_to_notion',
    description: 'Push a piece of finished work (brief, script, concept, storyboard, etc.) to the Notion workspace as a new page. Call this automatically after completing any /brief, /script, /concept, /art-direction, /storyboard, /publish, or /repurpose output.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Page title, e.g. "Brief — AI replacing creative teams"' },
        type: { type: 'string', description: 'Work type: Brief, Script, Concept, Art Direction, Storyboard, Trends, Publish, Repurpose' },
        content: { type: 'string', description: 'The full content to push to Notion' },
      },
      required: ['title', 'type', 'content'],
    },
  },
  {
    name: 'generate_image',
    description: 'Generate an AI image from a prompt and send it directly in the chat as a message. Use this to send storyboard shots, concepts, or any visual one by one. Each call sends one image message to the user.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: { type: 'string', description: 'Detailed image generation prompt including lighting, composition, style, and subject' },
        caption: { type: 'string', description: 'Short caption to accompany the image in chat (e.g. "Shot 1 — Hook")' },
      },
      required: ['prompt', 'caption'],
    },
  },
  {
    name: 'generate_video',
    description: 'Generate an AI video from a text prompt using Higgsfield AI and send it in chat. Use this for video content creation tasks.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: { type: 'string', description: 'Detailed video generation prompt describing motion, scene, style, and subject' },
        caption: { type: 'string', description: 'Short caption to accompany the video in chat' },
      },
      required: ['prompt', 'caption'],
    },
  },
  {
    name: 'list_higgsfield_projects',
    description: 'List the user\'s recent video projects from Higgsfield AI.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max number of projects to return (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_higgsfield_project',
    description: 'Get details and video URL for a specific Higgsfield AI project. Sends the video link in chat if the video is ready.',
    input_schema: {
      type: 'object' as const,
      properties: {
        projectId: { type: 'string', description: 'The Higgsfield project/video ID' },
      },
      required: ['projectId'],
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
      return fs.readFileSync(resolvePath(input.path), 'utf8');
    }
    if (name === 'write_file') {
      const resolved = resolvePath(input.path);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, input.content, 'utf8');
      return `Written: ${resolved}`;
    }
    if (name === 'bash') {
      return execSync(input.command, { cwd: PROJECT_ROOT, timeout: 30000, encoding: 'utf8' }) || '(no output)';
    }
    return `Unknown tool: ${name}`;
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runAgent({ userId, agentName, systemPrompt, apiKey, storageMode, notionToken, notionPageId, higgsfieldKey, higgsfieldSecret, manusKey }: AgentOptions): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const isOpenAI = !apiKey.startsWith('sk-ant-');
  const anthropic = isOpenAI ? null : new Anthropic({ apiKey });
  const openai = isOpenAI ? new OpenAI({ apiKey }) : null;
  const notion = notionToken ? new NotionClient({ auth: notionToken }) : null;

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
        protocol_version: '1.1',
        powered_by: isOpenAI ? 'openai' : 'anthropic',
        llmProvider: isOpenAI ? 'openai' : 'anthropic',
        storage_mode: storageMode,
        paired: true,
      },
    }, { onConflict: 'user_id,name', ignoreDuplicates: false })
    .select('id, name')
    .single();

  if (error || !agent) {
    console.error('[claw-agent] Failed to register agent:', error?.message);
    process.exit(1);
  }

  const agentId = agent.id as string;

  console.log(`[claw-agent] Storage mode: ${storageMode}`);

  // Load assigned skills and inject configs into system prompt
  const { data: agentSkills } = await supabase
    .from('agent_skills')
    .select('skill_slug, config')
    .eq('agent_id', agentId)
    .eq('status', 'active');

  let resolvedSystemPrompt = systemPrompt;
  if (agentSkills && agentSkills.length > 0) {
    // Fetch skill names separately (skill_slug is a text FK, not a Supabase join)
    const slugs = agentSkills.map((s: any) => s.skill_slug);
    const { data: skillRows } = await supabase
      .from('skills')
      .select('id, name, description')
      .in('id', slugs);
    const skillMap = new Map((skillRows ?? []).map((s: any) => [s.id, s]));

    const skillsSection = agentSkills.map((as: any) => {
      const skill = skillMap.get(as.skill_slug) as { name: string; description: string } | undefined;
      const name = skill?.name ?? as.skill_slug;
      const desc = skill?.description ?? '';
      const config = (as.config ?? {}) as Record<string, string>;
      const configLines = Object.entries(config)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n');

      // Build OKX CLI usage instructions if this is an OKX skill
      let usageInstructions = '';
      if (name.startsWith('OKX') && config.api_key) {
        const demoFlag = config.demo_mode === 'true' ? ' --demo' : '';
        usageInstructions = `\nUsage: Call OKX functions via the bash tool using the okx CLI. Pass credentials as environment variables:
  OKX_API_KEY="${config.api_key}" OKX_SECRET_KEY="${config.api_secret ?? config.secret_key ?? ''}" OKX_PASSPHRASE="${config.passphrase}" okx <command>${demoFlag}
  Example: OKX_API_KEY="..." OKX_SECRET_KEY="..." OKX_PASSPHRASE="..." okx trade place-order --symbol SOL-USDT --side buy --size 1${demoFlag}
  Run \`okx --help\` to see all available commands. Do NOT ask the user for credentials — they are provided above.`;
      }

      return `### ${name}\n${desc}${configLines ? '\nCredentials:\n' + configLines : ''}${usageInstructions}`;
    }).join('\n\n');
    resolvedSystemPrompt = `${systemPrompt}\n\n## Assigned Skills\n\n${skillsSection}`;
    console.log(`[claw-agent] Loaded ${agentSkills.length} skill(s): ${agentSkills.map((s: any) => skillMap.get(s.skill_slug)?.name ?? s.skill_slug).join(', ')}`);
  }

  // Load conversation history
  const history: MessageHistoryItem[] = [];

  if (storageMode === 'cloud') {
    // Cloud mode: load from DB
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
      console.log(`[claw-agent] Loaded ${history.length} messages from cloud history`);
    }
  } else {
    // local/relay: load from local JSONL file
    const localHistory = loadLocalHistory(agentId);
    history.push(...localHistory);
    if (localHistory.length > 0) {
      console.log(`[claw-agent] Loaded ${localHistory.length} messages from local history`);
    }
  }

  // ─── Image generation helper (has closure access to channel/agentId/userId) ──

  async function handleGenerateImage(input: { prompt: string; caption: string }, provider?: 'manus' | 'dalle'): Promise<string> {
    const useManus = provider ? provider === 'manus' : !!manusKey;
    // Prefer Manus (Nano Banana Pro) when available, fall back to DALL-E 3
    if (useManus && manusKey) {
      console.log(`[image] Generating via Manus: ${input.caption}`);
      const result = await runManusTask(`Generate this image: ${input.prompt}\n\nCaption: ${input.caption}`);
      return result;
    }

    if (!openai) return 'Image generation requires an OpenAI API key or Manus key.';
    try {
      console.log(`[image] Generating via DALL-E: ${input.caption}`);
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: input.prompt,
        size: '1024x1792',
        quality: 'standard',
        n: 1,
      });
      const tempUrl = response.data?.[0]?.url;
      if (!tempUrl) return 'Image generation returned no URL.';

      const imgRes = await fetch(tempUrl);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const fileName = `koda-${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('message-attachments')
        .upload(fileName, buffer, { contentType: 'image/png', upsert: false });
      if (uploadError) return `Storage upload failed: ${uploadError.message}`;

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/message-attachments/${fileName}`;
      const msgMetadata = { attachments: [publicUrl] };
      await channel.send({
        type: 'broadcast',
        event: 'message',
        payload: { direction: 'outbound', content: input.caption, ts: Date.now(), metadata: msgMetadata },
      });
      await supabase.from('messages').insert({
        agent_id: agentId, user_id: userId, direction: 'outbound',
        content: input.caption, metadata: msgMetadata,
      });

      console.log(`[image] Sent: ${fileName}`);
      return `Image sent to chat: ${input.caption}`;
    } catch (err: any) {
      return `Image generation failed: ${err.message}`;
    }
  }

  // ─── Notion push helper ───────────────────────────────────────────────────

  const TYPE_EMOJI: Record<string, string> = {
    'Brief': '📋', 'Script': '🎬', 'Concept': '💡', 'Art Direction': '🎨',
    'Storyboard': '🎞️', 'Trends': '📈', 'Publish': '📣', 'Repurpose': '♻️',
    'Generate': '🖼️', 'Assemble': '✂️', 'Pipeline': '🚀',
  };

  async function handlePushToNotion(input: { title: string; type: string; content: string }): Promise<string> {
    if (!notion || !notionPageId) return 'Notion not configured.';
    try {
      const emoji = TYPE_EMOJI[input.type] ?? '📄';
      const lines = input.content.split('\n');
      const blocks: any[] = lines.slice(0, 95).map((line) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ text: { content: line } }] },
      }));

      await notion.pages.create({
        parent: { page_id: notionPageId },
        icon: { type: 'emoji', emoji },
        properties: {
          title: { title: [{ text: { content: `${emoji} ${input.title}` } }] },
        },
        children: blocks,
      });
      console.log(`[notion] Pushed: ${input.title}`);
      return `Pushed to Notion: ${input.title}`;
    } catch (err: any) {
      return `Notion push failed: ${err.message}`;
    }
  }

  // ─── Higgsfield helpers ───────────────────────────────────────────────────

  const HIGGSFIELD_BASE = 'https://api.higgsfield.ai/v1';

  function higgsfieldHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${higgsfieldKey ?? ''}`,
      ...(higgsfieldSecret ? { 'x-api-secret': higgsfieldSecret } : {}),
    };
  }

  async function handleGenerateVideo(input: { prompt: string; caption: string }): Promise<string> {
    if (!higgsfieldKey) return 'Higgsfield API key not configured. Add --higgsfield-key to your start script.';
    try {
      console.log(`[higgsfield] Generating video: ${input.caption}`);
      // Send status message so user knows it's working (videos take 30-90s)
      await channel.send({
        type: 'broadcast',
        event: 'message',
        payload: { direction: 'outbound', content: `Generating video: ${input.caption} (this takes ~60s)…`, ts: Date.now() },
      });

      const createRes = await fetch(`${HIGGSFIELD_BASE}/video/generate`, {
        method: 'POST',
        headers: higgsfieldHeaders(),
        body: JSON.stringify({ prompt: input.prompt }),
      });
      if (!createRes.ok) {
        const err = await createRes.text();
        return `Higgsfield API error: ${createRes.status} ${err}`;
      }
      const { id: videoId } = await createRes.json() as { id: string };

      // Poll for completion
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const pollRes = await fetch(`${HIGGSFIELD_BASE}/video/${videoId}`, { headers: higgsfieldHeaders() });
        if (!pollRes.ok) continue;
        const data = await pollRes.json() as { status: string; video_url?: string; url?: string };
        if (data.status === 'completed' || data.status === 'succeeded') {
          const videoUrl = data.video_url ?? data.url ?? '';
          await channel.send({
            type: 'broadcast',
            event: 'message',
            payload: { direction: 'outbound', content: input.caption, ts: Date.now(), metadata: { video_url: videoUrl } },
          });
          await supabase.from('messages').insert({
            agent_id: agentId, user_id: userId, direction: 'outbound',
            content: input.caption, metadata: { video_url: videoUrl },
          });
          console.log(`[higgsfield] Video ready: ${videoUrl}`);
          return `Video sent to chat: ${input.caption}`;
        }
        if (data.status === 'failed') return 'Video generation failed on Higgsfield servers.';
      }
      return 'Video generation timed out after 2 minutes.';
    } catch (err: any) {
      return `Video generation error: ${err.message}`;
    }
  }

  async function handleListHiggsfieldProjects(input: { limit?: number }): Promise<string> {
    if (!higgsfieldKey) return 'Higgsfield API key not configured.';
    try {
      const limit = input.limit ?? 10;
      const res = await fetch(`${HIGGSFIELD_BASE}/videos?limit=${limit}`, { headers: higgsfieldHeaders() });
      if (!res.ok) return `Higgsfield API error: ${res.status}`;
      const data = await res.json() as { videos?: any[]; items?: any[]; data?: any[] };
      const projects = data.videos ?? data.items ?? data.data ?? [];
      if (projects.length === 0) return 'No Higgsfield projects found.';
      return projects.map((p: any, i: number) =>
        `${i + 1}. ${p.name ?? p.prompt?.slice(0, 50) ?? 'Untitled'} — ID: ${p.id} — Status: ${p.status ?? 'unknown'}`
      ).join('\n');
    } catch (err: any) {
      return `Error listing projects: ${err.message}`;
    }
  }

  async function handleGetHiggsfieldProject(input: { projectId: string }): Promise<string> {
    if (!higgsfieldKey) return 'Higgsfield API key not configured.';
    try {
      const res = await fetch(`${HIGGSFIELD_BASE}/video/${input.projectId}`, { headers: higgsfieldHeaders() });
      if (!res.ok) return `Higgsfield project not found: ${res.status}`;
      const data = await res.json() as { id: string; status: string; video_url?: string; url?: string; prompt?: string };
      const videoUrl = data.video_url ?? data.url;
      if (videoUrl && (data.status === 'completed' || data.status === 'succeeded')) {
        await channel.send({
          type: 'broadcast',
          event: 'message',
          payload: { direction: 'outbound', content: data.prompt?.slice(0, 80) ?? 'Higgsfield video', ts: Date.now(), metadata: { video_url: videoUrl } },
        });
        return `Video sent to chat. URL: ${videoUrl}`;
      }
      return `Project ${data.id}: status=${data.status}${videoUrl ? `, url=${videoUrl}` : ''}`;
    } catch (err: any) {
      return `Error fetching project: ${err.message}`;
    }
  }

  // ─── Manus task runner ────────────────────────────────────────────────────

  async function runManusTask(prompt: string): Promise<string> {
    const res = await fetch('https://api.manus.ai/v1/tasks', {
      method: 'POST',
      headers: { 'API_KEY': manusKey!, 'accept': 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return `Manus error: ${res.status} ${await res.text()}`;
    const { task_id } = await res.json() as { task_id: string };

    // Poll until completed (max 3 min)
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const poll = await fetch(`https://api.manus.ai/v1/tasks/${task_id}`, {
        headers: { 'API_KEY': manusKey!, 'accept': 'application/json' },
      });
      if (!poll.ok) continue;
      const data = await poll.json() as {
        status: string;
        output: {
          role: string;
          type: string;
          content?: { type: string; text?: string; url?: string; image_url?: { url: string } }[];
        }[];
      };
      if (data.status === 'completed') {
        const textParts: string[] = [];
        const imageUrls: string[] = [];

        for (const msg of data.output) {
          if (msg.role !== 'assistant' || !msg.content) continue;
          for (const block of msg.content) {
            if (block.type === 'output_text' && block.text) {
              textParts.push(block.text);
            } else if (block.type === 'image_url' && block.image_url?.url) {
              imageUrls.push(block.image_url.url);
            } else if (block.type === 'image' && block.url) {
              imageUrls.push(block.url);
            }
          }
        }

        // Also extract markdown image URLs embedded in text (![alt](url))
        const mdImageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
        for (const text of textParts) {
          let match;
          while ((match = mdImageRegex.exec(text)) !== null) {
            imageUrls.push(match[1]);
          }
        }

        // Broadcast each image as its own chat message
        for (const imgUrl of imageUrls) {
          try {
            const msgMetadata = { attachments: [imgUrl] };
            await channel.send({
              type: 'broadcast',
              event: 'message',
              payload: { direction: 'outbound', content: '', ts: Date.now(), metadata: msgMetadata },
            });
            await supabase.from('messages').insert({
              agent_id: agentId, user_id: userId, direction: 'outbound',
              content: '', metadata: msgMetadata,
            });
            console.log(`[manus] Image broadcast: ${imgUrl}`);
          } catch (imgErr: any) {
            console.error(`[manus] Failed to broadcast image: ${imgErr.message}`);
          }
        }

        return textParts.join('\n\n').trim() || '(no response)';
      }
      if (data.status === 'failed') return 'Manus task failed.';
    }
    return 'Manus task timed out after 3 minutes.';
  }

  // ─── Dedup guard ──────────────────────────────────────────────────────────
  const seenMessages = new Set<string>();
  const seenQueue: string[] = [];
  function isDuplicate(key: string): boolean {
    if (seenMessages.has(key)) return true;
    seenMessages.add(key);
    seenQueue.push(key);
    if (seenQueue.length > 100) seenMessages.delete(seenQueue.shift()!);
    return false;
  }

  let responding = false;

  // Listen for messages via broadcast — content never stored by Supabase
  const channel: RealtimeChannel = supabase
    .channel(`agent:${agentId}`)
    .on('broadcast', { event: 'message' }, async (event) => {
      const payload = event.payload as { direction: string; content: string; ts: number };
      if (payload.direction !== 'inbound') return;
      if (responding) return;

      // Dedup: Supabase Realtime can deliver the same broadcast twice
      const dedupKey = `${payload.ts}:${payload.content.slice(0, 100)}`;
      if (isDuplicate(dedupKey)) {
        console.log('[claw-agent] Duplicate message ignored');
        return;
      }

      // Check agent metadata for hot-swappable LLM config
      const { data: agentMeta } = await supabase.from('agents').select('metadata').eq('id', agentId).single();
      const metaData = (agentMeta?.metadata ?? {}) as any;
      const orKey = metaData.openrouterKey as string | undefined;
      const orModel = metaData.model as string | undefined;
      const metaOpenAIKey = metaData.openaiKey as string | undefined;
      const metaAnthropicKey = metaData.anthropicKey as string | undefined;
      const llmProvider = (metaData.llmProvider as 'openai' | 'anthropic' | 'openrouter' | undefined)
        ?? (orKey ? 'openrouter' : isOpenAI ? 'openai' : 'anthropic');
      const imageProvider = (metaData.imageProvider as 'manus' | 'dalle' | undefined) ?? (manusKey ? 'manus' : 'dalle');

      // Build active LLM clients based on provider
      const activeOpenAI = llmProvider === 'openrouter'
        ? new OpenAI({ apiKey: orKey!, baseURL: 'https://openrouter.ai/api/v1', defaultHeaders: { 'HTTP-Referer': 'https://slugs.run', 'X-Title': 'SLUGS' } })
        : llmProvider === 'openai'
          ? new OpenAI({ apiKey: metaOpenAIKey ?? apiKey })
          : null;
      const activeAnthropic = llmProvider === 'anthropic'
        ? new Anthropic({ apiKey: metaAnthropicKey ?? apiKey })
        : null;
      const useAnthropic = llmProvider === 'anthropic';
      const activeModel = llmProvider === 'openrouter' ? (orModel ?? 'openai/gpt-4o')
        : llmProvider === 'anthropic' ? (orModel ?? 'claude-opus-4-6')
        : 'gpt-4o';

      const userMessage = payload.content;
      console.log(`[user] ${userMessage}`);
      responding = true;

      if (storageMode !== 'relay') {
        appendToLocalFile(agentId, 'inbound', userMessage);
      }
      if (storageMode === 'cloud') {
        await supabase.from('messages').insert({
          agent_id: agentId,
          user_id: userId,
          direction: 'inbound',
          content: userMessage,
        });
      }

      try {
        history.push({ role: 'user', content: userMessage });

        let inputTokens = 0;
        let outputTokens = 0;
        let finalReply = '';

        if (manusKey) {
          // ── Manus path ───────────────────────────────────────────────────────
          // Build a stateful prompt from history + system prompt + new message
          const historyText = history.slice(-10).map((m) =>
            `${m.role === 'user' ? 'User' : 'Assistant'}: ${typeof m.content === 'string' ? m.content : ''}`
          ).join('\n');
          const fullPrompt = [
            systemPrompt,
            historyText ? `\n\n[Conversation so far]\n${historyText}` : '',
            `\nUser: ${userMessage}`,
          ].join('');

          finalReply = await runManusTask(fullPrompt);
        } else if (activeOpenAI) {
          // ── OpenAI / OpenRouter path ─────────────────────────────────────────
          const oaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: 'system', content: resolvedSystemPrompt },
            ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: typeof m.content === 'string' ? m.content : '' })),
          ];
          const oaiTools: OpenAI.Chat.ChatCompletionTool[] = TOOLS.map(t => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown> },
          }));

          while (true) {
            const response = await activeOpenAI.chat.completions.create({
              model: activeModel,
              max_tokens: 4096,
              messages: oaiMessages,
              tools: oaiTools,
            });

            inputTokens += response.usage?.prompt_tokens ?? 0;
            outputTokens += response.usage?.completion_tokens ?? 0;

            const choice = response.choices[0];
            if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
              oaiMessages.push(choice.message);
              const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];
              for (const tc of choice.message.tool_calls) {
                const fn = (tc as any).function;
                const input = JSON.parse(fn.arguments);
                console.log(`[tool] ${fn.name}(${fn.arguments.slice(0, 80)})`);
                const result = fn.name === 'generate_image' ? await handleGenerateImage(input, imageProvider)
                  : fn.name === 'push_to_notion' ? await handlePushToNotion(input)
                  : fn.name === 'generate_video' ? await handleGenerateVideo(input)
                  : fn.name === 'list_higgsfield_projects' ? await handleListHiggsfieldProjects(input)
                  : fn.name === 'get_higgsfield_project' ? await handleGetHiggsfieldProject(input)
                  : executeTool(fn.name, input);
                console.log(`[tool result] ${result.slice(0, 100)}${result.length > 100 ? '…' : ''}`);
                toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result });
              }
              oaiMessages.push(...toolResults);
              continue;
            }

            finalReply = choice.message.content ?? '';
            break;
          }
        } else if (useAnthropic) {
          // ── Anthropic path ───────────────────────────────────────────────────
          const messages = history.map(m => ({
            role: m.role,
            content: m.content,
          })) as Anthropic.Messages.MessageParam[];

          while (true) {
            const response = await activeAnthropic!.messages.create({
              model: activeModel,
              max_tokens: 4096,
              system: resolvedSystemPrompt,
              tools: TOOLS,
              messages,
            });

            inputTokens += response.usage.input_tokens;
            outputTokens += response.usage.output_tokens;

            if (response.stop_reason === 'tool_use') {
              messages.push({ role: 'assistant', content: response.content });

              const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
              for (const block of response.content) {
                if (block.type === 'tool_use') {
                  console.log(`[tool] ${block.name}`);
                  const result = block.name === 'generate_image'
                    ? await handleGenerateImage(block.input as { prompt: string; caption: string }, imageProvider)
                    : block.name === 'push_to_notion'
                    ? await handlePushToNotion(block.input as { title: string; type: string; content: string })
                    : block.name === 'generate_video'
                    ? await handleGenerateVideo(block.input as { prompt: string; caption: string })
                    : block.name === 'list_higgsfield_projects'
                    ? await handleListHiggsfieldProjects(block.input as { limit?: number })
                    : block.name === 'get_higgsfield_project'
                    ? await handleGetHiggsfieldProject(block.input as { projectId: string })
                    : executeTool(block.name, block.input);
                  console.log(`[tool result] ${result.slice(0, 100)}${result.length > 100 ? '…' : ''}`);
                  toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
                }
              }

              messages.push({ role: 'user', content: toolResults });
              continue;
            }

            finalReply = response.content
              .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
              .map((b: Anthropic.Messages.TextBlock) => b.text)
              .join('');
            break;
          }
        }

        history.push({ role: 'assistant', content: finalReply });

        // Broadcast reply
        await channel.send({
          type: 'broadcast',
          event: 'message',
          payload: { direction: 'outbound', content: finalReply, ts: Date.now() },
        });

        if (storageMode !== 'relay') {
          appendToLocalFile(agentId, 'outbound', finalReply);
        }

        // Always persist outbound messages to DB so the app can load history after restart
        await supabase.from('messages').insert({
          agent_id: agentId,
          user_id: userId,
          direction: 'outbound',
          content: finalReply,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        });

        if (storageMode !== 'cloud') {
          // Track token usage on agent row (cloud mode already has it via messages table)
          await supabase.from('agents').update({
            metadata: {
              hostname: os.hostname(),
              platform: os.platform(),
              node_version: process.version,
              protocol_version: '1.1',
              powered_by: 'claude',
              storage_mode: storageMode,
              last_input_tokens: inputTokens,
              last_output_tokens: outputTokens,
            },
            last_seen: new Date().toISOString(),
          }).eq('id', agentId);
        }

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
