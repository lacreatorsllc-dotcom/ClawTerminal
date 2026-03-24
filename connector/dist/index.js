#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const connect_1 = require("./connect");
const program = new commander_1.Command();
program
    .name('claw-connector')
    .description('Bridge a local AI agent to the ClawTerminal mobile app via Supabase')
    .version('0.1.0');
program
    .command('connect')
    .description('Connect this agent to the ClawTerminal mobile app')
    .requiredOption('--token <token>', 'Your user ID token from the ClawTerminal app')
    .option('--name <name>', 'A display name for this agent', 'Local Agent')
    .action(async (options) => {
    await (0, connect_1.connect)({ userId: options.token, agentName: options.name });
});
program.parse(process.argv);
//# sourceMappingURL=index.js.map