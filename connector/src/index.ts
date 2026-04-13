#!/usr/bin/env node

import { Command } from 'commander';
import { connect } from './connect';
import { runAgent } from './agent';

const program = new Command();

program
  .name('claw-connector')
  .description('Bridge a local AI agent to the ClawTerminal mobile app via Supabase')
  .version('0.1.0');

program
  .command('connect')
  .description('Connect this agent to the ClawTerminal mobile app')
  .requiredOption('--token <token>', 'Your user ID token from the ClawTerminal app')
  .option('--name <name>', 'A display name for this agent', 'Local Agent')
  .action(async (options: { token: string; name: string }) => {
    await connect({ userId: options.token, agentName: options.name });
  });

program
  .command('agent')
  .description('Run a Claude or OpenAI-powered AI agent connected to the ClawTerminal app')
  .requiredOption('--token <token>', 'Your user ID token from the ClawTerminal app')
  .option('--name <name>', 'A display name for this agent', 'Claude')
  .option('--system <prompt>', 'System prompt for the agent', 'You are a helpful AI assistant connected to the ClawTerminal app.')
  .requiredOption('--api-key <key>', 'Anthropic or OpenAI API key')
  .option('--storage <mode>', 'Storage mode: relay | local | cloud', 'local')
  .option('--notion-token <token>', 'Notion API token (optional)')
  .option('--notion-page <id>', 'Notion page ID (optional)')
  .option('--higgsfield-key <key>', 'Higgsfield API key (optional)')
  .option('--higgsfield-secret <secret>', 'Higgsfield API secret (optional)')
  .option('--manus-key <key>', 'Manus API key (optional)')
  .action(async (options: { token: string; name: string; system: string; apiKey: string; storage: string; notionToken?: string; notionPage?: string; higgsfieldKey?: string; higgsfieldSecret?: string; manusKey?: string }) => {
    await runAgent({
      userId: options.token,
      agentName: options.name,
      systemPrompt: options.system,
      apiKey: options.apiKey,
      storageMode: (options.storage as 'relay' | 'local' | 'cloud') ?? 'local',
      notionToken: options.notionToken,
      notionPageId: options.notionPage,
      higgsfieldKey: options.higgsfieldKey,
      higgsfieldSecret: options.higgsfieldSecret,
      manusKey: options.manusKey,
    });
  });

program.parse(process.argv);
