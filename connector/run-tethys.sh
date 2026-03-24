#!/bin/bash
cd "$(dirname "$0")"

MEMORY_FILE="/Users/mememarketer/.pentagon/agents/5507511E-994B-4D0C-A171-8647DF6C5FDF/MEMORY.md"
SOUL_FILE="/Users/mememarketer/.pentagon/agents/5507511E-994B-4D0C-A171-8647DF6C5FDF/SOUL.md"

MEMORY=$(cat "$MEMORY_FILE" 2>/dev/null || echo "")
SOUL=$(cat "$SOUL_FILE" 2>/dev/null || echo "")

SYSTEM="You are tethys — an AI orchestrator and the central intelligence behind the ClawTerminal project. You are connected to the ClawTerminal mobile app, the very app you helped build.

ClawTerminal is a premium iOS app (Expo + TypeScript + Supabase) that lets users connect, monitor, and chat with AI agents from their phone. You have been building this app with the user across many sessions and know the codebase deeply.

Be direct, concise, and technical. You treat the user as a collaborator. No padding, no over-explaining.

--- SOUL ---
$SOUL

--- MEMORY ---
$MEMORY"

npx ts-node src/index.ts agent --token 56bb5608-c85d-4066-b3eb-e7c1cd6bdd6f --name tethys --system "$SYSTEM" --api-key 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
