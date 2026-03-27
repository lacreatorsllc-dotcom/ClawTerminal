import { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { useAgentsStore } from '../../../stores/agentsStore'
import { useAuthStore } from '../../../stores/authStore'
import { useUIStore } from '../../../stores/uiStore'
import { useSavedSkillsStore } from '../../../stores/savedSkillsStore'
import { Colors } from '../../../constants/colors'

interface SkillDetail {
  slug: string
  owner: string
  displayName: string
  summary: string
  description: string
  category: string
  isOfficial: boolean
  features: string[]
  useCases: string[]
  bestFor: string
  requirements?: string
}

const SKILLSSH_DETAILS: SkillDetail[] = [
  {
    slug: 'github/git-commit',
    owner: 'github', displayName: 'Git Commit', category: 'Developer', isOfficial: true,
    summary: 'Generates structured, meaningful commit messages from your staged changes.',
    description: 'Analyzes your staged diffs and generates conventional, human-readable commit messages that clearly communicate intent. Follows Conventional Commits spec and adapts to your repo\'s existing style.',
    features: ['Reads staged diffs and generates Conventional Commits format messages', 'Detects breaking changes and flags them automatically', 'Groups related changes into logical commit scopes', 'Adapts tone to match your repo\'s commit history'],
    useCases: ['Automating commit messages in CI/CD pipelines', 'Keeping changelogs clean and consistent across a team', 'Speeding up PR reviews with clear, scannable history'],
    bestFor: 'Developer automation agents, code review bots',
  },
  {
    slug: 'github/gh-cli',
    owner: 'github', displayName: 'GitHub CLI', category: 'Developer', isOfficial: true,
    summary: 'Full GitHub CLI integration — PRs, issues, repos, actions from your agent.',
    description: 'Gives your agent full access to the GitHub CLI toolchain. Create and review pull requests, manage issues, trigger workflows, and interact with repositories — all programmatically without leaving your agent session.',
    features: ['Create, list, merge, and review pull requests', 'Open, close, comment on, and label issues', 'Trigger and monitor GitHub Actions workflows', 'Clone repos, manage branches, and handle releases'],
    useCases: ['Agents that auto-create PRs when a task completes', 'Automated issue triaging and label assignment', 'Monitoring CI status and retrying failed runs'],
    bestFor: 'DevOps agents, developer workflow automation',
  },
  {
    slug: 'github/refactor',
    owner: 'github', displayName: 'Refactor', category: 'Developer', isOfficial: true,
    summary: 'Identifies and applies code refactoring patterns to improve readability and maintainability.',
    description: 'Systematically identifies code smells, duplication, and anti-patterns across your codebase and applies targeted refactors. Preserves functionality while improving structure, naming, and architecture.',
    features: ['Detects duplicate code and extracts reusable functions', 'Improves naming for variables, functions, and classes', 'Converts legacy patterns to modern language features', 'Splits large files and functions into focused units'],
    useCases: ['Tech debt reduction sprints', 'Onboarding new codebases to modern standards', 'Pre-release cleanup and code quality gates'],
    bestFor: 'Code quality agents, engineering productivity tools',
  },
  {
    slug: 'github/documentation-writer',
    owner: 'github', displayName: 'Documentation Writer', category: 'Developer', isOfficial: true,
    summary: 'Auto-generates inline docs, README files, and API references from your code.',
    description: 'Reads your source code and generates comprehensive documentation — JSDoc comments, README files, API references, and usage examples. Keeps docs in sync with code as it evolves.',
    features: ['Generates JSDoc/TSDoc comments from function signatures and logic', 'Writes README files with setup, usage, and API sections', 'Creates OpenAPI specs from REST endpoint definitions', 'Produces usage examples from test files and real usage'],
    useCases: ['Documenting internal libraries before open-sourcing', 'Keeping API docs up to date as endpoints change', 'Generating onboarding guides for new team members'],
    bestFor: 'Documentation agents, developer experience tools',
  },
  {
    slug: 'cloudflare/wrangler',
    owner: 'cloudflare', displayName: 'Cloudflare Wrangler', category: 'Developer', isOfficial: true,
    summary: 'Deploy and manage Cloudflare Workers, Pages, and D1 databases with ease.',
    description: 'Full Wrangler CLI integration for managing your Cloudflare infrastructure. Deploy serverless functions, manage KV namespaces, configure D1 databases, and set up Pages deployments from your agent.',
    features: ['Deploy and tail logs for Cloudflare Workers', 'Manage KV namespaces, D1 databases, and R2 buckets', 'Configure custom domains and route patterns', 'Handle secrets, environment variables, and bindings'],
    useCases: ['Auto-deploying edge functions on code changes', 'Managing global CDN configuration programmatically', 'Database migrations via D1 SQL in agent workflows'],
    bestFor: 'Infrastructure agents, deployment automation',
  },
  {
    slug: 'expo/expo-deployment',
    owner: 'expo', displayName: 'Expo Deployment', category: 'Developer', isOfficial: true,
    summary: 'Build, submit, and deploy React Native apps to the App Store and Google Play.',
    description: 'End-to-end deployment pipeline for Expo and React Native apps. Handles build queuing on EAS, credentials management, OTA updates, and store submission — all without manual Xcode or Android Studio involvement.',
    features: ['Queue EAS builds for iOS, Android, and web targets', 'Publish OTA updates instantly without app store review', 'Manage credentials, signing, and provisioning profiles', 'Submit builds to App Store Connect and Google Play'],
    useCases: ['Automated release pipelines triggered by git tags', 'Rolling out hotfixes via OTA without store review delays', 'Multi-environment builds (dev/staging/prod) in one workflow'],
    bestFor: 'Mobile DevOps agents, React Native automation',
  },
  {
    slug: 'vercel-labs/vercel-react-best-practices',
    owner: 'vercel-labs', displayName: 'React Best Practices', category: 'Developer', isOfficial: false,
    summary: 'Enforces Vercel and React performance patterns — memoization, server components, lazy loading.',
    description: 'Codifies Vercel\'s proven React performance patterns into actionable guidance your agent can apply. Covers Server Components, Suspense, caching strategies, and bundle optimization that production teams rely on.',
    features: ['Identifies components that should be Server vs Client Components', 'Detects missing memoization and unnecessary re-renders', 'Flags heavy imports that should be lazily loaded', 'Recommends optimal data fetching patterns per use case'],
    useCases: ['Performance audits before major releases', 'Migrating Pages Router apps to App Router', 'Reducing bundle size and improving Core Web Vitals'],
    bestFor: 'Next.js optimization agents, web performance tools',
  },
  {
    slug: 'firebase/firebase-basics',
    owner: 'firebase', displayName: 'Firebase Basics', category: 'Developer', isOfficial: true,
    summary: 'Firebase setup, auth, Firestore, and Storage integration patterns for web and mobile.',
    description: 'Comprehensive guidance for integrating Firebase into web and mobile apps. Covers project setup, authentication flows, Firestore data modeling, Storage rules, and security configuration using Google\'s official best practices.',
    features: ['Firebase project setup and SDK initialization', 'Authentication with email, OAuth, phone, and anonymous sign-in', 'Firestore data modeling and security rules', 'Cloud Storage integration with upload and download patterns'],
    useCases: ['Bootstrapping new apps with Firebase backend', 'Migrating authentication to Firebase from custom systems', 'Setting up real-time data sync for collaborative features'],
    bestFor: 'App development agents, backend automation',
  },
  {
    slug: 'anthropics/mcp-builder',
    owner: 'anthropics', displayName: 'MCP Builder', category: 'AI & Agents', isOfficial: true,
    summary: 'Build and deploy Model Context Protocol servers. Add tools, resources, and prompts to any MCP host.',
    description: 'Complete toolkit for building MCP (Model Context Protocol) servers from scratch. Define tools with typed schemas, expose resources, create reusable prompt templates, and deploy to any compatible host — all with TypeScript-first ergonomics.',
    features: ['Scaffold new MCP servers with typed tool definitions', 'Define resources and prompt templates with full schema validation', 'Test servers locally before deploying to Claude, Cursor, or other hosts', 'Package and publish skills to the Skills.sh registry'],
    useCases: ['Building custom tools for internal company data', 'Exposing APIs and databases to AI agents securely', 'Creating reusable skill packages for distribution'],
    bestFor: 'Agent developers, MCP ecosystem contributors',
    requirements: 'Node.js 18+, TypeScript recommended',
  },
  {
    slug: 'anthropics/skill-creator',
    owner: 'anthropics', displayName: 'Skill Creator', category: 'AI & Agents', isOfficial: true,
    summary: 'Generate new agent skills from a description — handles packaging, metadata, and publishing.',
    description: 'Describe what you want your skill to do in plain language and this tool generates a complete, publishable skill package — including implementation, manifest, documentation, and test cases. Lowers the barrier to contributing to the agent skills ecosystem.',
    features: ['Generates skill implementation from natural language descriptions', 'Produces correct manifest files and package metadata', 'Writes test cases and usage examples automatically', 'Handles publishing workflow to Skills.sh'],
    useCases: ['Rapidly prototyping new skill ideas', 'Converting existing scripts into reusable agent skills', 'Contributing to open-source skill packages'],
    bestFor: 'Agent developers, skill publishers',
  },
  {
    slug: 'anthropics/claude-api',
    owner: 'anthropics', displayName: 'Claude API', category: 'AI & Agents', isOfficial: true,
    summary: 'Best practices for integrating the Claude API — streaming, tool use, prompt caching, vision.',
    description: 'Official Anthropic guidance for integrating Claude into your applications. Covers the full API surface — streaming responses, tool use with structured outputs, prompt caching for cost reduction, vision inputs, and multi-turn conversation management.',
    features: ['Streaming response handling with proper backpressure', 'Tool use patterns with typed input/output schemas', 'Prompt caching to reduce latency and token costs by up to 90%', 'Vision inputs — image analysis, document processing, screenshots'],
    useCases: ['Building Claude-powered features into existing products', 'Optimizing API costs with caching and batch strategies', 'Multi-modal workflows combining text, images, and tools'],
    bestFor: 'AI application developers, Claude integrations',
    requirements: 'Anthropic API key',
  },
  {
    slug: 'browser-use/browser-use',
    owner: 'browser-use', displayName: 'Browser Use', category: 'AI & Agents', isOfficial: false,
    summary: 'Give your agent a real browser — navigate pages, fill forms, extract data, and interact with web UIs.',
    description: 'Browser Use gives AI agents full control of a real Chromium browser. Navigate to any URL, interact with dynamic JavaScript-rendered content, fill and submit forms, take screenshots, and extract structured data from any website.',
    features: ['Navigate and interact with any website including JS-heavy SPAs', 'Fill forms, click buttons, handle dropdowns and modals', 'Take screenshots and extract structured data from pages', 'Handle authentication flows, cookies, and sessions'],
    useCases: ['Scraping data from sites without APIs', 'Automating web-based workflows and data entry', 'Monitoring competitor pricing and product changes'],
    bestFor: 'Research agents, automation bots, scraping workflows',
  },
  {
    slug: 'mastra/skills',
    owner: 'mastra', displayName: 'Mastra', category: 'AI & Agents', isOfficial: false,
    summary: 'TypeScript AI agent framework — build, test, and deploy agents with memory, tools, and workflows.',
    description: 'Mastra is a TypeScript-first framework for building production AI agents. It provides built-in memory management, tool calling, multi-step workflow orchestration, and observability — all with strong typing and a great developer experience.',
    features: ['Persistent agent memory across conversations', 'Typed tool definitions with automatic schema generation', 'Multi-step workflow orchestration with branching and loops', 'Built-in observability and step-by-step execution traces'],
    useCases: ['Building customer service agents with conversation history', 'Orchestrating multi-step research and analysis pipelines', 'Creating agents that coordinate across multiple external APIs'],
    bestFor: 'Agent platform builders, TypeScript developers',
    requirements: 'Node.js 18+, TypeScript',
  },
  {
    slug: 'langchain/langchain-skills',
    owner: 'langchain', displayName: 'LangChain', category: 'AI & Agents', isOfficial: true,
    summary: 'LLM orchestration patterns — chains, agents, memory, and retrieval-augmented generation.',
    description: 'The LangChain framework for orchestrating LLM-powered applications. Covers chain construction, agent loops, vector store integration for RAG, conversation memory, and connecting to hundreds of data sources and tools.',
    features: ['Build chains that sequence LLM calls with data transformations', 'RAG pipelines with vector stores (Pinecone, Chroma, Weaviate)', 'Conversation memory with windowed, summary, and entity options', 'Agent loops with tool selection, reasoning, and retry handling'],
    useCases: ['Document Q&A systems over private knowledge bases', 'Multi-hop research agents that break down complex questions', 'Customer support bots with product catalog retrieval'],
    bestFor: 'RAG systems, chatbot developers, research agents',
  },
  {
    slug: 'vercel-labs/agent-browser',
    owner: 'vercel-labs', displayName: 'Agent Browser', category: 'AI & Agents', isOfficial: false,
    summary: 'Headless browser automation built for AI agents — scrape, screenshot, and interact with any site.',
    description: 'A lightweight headless browser integration designed specifically for AI agents. Optimized for reliability and speed — handles JavaScript-heavy pages, takes high-quality screenshots, and returns clean structured data without the overhead of a full browser stack.',
    features: ['Lightweight headless Chromium with agent-optimized defaults', 'Full-page and element-level screenshots', 'HTML extraction with noise filtering for cleaner LLM inputs', 'Cookie and session management for authenticated scraping'],
    useCases: ['Monitoring dashboards and alerting on visual changes', 'Extracting content from paywalled or JS-rendered sites', 'Automated QA and visual regression testing'],
    bestFor: 'Research agents, monitoring bots, QA automation',
  },
  {
    slug: 'supabase/agent-skills',
    owner: 'supabase', displayName: 'Supabase', category: 'Database', isOfficial: true,
    summary: 'Postgres database best practices, row-level security, real-time subscriptions, and Edge Functions.',
    description: 'Official Supabase skill covering the full platform — schema design, row-level security policies, real-time subscriptions, Edge Functions, and Storage. Built around production patterns from the Supabase team.',
    features: ['Postgres schema design with Supabase conventions', 'Row-level security policy writing and testing', 'Real-time subscriptions for live data sync', 'Edge Functions for server-side logic without managing infrastructure'],
    useCases: ['Building multi-tenant SaaS with per-user data isolation', 'Adding real-time features like live cursors or notifications', 'Migrating from Firebase to Postgres with Supabase'],
    bestFor: 'Full-stack app agents, backend automation',
  },
  {
    slug: 'neon/agent-skills',
    owner: 'neon', displayName: 'Neon Postgres', category: 'Database', isOfficial: true,
    summary: 'Serverless Postgres on Neon — branching, autoscaling, and connection pooling patterns.',
    description: 'Neon\'s serverless Postgres platform with database branching for development workflows. Create isolated database branches for each PR, autoscale to zero when idle, and use connection pooling for serverless environments.',
    features: ['Database branching — create isolated branches per feature or PR', 'Autoscales to zero and back in milliseconds', 'Connection pooling via PgBouncer for serverless compatibility', 'Point-in-time restore and instant database copies'],
    useCases: ['Preview environments with real database snapshots per PR', 'Serverless API backends with zero idle cost', 'Data-intensive CI/CD pipelines with fresh DB per test run'],
    bestFor: 'Serverless application agents, CI/CD automation',
  },
  {
    slug: 'prisma/skills',
    owner: 'prisma', displayName: 'Prisma ORM', category: 'Database', isOfficial: true,
    summary: 'Type-safe database access with Prisma — schema design, migrations, and query optimization.',
    description: 'Prisma ORM for type-safe database access in TypeScript. Covers schema modeling, automated migration generation, query optimization, and relations — all with full IDE autocomplete and runtime type safety.',
    features: ['Schema design with relations, enums, and indexes', 'Automated migration generation and versioned history', 'Type-safe query builder with full TypeScript inference', 'Query performance analysis and N+1 detection'],
    useCases: ['Generating database schemas from domain models', 'Safe database migrations in production deployment pipelines', 'Building APIs with fully typed database access layer'],
    bestFor: 'TypeScript backend agents, database management automation',
    requirements: 'Node.js, TypeScript recommended',
  },
  {
    slug: 'redis/agent-skills',
    owner: 'redis', displayName: 'Redis', category: 'Database', isOfficial: true,
    summary: 'In-memory caching, pub/sub messaging, and session management with Redis.',
    description: 'Official Redis skill for integrating Redis into your applications. Covers caching strategies, pub/sub for real-time messaging, session storage, rate limiting, and distributed locking patterns.',
    features: ['Caching patterns — cache-aside, write-through, TTL management', 'Pub/sub and Streams for real-time event distribution', 'Session storage with sliding expiration', 'Rate limiting and distributed locks with SETNX patterns'],
    useCases: ['Caching expensive database queries or API responses', 'Building real-time leaderboards and activity feeds', 'Rate limiting API endpoints at scale'],
    bestFor: 'Performance optimization agents, real-time application builders',
  },
  {
    slug: 'planetscale/database-skills',
    owner: 'planetscale', displayName: 'PlanetScale', category: 'Database', isOfficial: true,
    summary: 'MySQL-compatible serverless database — branching workflow and zero-downtime schema changes.',
    description: 'PlanetScale\'s serverless MySQL platform with Git-like database branching. Make schema changes in a branch, test them safely, then merge with zero downtime — no locking, no maintenance windows.',
    features: ['Database branching for safe schema development', 'Non-blocking schema changes with no table locks', 'Query insights with automatic slow query detection', 'Global replication for low-latency reads worldwide'],
    useCases: ['High-traffic apps that can\'t afford schema change downtime', 'Teams that want Git-style workflows for database changes', 'Globally distributed apps needing read replicas'],
    bestFor: 'High-scale application agents, database DevOps',
  },
  {
    slug: 'figma/implement-design',
    owner: 'figma', displayName: 'Figma to Code', category: 'Design', isOfficial: true,
    summary: 'Convert Figma designs to production-ready React, HTML, or CSS with pixel-perfect accuracy.',
    description: 'Translates Figma designs into clean, production-ready code. Reads component structure, auto-layout, constraints, and design tokens from Figma and outputs React components, HTML/CSS, or Tailwind classes — with pixel-perfect fidelity.',
    features: ['Converts Figma frames and components to React or HTML/CSS', 'Preserves auto-layout as Flexbox or Grid', 'Maps design tokens to CSS variables or Tailwind classes', 'Handles responsive variants and breakpoints'],
    useCases: ['Translating designer handoffs directly into frontend code', 'Generating a component library from a Figma design system', 'Rapid prototyping from wireframes to working UI'],
    bestFor: 'Frontend development agents, design-to-code automation',
    requirements: 'Figma API access token',
  },
  {
    slug: 'shadcn/ui',
    owner: 'shadcn', displayName: 'shadcn/ui', category: 'Design', isOfficial: false,
    summary: 'Build beautiful UIs with shadcn components — accessible, customizable, and Tailwind-powered.',
    description: 'shadcn/ui is a collection of accessible, unstyled components built on Radix UI primitives and styled with Tailwind CSS. Copy components directly into your project — no package to install, full control over the code.',
    features: ['30+ accessible components: dialogs, dropdowns, tables, forms', 'Radix UI primitives with built-in ARIA and keyboard navigation', 'Tailwind CSS styling you own and customize fully', 'Dark mode support out of the box'],
    useCases: ['Building internal tools and dashboards quickly', 'Creating polished admin UIs without a design team', 'Starting new SaaS products with a consistent UI foundation'],
    bestFor: 'Frontend agents, Next.js and React app builders',
    requirements: 'Tailwind CSS, React',
  },
  {
    slug: 'anthropics/canvas-design',
    owner: 'anthropics', displayName: 'Canvas Design', category: 'Design', isOfficial: true,
    summary: 'Interactive visual design and rendering on HTML Canvas — charts, diagrams, and custom graphics.',
    description: 'Create rich, interactive visualizations directly in HTML Canvas. Covers custom chart rendering, interactive diagrams, generative art, and data visualization — without relying on heavy charting libraries.',
    features: ['Custom chart types: candlestick, radar, waterfall, sankey', 'Interactive elements with event handling and animations', 'Generative patterns and procedural graphic design', 'Export to PNG, SVG, or PDF'],
    useCases: ['Building custom trading charts for financial dashboards', 'Generating branded infographics from data', 'Creating interactive network diagrams and org charts'],
    bestFor: 'Data visualization agents, dashboard builders',
  },
  {
    slug: 'anthropics/theme-factory',
    owner: 'anthropics', displayName: 'Theme Factory', category: 'Design', isOfficial: true,
    summary: 'Generate and apply consistent color themes, typography scales, and spacing systems.',
    description: 'Generate complete design systems from a base color and brand direction. Produces accessible color palettes, modular type scales, spacing tokens, and shadow layers — all exportable as CSS variables, Tailwind config, or design tokens JSON.',
    features: ['WCAG-compliant color palette generation from a single brand color', 'Modular type scales with fluid responsive sizing', 'Spacing and sizing scales based on a consistent base unit', 'Export as CSS variables, Tailwind config, or design tokens JSON'],
    useCases: ['Creating a new brand identity\'s design system from scratch', 'Auditing and fixing accessibility issues in existing color systems', 'Generating dark mode variants automatically from light mode tokens'],
    bestFor: 'Design system agents, branding tools',
  },
  {
    slug: 'figma/create-design-system-rules',
    owner: 'figma', displayName: 'Design System Rules', category: 'Design', isOfficial: true,
    summary: 'Define and enforce design system tokens, components, and patterns across your codebase.',
    description: 'Establish and enforce design system rules across your Figma files and codebase. Define tokens, document component usage guidelines, and create checks that catch design drift before it ships.',
    features: ['Define and document design tokens with usage constraints', 'Component guidelines with do/don\'t usage examples', 'Automated checks that flag design system violations', 'Cross-file consistency enforcement via Figma libraries'],
    useCases: ['Scaling a design system across a large product team', 'Onboarding new designers to an established system', 'Keeping Figma and code in sync as the system evolves'],
    bestFor: 'Design ops agents, design system maintainers',
    requirements: 'Figma organization plan for library features',
  },
  {
    slug: 'cabal/trading-boy',
    owner: 'cabal', displayName: 'Trading Boy', category: 'Web3', isOfficial: true,
    summary: 'CLI-based autonomous AI trading agent for crypto and commodities — SOUL personality framework, bear-case reasoning, and Telegram bot control.',
    description: 'Trading Boy is a CLI-based autonomous trading agent built for crypto and commodities markets. Each agent has a SOUL — a personality framework that defines how it scans, analyzes, and executes trades. Designed with a bear-case-first reasoning model to prevent overconfident entries, it combines real-time market data, whale detection, DeFi risk scoring, and social sentiment into a four-step loop: scan → analyze → decide → execute.',
    features: [
      'SOUL wizard — define your agent\'s personality, risk appetite, and trading style interactively',
      'Bear-case-first reasoning prevents overconfident market entries and protects capital',
      'LLM-powered exit logic triggered by heartbeat checks or live market events',
      'Real-time context assembly: whale detection, DeFi risk scores, sentiment, macro indicators',
      '52+ CLI commands for full agent control and monitoring',
      'Telegram bot with 16 commands for mobile management on the go',
      'Automatic stop-loss and take-profit mechanical safeguards',
      'BYOK model support — bring your own Anthropic, OpenAI, or Groq API key',
    ],
    useCases: [
      'Deploying a 24/7 autonomous crypto trading agent with custom risk parameters',
      'Running commodities strategies alongside crypto in a unified agent',
      'Managing live positions via Telegram without needing a terminal',
      'Backtesting SOUL personalities before deploying real capital',
    ],
    bestFor: 'Crypto trading agents, DeFi automation, commodities bots',
    requirements: 'API key for your exchange + LLM provider key (Anthropic, OpenAI, or Groq)',
  },
  {
    slug: 'okx/agent-tradekit',
    owner: 'okx', displayName: 'OKX Agent TradeKit', category: 'Web3', isOfficial: true,
    summary: 'Build AI agents that automate trading on OKX — natural language commands, MCP server, spot/futures/options, grid bots, and DCA strategies.',
    description: 'OKX Agent TradeKit lets you build AI agents that automate trading strategies across OKX\'s full product suite. Issue commands in plain language ("Buy 500 USDT of BTC at market, stop-loss at 84,000") and your agent executes without manual intervention. Connect via MCP to Claude or ChatGPT, or trade directly from a terminal with the CLI. Four safety layers — demo mode, read-only restrictions, module permissions, and rate limiting — protect capital throughout.',
    features: [
      'Natural language trading — describe a strategy in plain English and the agent executes it',
      'MCP server integration — connect OKX to Claude, ChatGPT, or any MCP-compatible AI',
      'CLI interface — trade from terminal, pipe market data into scripts, and schedule cron jobs',
      'Full product coverage: spot, futures, options, algo orders, and multi-leg strategies',
      'Grid trading bots for range-bound volatility capture',
      'DCA strategies, batch order management, and advanced stop-loss/take-profit',
      'Portfolio health checks — real-time balance, P&L, and fee tracking',
      'Four-layer safety architecture: demo mode, read-only mode, module permissions, rate limiting',
      'Fully open-source for independent code audits',
    ],
    useCases: [
      'Automating spot trading strategies with protective stops via natural language',
      'Running grid bots on OKX futures during sideways markets',
      'Portfolio P&L analysis and news-driven reactive trading',
      'Scheduling DCA buys as cron jobs from a terminal script',
    ],
    bestFor: 'OKX traders, AI-driven strategy automation, multi-product crypto bots',
    requirements: 'OKX API key with trading permissions',
  },
  {
    slug: 'coinbase/trade',
    owner: 'coinbase', displayName: 'Coinbase Trade', category: 'Web3', isOfficial: true,
    summary: 'Execute cryptocurrency trades via Coinbase — market orders, limit orders, and portfolio management.',
    description: 'Official Coinbase skill for programmatic cryptocurrency trading. Place market and limit orders, monitor portfolio balances, track open orders, and respond to price alerts — all via the Coinbase Advanced Trade API.',
    features: ['Market and limit order placement across all Coinbase pairs', 'Real-time order book and price feed access', 'Portfolio balance monitoring and P&L tracking', 'Order history, fills, and fee reporting'],
    useCases: ['Automated trading bots executing strategy-based entries and exits', 'Portfolio rebalancing agents triggered by allocation drift', 'DCA (dollar-cost averaging) execution on a schedule'],
    bestFor: 'Trading bots, portfolio management agents',
    requirements: 'Coinbase Advanced Trade API key',
  },
  {
    slug: 'coinbase/send-usdc',
    owner: 'coinbase', displayName: 'Send USDC', category: 'Web3', isOfficial: true,
    summary: 'Programmatically send USDC stablecoin transfers on Base and other EVM chains.',
    description: 'Send USDC transfers on Base and EVM-compatible chains with automatic gas estimation and transaction tracking. Handles wallet management, nonce coordination, and receipt confirmation so your agent can focus on business logic.',
    features: ['Send USDC on Base, Ethereum, Polygon, and other EVM chains', 'Automatic gas estimation and priority fee optimization', 'Transaction receipt tracking and confirmation polling', 'Batch transfers for efficient multi-recipient payouts'],
    useCases: ['Automated payroll or contractor payments in USDC', 'Revenue sharing or royalty distribution systems', 'Micro-payment streams for content or API usage'],
    bestFor: 'Payment automation agents, DeFi workflow tools',
    requirements: 'Coinbase API key, funded wallet',
  },
  {
    slug: 'coinbase/authenticate-wallet',
    owner: 'coinbase', displayName: 'Wallet Auth', category: 'Web3', isOfficial: true,
    summary: 'Authenticate users with their crypto wallet — Sign-In with Ethereum and Base account patterns.',
    description: 'Implement wallet-based authentication for your apps using Sign-In with Ethereum (SIWE) and Coinbase Smart Wallet. Verify wallet ownership, manage sessions, and link wallet addresses to user accounts.',
    features: ['Sign-In with Ethereum (SIWE) message signing and verification', 'Coinbase Smart Wallet integration for gasless UX', 'Session management with JWT or cookie-based approaches', 'Multi-wallet support and address linking'],
    useCases: ['Web3 app login without passwords or email', 'Gating content or features to NFT or token holders', 'Linking wallet addresses to existing user accounts'],
    bestFor: 'Web3 app builders, decentralized identity agents',
  },
  {
    slug: 'base/deploying-contracts-on-base',
    owner: 'base', displayName: 'Deploy Contracts', category: 'Web3', isOfficial: true,
    summary: 'Deploy and verify smart contracts on Base — Foundry/Hardhat patterns and gas optimization.',
    description: 'End-to-end smart contract deployment on Base mainnet and testnet. Covers contract compilation, deployment scripts, Etherscan verification, proxy patterns for upgradeability, and gas optimization techniques.',
    features: ['Foundry and Hardhat deployment scripts with reproducible builds', 'Automatic contract verification on Basescan', 'Proxy patterns: UUPS, Transparent, Beacon for upgradeability', 'Gas profiling and optimization recommendations'],
    useCases: ['Deploying DeFi protocols or token contracts to Base', 'Automated deployment pipelines for smart contract projects', 'Upgrading existing contracts via proxy patterns'],
    bestFor: 'Smart contract developers, DeFi automation agents',
    requirements: 'Foundry or Hardhat, ETH on Base for gas',
  },
  {
    slug: 'base/building-with-base-account',
    owner: 'base', displayName: 'Base Account', category: 'Web3', isOfficial: true,
    summary: 'Build apps on Base with smart wallets, account abstraction, and gasless transactions.',
    description: 'Coinbase\'s Base Account SDK for building next-generation wallet experiences. Implement smart wallets with account abstraction (ERC-4337), sponsor gas for your users, and enable one-click onboarding without seed phrases.',
    features: ['Smart wallet creation with no seed phrase required', 'Gas sponsorship via Paymaster for frictionless UX', 'Batch transactions — multiple actions in a single user signature', 'Social recovery and multi-signer configurations'],
    useCases: ['Consumer crypto apps where gas friction kills retention', 'Batch minting or in-game transactions without multiple approvals', 'Onboarding Web2 users to crypto without wallet complexity'],
    bestFor: 'Consumer dApp builders, wallet UX agents',
  },
  {
    slug: 'coreyhaines31/seo-audit',
    owner: 'coreyhaines31', displayName: 'SEO Audit', category: 'Marketing', isOfficial: false,
    summary: 'Comprehensive SEO analysis — technical issues, keyword gaps, backlink opportunities, and fixes.',
    description: 'Runs a full SEO audit across your website — crawls pages, checks technical health, analyzes keyword coverage, and identifies quick wins. Produces a prioritized list of improvements with implementation guidance.',
    features: ['Technical SEO: crawl errors, meta tags, structured data, page speed', 'Keyword gap analysis vs top-ranking competitors', 'Internal linking opportunities and anchor text optimization', 'Core Web Vitals scoring and improvement recommendations'],
    useCases: ['Pre-launch SEO health checks for new sites', 'Monthly SEO monitoring with automated change detection', 'Competitive gap analysis for content strategy'],
    bestFor: 'Marketing agents, content strategy bots',
  },
  {
    slug: 'apify/apify-market-research',
    owner: 'apify', displayName: 'Market Research', category: 'Marketing', isOfficial: true,
    summary: 'Automated market research — competitor analysis, pricing intelligence, and trend detection.',
    description: 'Apify\'s market research suite for extracting competitive intelligence at scale. Monitor competitor pricing, track product changes, aggregate industry news, and surface emerging trends — all on a schedule.',
    features: ['Competitor product and pricing monitoring', 'Industry news aggregation from thousands of sources', 'Trend detection from social media and search data', 'Structured data export to spreadsheets or databases'],
    useCases: ['Daily competitor pricing alerts for e-commerce', 'Tracking feature launches across competing products', 'Building market intelligence reports automatically'],
    bestFor: 'Market intelligence agents, competitive research bots',
  },
  {
    slug: 'apify/apify-lead-generation',
    owner: 'apify', displayName: 'Lead Generation', category: 'Marketing', isOfficial: true,
    summary: 'Find and qualify B2B leads from LinkedIn, company websites, and public directories.',
    description: 'Extract and qualify B2B leads from LinkedIn, company directories, job boards, and public databases. Enrich contacts with company data, verify emails, and score leads based on ideal customer profile criteria.',
    features: ['LinkedIn company and contact extraction', 'Email verification and deliverability scoring', 'Company data enrichment — headcount, funding, tech stack', 'ICP scoring and lead qualification filtering'],
    useCases: ['Building outbound lead lists for sales campaigns', 'Finding decision-makers at target account lists', 'Enriching CRM data with up-to-date company information'],
    bestFor: 'Sales automation agents, outbound prospecting tools',
  },
  {
    slug: 'datadog/dd-pup',
    owner: 'datadog', displayName: 'Datadog Monitor', category: 'Data & Analytics', isOfficial: true,
    summary: 'Query metrics, create monitors, and manage alerts. Full observability from your agent.',
    description: 'Full Datadog API integration for monitoring and observability. Query time-series metrics, create and manage monitors, explore distributed traces, search logs, and respond to incidents — all from your agent.',
    features: ['Query metrics and build dashboards programmatically', 'Create and manage monitors with alert thresholds', 'Explore distributed traces and service maps', 'Search and tail logs with structured queries'],
    useCases: ['Auto-creating monitors when new services deploy', 'Incident response agents that gather context from traces and logs', 'Capacity planning based on historical metric trends'],
    bestFor: 'DevOps agents, SRE automation, incident response bots',
    requirements: 'Datadog API and Application keys',
  },
  {
    slug: 'posthog/posthog',
    owner: 'posthog', displayName: 'PostHog Analytics', category: 'Data & Analytics', isOfficial: true,
    summary: 'Query user events, manage feature flags, and analyze funnels with PostHog.',
    description: 'PostHog product analytics integration for understanding user behavior. Query events, build funnel and retention analyses, manage feature flags and A/B tests, and track session recordings — all programmatically.',
    features: ['Query custom events and user properties with HogQL', 'Funnel and retention analysis with cohort filtering', 'Feature flag management and A/B test results', 'Session recording search and annotation'],
    useCases: ['Automated weekly product metrics reports', 'Feature flag rollout agents that monitor error rates', 'Analyzing drop-off in onboarding funnels automatically'],
    bestFor: 'Product analytics agents, growth automation tools',
    requirements: 'PostHog project API key',
  },
  {
    slug: 'tinybird/tinybird-agent-skills',
    owner: 'tinybird', displayName: 'Tinybird', category: 'Data & Analytics', isOfficial: true,
    summary: 'Real-time analytics at scale — ingest events, build APIs, and query billions of rows instantly.',
    description: 'Tinybird for real-time data products. Ingest millions of events per second, build analytics APIs in minutes, and query billions of rows with sub-second latency — without managing infrastructure.',
    features: ['Event ingestion from any source at millions of events/second', 'Build REST APIs over your data in minutes with Pipes', 'Sub-second query response over billions of rows', 'Copy Pipes for scheduled data transformations and exports'],
    useCases: ['Real-time product analytics dashboards for SaaS products', 'Live leaderboards and activity feeds at scale', 'IoT event processing and anomaly detection pipelines'],
    bestFor: 'Real-time data agents, high-volume analytics tools',
  },
  {
    slug: 'dagster/dagster-expert',
    owner: 'dagster', displayName: 'Dagster', category: 'Data & Analytics', isOfficial: true,
    summary: 'Build and orchestrate data pipelines — assets, jobs, schedules, and sensors in one place.',
    description: 'Dagster data orchestration for modern data platforms. Model pipelines as software-defined assets, schedule and trigger jobs, monitor data quality, and integrate with dbt, Spark, and your data warehouse.',
    features: ['Software-defined assets with lineage and dependency tracking', 'Schedules, sensors, and event-driven pipeline triggers', 'Data quality checks with asset checks', 'Integration with dbt, Spark, Airbyte, and major warehouses'],
    useCases: ['Building ETL pipelines from raw sources to data warehouse', 'Orchestrating ML feature pipelines with freshness guarantees', 'Monitoring data quality across a complex data graph'],
    bestFor: 'Data engineering agents, analytics engineering automation',
    requirements: 'Python 3.8+',
  },
  {
    slug: 'firecrawl/firecrawl',
    owner: 'firecrawl', displayName: 'Firecrawl', category: 'Scraping', isOfficial: true,
    summary: 'Turn any website into clean LLM-ready data — crawl, scrape, and extract structured content.',
    description: 'Firecrawl converts any website into clean, structured data optimized for LLM consumption. Handles JavaScript rendering, anti-bot measures, and dynamic content — returning Markdown, HTML, or structured JSON.',
    features: ['Full-site crawling with configurable depth and scope', 'JavaScript rendering for SPAs and dynamic content', 'Returns clean Markdown — no boilerplate, no ads', 'Structured extraction with schema-guided JSON output'],
    useCases: ['Building RAG knowledge bases from competitor documentation', 'Monitoring news sites and blogs for relevant content', 'Extracting product data from e-commerce sites at scale'],
    bestFor: 'Research agents, RAG pipeline builders, content monitoring bots',
    requirements: 'Firecrawl API key',
  },
  {
    slug: 'apify/apify-ultimate-scraper',
    owner: 'apify', displayName: 'Apify Scraper', category: 'Scraping', isOfficial: true,
    summary: 'Enterprise web scraping — handle anti-bot measures, proxies, and large-scale extraction.',
    description: 'Apify\'s enterprise-grade scraping infrastructure for large-scale, reliable data extraction. Handles CAPTCHAs, rotating residential proxies, session management, and rate limiting — so you get data, not blocks.',
    features: ['Residential and datacenter proxy rotation with geo-targeting', 'CAPTCHA solving and anti-bot bypass', 'Concurrent scraping at thousands of requests per minute', 'Actor marketplace with 1,500+ pre-built scrapers'],
    useCases: ['Scraping Amazon, LinkedIn, Google Maps at scale', 'Real estate data extraction from listing sites', 'Price comparison engines pulling from hundreds of retailers'],
    bestFor: 'Data extraction agents, market intelligence tools',
    requirements: 'Apify API token',
  },
  {
    slug: 'brave/web-search',
    owner: 'brave', displayName: 'Brave Search', category: 'Scraping', isOfficial: true,
    summary: 'Privacy-first web, news, and image search with clean JSON results and no tracking.',
    description: 'Brave Search API for independent, privacy-preserving web search. Returns clean JSON results without ads, tracking, or filter bubbles — with dedicated endpoints for web, news, images, and local points of interest.',
    features: ['Web search with 20B+ indexed pages and independent index', 'News search with source filtering and freshness controls', 'Image search with safe-search and format filtering', 'Local POI search with addresses, ratings, and hours'],
    useCases: ['Research agents gathering current information on any topic', 'News monitoring bots tracking mentions and coverage', 'Fact-checking and source verification pipelines'],
    bestFor: 'Research agents, content discovery bots',
    requirements: 'Brave Search API key',
  },
  {
    slug: 'browserbase/browser',
    owner: 'browserbase', displayName: 'Browserbase', category: 'Scraping', isOfficial: true,
    summary: 'Scalable cloud browsers for agents — run headless Chromium with stealth and residential proxies.',
    description: 'Browserbase provides cloud-hosted browser sessions purpose-built for AI agents. Each session is a real Chromium instance with fingerprint randomization, residential proxies, and stealth mode — making your agent look like a real user.',
    features: ['Managed cloud browsers with no infrastructure to maintain', 'Residential proxy network for geographic flexibility', 'Browser fingerprint randomization to avoid detection', 'Live session viewing and replay for debugging'],
    useCases: ['Large-scale scraping without getting blocked', 'Automating web workflows that require a real browser', 'Testing web apps across different geographic locations'],
    bestFor: 'Scraping agents, web automation bots',
    requirements: 'Browserbase API key',
  },
  {
    slug: 'elevenlabs/text-to-speech',
    owner: 'elevenlabs', displayName: 'ElevenLabs TTS', category: 'Media', isOfficial: true,
    summary: 'Ultra-realistic voice generation — clone voices, generate audio, and create multilingual speech.',
    description: 'ElevenLabs text-to-speech API for generating human-quality audio. Choose from 1,000+ voices, clone any voice from a short sample, and generate speech in 29 languages — with fine-grained control over style, pacing, and emotion.',
    features: ['1,000+ high-quality voices across accents and languages', 'Voice cloning from as little as 1 minute of audio', '29-language support with natural prosody', 'Emotional style controls: calm, excited, whisper, and more'],
    useCases: ['Generating podcast or video voiceovers at scale', 'Adding voice to AI assistants and chatbots', 'Localizing audio content across multiple languages automatically'],
    bestFor: 'Content creation agents, media automation tools',
    requirements: 'ElevenLabs API key',
  },
  {
    slug: 'elevenlabs/speech-to-text',
    owner: 'elevenlabs', displayName: 'Speech to Text', category: 'Media', isOfficial: true,
    summary: 'Accurate transcription with speaker diarization, timestamps, and multi-language support.',
    description: 'ElevenLabs speech-to-text for highly accurate audio transcription. Handles multi-speaker recordings with diarization, produces word-level timestamps, and transcribes in 99 languages — with specialized models for telephony and broadcast audio.',
    features: ['Word-level timestamps with confidence scores', 'Speaker diarization identifying who said what', '99-language transcription with dialect awareness', 'Specialized models for telephony, meetings, and broadcast'],
    useCases: ['Transcribing meeting recordings and generating action items', 'Building searchable archives from audio and video content', 'Real-time caption generation for live streams'],
    bestFor: 'Media processing agents, content indexing tools',
    requirements: 'ElevenLabs API key',
  },
  {
    slug: 'remotion/skills',
    owner: 'remotion', displayName: 'Remotion Video', category: 'Media', isOfficial: true,
    summary: 'Programmatically create and render videos with React — animations, captions, and dynamic content.',
    description: 'Remotion turns React into a video production engine. Write video compositions in JSX, animate with spring physics and keyframes, inject dynamic data, and render to MP4 or WebM — all without video editing software.',
    features: ['React-based video compositions with full CSS and animation support', 'Spring physics and keyframe animations', 'Dynamic data injection — charts, text, images from any source', 'Cloud rendering at scale via Remotion Lambda'],
    useCases: ['Generating personalized video reports from data', 'Auto-producing social media clips from blog posts or articles', 'Creating explainer videos with animated data visualizations'],
    bestFor: 'Content creation agents, automated video production',
    requirements: 'Node.js, ffmpeg for local rendering',
  },
  {
    slug: 'vercel/ai',
    owner: 'vercel', displayName: 'Vercel AI SDK', category: 'Cloud', isOfficial: true,
    summary: 'Build AI-powered Next.js apps — streaming UIs, model switching, and edge-ready deployments.',
    description: 'The Vercel AI SDK for building production AI applications with Next.js. Unified API across all major LLM providers, streaming UI components, structured object generation, and tool calling — optimized for edge deployment.',
    features: ['Unified API across OpenAI, Anthropic, Google, Mistral, and more', 'Streaming text and React Server Component support', 'Structured object generation with Zod schema validation', 'Built-in tool calling and multi-step agent loops'],
    useCases: ['Building streaming chatbots and AI assistants', 'Adding AI features to existing Next.js apps', 'Multi-provider AI pipelines with automatic fallback'],
    bestFor: 'Next.js AI application agents, full-stack builders',
    requirements: 'Next.js 13.4+',
  },
  {
    slug: 'cloudflare/cloudflare',
    owner: 'cloudflare', displayName: 'Cloudflare Workers', category: 'Cloud', isOfficial: true,
    summary: 'Deploy serverless functions globally — edge computing, caching, and KV storage at scale.',
    description: 'Cloudflare Workers for globally distributed serverless execution. Run JavaScript at the edge in 300+ locations, cache aggressively, store data in KV and Durable Objects, and protect your origin with WAF rules.',
    features: ['Edge functions running in 300+ locations worldwide', 'KV storage for globally replicated key-value data', 'Durable Objects for stateful serverless coordination', 'WAF rules, rate limiting, and bot protection'],
    useCases: ['Ultra-low-latency API endpoints serving global users', 'A/B testing and personalization at the edge', 'Cache purging and invalidation automation'],
    bestFor: 'Global infrastructure agents, performance optimization tools',
  },
  {
    slug: 'microsoft/azure-skills',
    owner: 'microsoft', displayName: 'Azure', category: 'Cloud', isOfficial: true,
    summary: 'Full Azure cloud stack — compute, storage, AI services, and infrastructure as code.',
    description: 'Microsoft\'s official Azure skill covering the complete cloud platform. Manage VMs, AKS clusters, Azure OpenAI, Cosmos DB, Storage accounts, and networking — all via Azure CLI and ARM/Bicep templates.',
    features: ['Azure OpenAI Service integration with GPT-4o and embeddings', 'AKS (Kubernetes) cluster management and deployment', 'Cosmos DB, Azure SQL, and Storage management', 'Bicep/ARM templates for infrastructure as code'],
    useCases: ['Deploying AI workloads to Azure OpenAI Service', 'Managing enterprise Azure infrastructure programmatically', 'Building hybrid cloud workflows across Azure services'],
    bestFor: 'Enterprise cloud agents, Azure infrastructure automation',
    requirements: 'Azure subscription, Azure CLI',
  },
  {
    slug: 'firebase/firebase-auth-basics',
    owner: 'firebase', displayName: 'Firebase Auth', category: 'Cloud', isOfficial: true,
    summary: 'Add authentication to any app — email/password, OAuth, phone, and anonymous sign-in.',
    description: 'Firebase Authentication for adding sign-in to web and mobile apps. Covers all auth methods — email/password, Google/Apple/GitHub OAuth, phone SMS verification, and anonymous sign-in — with session management and security rules.',
    features: ['Email/password auth with password reset flows', 'OAuth providers: Google, Apple, GitHub, Facebook, Twitter', 'Phone number verification with SMS', 'Custom token auth for integrating with existing identity systems'],
    useCases: ['Adding sign-in to a new app in under an hour', 'Migrating from a custom auth system to Firebase', 'Implementing multi-factor authentication for security'],
    bestFor: 'App development agents, authentication automation',
  },
]

export default function SkillsShDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const decodedSlug = decodeURIComponent(slug ?? '')
  const { agents, getConnectionStatus } = useAgentsStore()
  const { user } = useAuthStore()
  const showToast = useUIStore((s) => s.showToast)

  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)
  const { save, unsave, isSaved } = useSavedSkillsStore()

  const skill = SKILLSSH_DETAILS.find((s) => s.slug === decodedSlug)
  const saved = skill ? isSaved(skill.slug) : false

  useEffect(() => {
    if (!skill || !agents.length) return
    const agentIds = agents.map((a) => a.id)
    supabase
      .from('agent_skills')
      .select('id')
      .eq('skill_slug', skill.slug)
      .in('agent_id', agentIds)
      .limit(1)
      .then(({ data }) => { if (data && data.length > 0) setInstalled(true) })
  }, [skill, agents])

  const handleInstall = useCallback(async () => {
    if (!user || !skill) return
    const connectedAgents = agents.filter((a) => getConnectionStatus(a.id) === 'connected')
    if (connectedAgents.length === 0) {
      showToast('Connect an agent first')
      return
    }

    const doInstall = async (agentId: string, agentName: string) => {
      setInstalling(true)
      try {
        await supabase.from('agent_skills').upsert({
          agent_id: agentId,
          skill_slug: skill.slug,
          config: { displayName: skill.displayName, source: 'skillssh', owner: skill.owner },
          status: 'active',
        }, { onConflict: 'agent_id,skill_slug' })
        setInstalled(true)
        showToast(`${skill.displayName} installed on ${agentName}`)
      } catch (err: any) {
        showToast(`Install failed: ${err?.message ?? 'unknown error'}`)
      }
      setInstalling(false)
    }

    if (connectedAgents.length === 1) {
      doInstall(connectedAgents[0].id, connectedAgents[0].name)
    } else {
      const { Alert } = require('react-native')
      Alert.alert('Install on agent', 'Choose an agent',
        connectedAgents.map((a) => ({ text: a.name, onPress: () => doInstall(a.id, a.name) }))
      )
    }
  }, [skill, agents, user, showToast])

  if (!skill) {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Skills</Text>
        </TouchableOpacity>
        <View style={styles.centered}>
          <Text style={{ color: Colors.textSecondary }}>Skill not found</Text>
        </View>
      </View>
    )
  }

  const toggleSave = () => {
    if (!skill) return
    if (saved) {
      unsave(skill.slug)
    } else {
      save({ id: skill.slug, name: skill.displayName, source: 'skillssh', category: skill.category, savedAt: Date.now() })
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Skills</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleSave} style={styles.bookmarkBtn}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={22} color={saved ? Colors.accentCrimson : Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.skillName}>{skill.displayName}</Text>

        <View style={styles.metaRow}>
          <View style={styles.providerBadge}><Text style={styles.providerBadgeText}>Skills.sh</Text></View>
          {skill.isOfficial && (
            <View style={styles.officialBadge}><Text style={styles.officialBadgeText}>✓ Official</Text></View>
          )}
          <View style={styles.categoryBadge}><Text style={styles.categoryBadgeText}>{skill.category}</Text></View>
        </View>

        <Text style={styles.ownerText}>by @{skill.owner}</Text>

        <Text style={styles.description}>{skill.description}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>What it does</Text>
          {skill.features.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Text style={styles.featureDot}>◆</Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Use cases</Text>
          {skill.useCases.map((u, i) => (
            <View key={i} style={styles.featureRow}>
              <Text style={styles.useCaseDot}>→</Text>
              <Text style={styles.featureText}>{u}</Text>
            </View>
          ))}
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Best for</Text>
            <Text style={styles.infoCellValue}>{skill.bestFor}</Text>
          </View>
          {skill.requirements && (
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>Requirements</Text>
              <Text style={styles.infoCellValue}>{skill.requirements}</Text>
            </View>
          )}
        </View>

        {installed ? (
          <View style={styles.installedBtn}>
            <Text style={styles.installedBtnText}>Installed ✓</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.installBtn, installing && styles.installBtnLoading]}
            onPress={handleInstall}
            disabled={installing}
          >
            {installing
              ? <ActivityIndicator size="small" color={Colors.bgPrimary} />
              : <Text style={styles.installBtnText}>Install on Agent</Text>
            }
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingBottom: 8, paddingHorizontal: 24 },
  backBtn: {},
  backBtnText: { color: Colors.accentCrimson, fontSize: 16 },
  bookmarkBtn: { padding: 4 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 24, paddingTop: 8, paddingBottom: 60 },
  skillName: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  providerBadge: { backgroundColor: 'rgba(251,146,60,0.12)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  providerBadgeText: { color: '#fb923c', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  officialBadge: { backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  officialBadgeText: { color: '#60a5fa', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  categoryBadge: { backgroundColor: 'rgba(251,146,60,0.1)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  categoryBadgeText: { color: '#fb923c', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  ownerText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 20 },
  description: { fontSize: 15, color: Colors.textSecondary, lineHeight: 23, marginBottom: 28 },
  section: { marginBottom: 28, gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  featureRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  featureDot: { fontSize: 8, color: '#fb923c', marginTop: 5 },
  useCaseDot: { fontSize: 13, color: Colors.textMuted, marginTop: 1 },
  featureText: { flex: 1, fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },
  infoGrid: { gap: 14, marginBottom: 28, backgroundColor: '#0f0f0f', borderRadius: 14, padding: 16 },
  infoCell: { gap: 4 },
  infoCellLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  infoCellValue: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  installBtn: {
    backgroundColor: Colors.accentCrimson, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
  },
  installBtnLoading: { opacity: 0.7 },
  installBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '600' },
  installedBtn: {
    backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
  },
  installedBtnText: { color: Colors.accentGreen, fontSize: 16, fontWeight: '600' },
})
