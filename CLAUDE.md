# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Project Rules

## Mission
Build a beautifully designed, production-minded mobile MVP with strong UX, clean architecture, and efficient token usage.

## Context Rules
- Prefer reading the smallest relevant set of files.
- Do not load or summarize the whole repo unless explicitly needed.
- Treat docs/core as stable truth.
- Treat docs/dynamic as current working state.
- Use docs/handoffs instead of reusing full conversation history.
- Do not restate large prior context unless necessary.

## Agent Routing
- Use specialized subagents when the task clearly matches their role.
- Keep implementation, debugging, and review work out of the main thread when possible.
- Use skills for repeatable workflows and one-off utilities.

## Cost Rules
- Try haiku first for simple tasks, summaries, file reads, formatting, task breakdowns, and straightforward edits.
- Use sonnet for most implementation work.
- Escalate to opus only for unusually hard architecture, complex cross-system debugging, or major product tradeoffs.
- Avoid agent teams unless parallel independent work clearly justifies the cost.
- Prefer one batched request over many tiny iterative requests.
- Run /compact when context grows and preserve only the important decisions.
- Avoid loading large logs, screenshots, generated files, dist folders, or lockfiles unless relevant.

## Compact Instructions
When compacting, preserve:
- current feature goal
- decisions made
- files changed
- blockers
- next best step
Do not preserve:
- repeated brainstorming
- duplicate tool outputs
- irrelevant exploration
