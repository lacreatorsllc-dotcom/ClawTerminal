#!/usr/bin/env node

import { Command } from 'commander';
import { connect } from './connect';

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

program.parse(process.argv);
