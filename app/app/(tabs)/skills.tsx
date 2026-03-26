import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Modal, RefreshControl } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useSkillsStore } from '../../stores/skillsStore'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { useSavedSkillsStore } from '../../stores/savedSkillsStore'
import type { SavedSkill } from '../../stores/savedSkillsStore'
import { Colors } from '../../constants/colors'
import { translateToEnglish } from '../../lib/translate'
import type { Skill } from '../../lib/types'

const CLAWHUB = 'https://clawhub.ai/api/v1'

// ClawHub assigns "community" to every skill — channels are meaningless.
// Categories use targeted search queries + client-side keyword filtering.

const CLAWHUB_CATEGORIES = [
  'All', 'Crypto', 'Stocks', 'Finance', 'Developer', 'Productivity',
  'Marketing', 'Business', 'Media', 'AI Agents', 'Lifestyle',
]

interface CategoryConfig {
  queries: string[]   // search terms — results merged + deduped
  keywords: string[]  // skill must match at least one in displayName+summary
  label: string       // section heading
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  'Crypto': {
    queries: ['crypto bitcoin', 'ethereum blockchain'],
    keywords: ['crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'blockchain', 'defi', 'nft', 'token', 'coin', 'wallet', 'binance', 'coinbase', 'web3', 'dex', 'staking', 'yield', 'solana', 'polymarket'],
    label: 'Crypto & Blockchain',
  },
  'Stocks': {
    queries: ['stocks market trading', 'quant trading bot'],
    keywords: ['stock', 'stocks', 'trading', 'trade', 'market', 'forex', 'quant', 'backtest', 'arbitrage', 'futures', 'options', 'candlestick', 'macd', 'chart', 'equity', 'ticker', 'automated trading', 'grid trading', 'day trading'],
    label: 'Stocks & Markets',
  },
  'Finance': {
    queries: ['finance investment', 'tax invoice budget'],
    keywords: ['finance', 'financial', 'investment', 'invest', 'tax', 'invoice', 'budget', 'expense', 'accounting', 'revenue', 'income', 'payroll', 'billing', 'money', 'bank', 'loan', 'credit', 'insurance', 'fund'],
    label: 'Finance & Money',
  },
  'Developer': {
    queries: ['code github developer', 'programming cli tool'],
    keywords: ['code', 'coding', 'github', 'git', 'developer', 'programming', 'api', 'cli', 'sdk', 'database', 'sql', 'python', 'javascript', 'typescript', 'docker', 'deploy', 'debug', 'refactor', 'ocr', 'file process'],
    label: 'Developer Tools',
  },
  'Productivity': {
    queries: ['productivity workflow automation', 'google workspace calendar email'],
    keywords: ['productivity', 'workflow', 'automation', 'calendar', 'email', 'docs', 'google', 'task', 'schedule', 'reminder', 'meeting', 'notes', 'organize', 'document', 'spreadsheet', 'slides', 'summary', 'inbox', 'mail'],
    label: 'Productivity & Workflow',
  },
  'Marketing': {
    queries: ['marketing seo content', 'social media growth'],
    keywords: ['marketing', 'seo', 'content', 'keyword', 'social media', 'instagram', 'twitter', 'linkedin', 'tiktok', 'growth', 'engagement', 'campaign', 'ads', 'copywriting', 'brand', 'audience', 'lead generation'],
    label: 'Marketing & SEO',
  },
  'Business': {
    queries: ['crm sales business', 'customer support operations'],
    keywords: ['crm', 'sales', 'business', 'customer', 'support', 'operations', 'lead', 'prospect', 'pipeline', 'contact', 'outreach', 'hiring', 'recruit', 'hr', 'enterprise', 'project management'],
    label: 'Business & Sales',
  },
  'Media': {
    queries: ['video editor creator', 'image audio media content'],
    keywords: ['video', 'image', 'audio', 'media', 'photo', 'caption', 'subtitle', 'editor', 'creator', 'youtube', 'stream', 'podcast', 'music', 'animation', 'reels', 'thumbnail', 'transcript', 'recording'],
    label: 'Media & Content',
  },
  'AI Agents': {
    queries: ['ai agent llm prompt', 'agent security memory'],
    keywords: ['agent', 'llm', 'prompt', 'gpt', 'claude', 'model', 'memory', 'guard', 'security', 'permission', 'orchestrat', 'context', 'embedding', 'rag', 'chatbot', 'openclaw', 'mcp'],
    label: 'AI & Agents',
  },
  'Lifestyle': {
    queries: ['travel health fitness food', 'game entertainment hobby'],
    keywords: ['travel', 'health', 'fitness', 'food', 'recipe', 'sport', 'game', 'hobby', 'weather', 'entertainment', 'movie', 'book', 'shopping', 'restaurant', 'hotel', 'flight', 'nutrition', 'workout'],
    label: 'Lifestyle & More',
  },
}

function matchesCategory(skill: ClawHubSkill, cat: string): boolean {
  const config = CATEGORY_CONFIG[cat]
  if (!config) return true
  const hay = `${skill.displayName} ${skill.summary} ${skill.originalSummary ?? ''} ${skill.name}`.toLowerCase()
  return config.keywords.some((kw) => hay.includes(kw))
}

async function translateSkill(skill: ClawHubSkill): Promise<ClawHubSkill> {
  const [displayName, summary] = await Promise.all([
    translateToEnglish(skill.displayName),
    translateToEnglish(skill.summary),
  ])
  return {
    ...skill,
    displayName,
    summary,
    originalDisplayName: displayName !== skill.displayName ? skill.displayName : undefined,
    originalSummary: summary !== skill.summary ? skill.summary : undefined,
  }
}

interface ClawHubSkill {
  name: string
  displayName: string
  summary: string
  latestVersion: string
  ownerHandle: string
  channel: string
  isOfficial: boolean
  verificationTier?: string
  originalSummary?: string
  originalDisplayName?: string
}

// ── Skills.sh ─────────────────────────────────────────────────────────────────

const SKILLSSH_CATEGORIES = [
  'All', 'Developer', 'AI & Agents', 'Database', 'Design', 'Web3',
  'Marketing', 'Data & Analytics', 'Scraping', 'Media', 'Cloud',
]

interface SkillsShSkill {
  slug: string         // "owner/repo" — used as unique key
  displayName: string
  summary: string
  category: string
  owner: string
  isOfficial: boolean
}

const SKILLSSH_SKILLS: SkillsShSkill[] = [
  // Developer
  { slug: 'github/git-commit', owner: 'github', displayName: 'Git Commit', summary: 'Generates structured, meaningful commit messages from your staged changes.', category: 'Developer', isOfficial: true },
  { slug: 'github/gh-cli', owner: 'github', displayName: 'GitHub CLI', summary: 'Full GitHub CLI integration — PRs, issues, repos, actions from your agent.', category: 'Developer', isOfficial: true },
  { slug: 'github/refactor', owner: 'github', displayName: 'Refactor', summary: 'Identifies and applies code refactoring patterns to improve readability and maintainability.', category: 'Developer', isOfficial: true },
  { slug: 'github/documentation-writer', owner: 'github', displayName: 'Documentation Writer', summary: 'Auto-generates inline docs, README files, and API references from your code.', category: 'Developer', isOfficial: true },
  { slug: 'cloudflare/wrangler', owner: 'cloudflare', displayName: 'Cloudflare Wrangler', summary: 'Deploy and manage Cloudflare Workers, Pages, and D1 databases with ease.', category: 'Developer', isOfficial: true },
  { slug: 'expo/expo-deployment', owner: 'expo', displayName: 'Expo Deployment', summary: 'Build, submit, and deploy React Native apps to the App Store and Google Play.', category: 'Developer', isOfficial: true },
  { slug: 'vercel-labs/vercel-react-best-practices', owner: 'vercel-labs', displayName: 'React Best Practices', summary: 'Enforces Vercel and React performance patterns — memoization, server components, lazy loading.', category: 'Developer', isOfficial: false },
  { slug: 'firebase/firebase-basics', owner: 'firebase', displayName: 'Firebase Basics', summary: 'Firebase setup, auth, Firestore, and Storage integration patterns for web and mobile.', category: 'Developer', isOfficial: true },
  // AI & Agents
  { slug: 'anthropics/mcp-builder', owner: 'anthropics', displayName: 'MCP Builder', summary: 'Build and deploy Model Context Protocol servers. Add tools, resources, and prompts to any MCP host.', category: 'AI & Agents', isOfficial: true },
  { slug: 'anthropics/skill-creator', owner: 'anthropics', displayName: 'Skill Creator', summary: 'Generate new agent skills from a description — handles packaging, metadata, and publishing.', category: 'AI & Agents', isOfficial: true },
  { slug: 'anthropics/claude-api', owner: 'anthropics', displayName: 'Claude API', summary: 'Best practices for integrating the Claude API — streaming, tool use, prompt caching, vision.', category: 'AI & Agents', isOfficial: true },
  { slug: 'browser-use/browser-use', owner: 'browser-use', displayName: 'Browser Use', summary: 'Give your agent a real browser — navigate pages, fill forms, extract data, and interact with web UIs.', category: 'AI & Agents', isOfficial: false },
  { slug: 'mastra/skills', owner: 'mastra', displayName: 'Mastra', summary: 'TypeScript AI agent framework — build, test, and deploy agents with memory, tools, and workflows.', category: 'AI & Agents', isOfficial: false },
  { slug: 'langchain/langchain-skills', owner: 'langchain', displayName: 'LangChain', summary: 'LLM orchestration patterns — chains, agents, memory, and retrieval-augmented generation.', category: 'AI & Agents', isOfficial: true },
  { slug: 'vercel-labs/agent-browser', owner: 'vercel-labs', displayName: 'Agent Browser', summary: 'Headless browser automation built for AI agents — scrape, screenshot, and interact with any site.', category: 'AI & Agents', isOfficial: false },
  // Database
  { slug: 'supabase/agent-skills', owner: 'supabase', displayName: 'Supabase', summary: 'Postgres database best practices, row-level security, real-time subscriptions, and Edge Functions.', category: 'Database', isOfficial: true },
  { slug: 'neon/agent-skills', owner: 'neon', displayName: 'Neon Postgres', summary: 'Serverless Postgres on Neon — branching, autoscaling, and connection pooling patterns.', category: 'Database', isOfficial: true },
  { slug: 'prisma/skills', owner: 'prisma', displayName: 'Prisma ORM', summary: 'Type-safe database access with Prisma — schema design, migrations, and query optimization.', category: 'Database', isOfficial: true },
  { slug: 'redis/agent-skills', owner: 'redis', displayName: 'Redis', summary: 'In-memory caching, pub/sub messaging, and session management with Redis.', category: 'Database', isOfficial: true },
  { slug: 'planetscale/database-skills', owner: 'planetscale', displayName: 'PlanetScale', summary: 'MySQL-compatible serverless database — branching workflow and zero-downtime schema changes.', category: 'Database', isOfficial: true },
  // Design
  { slug: 'figma/implement-design', owner: 'figma', displayName: 'Figma to Code', summary: 'Convert Figma designs to production-ready React, HTML, or CSS with pixel-perfect accuracy.', category: 'Design', isOfficial: true },
  { slug: 'shadcn/ui', owner: 'shadcn', displayName: 'shadcn/ui', summary: 'Build beautiful UIs with shadcn components — accessible, customizable, and Tailwind-powered.', category: 'Design', isOfficial: false },
  { slug: 'anthropics/canvas-design', owner: 'anthropics', displayName: 'Canvas Design', summary: 'Interactive visual design and rendering on HTML Canvas — charts, diagrams, and custom graphics.', category: 'Design', isOfficial: true },
  { slug: 'anthropics/theme-factory', owner: 'anthropics', displayName: 'Theme Factory', summary: 'Generate and apply consistent color themes, typography scales, and spacing systems.', category: 'Design', isOfficial: true },
  { slug: 'figma/create-design-system-rules', owner: 'figma', displayName: 'Design System Rules', summary: 'Define and enforce design system tokens, components, and patterns across your codebase.', category: 'Design', isOfficial: true },
  // Web3
  { slug: 'coinbase/trade', owner: 'coinbase', displayName: 'Coinbase Trade', summary: 'Execute cryptocurrency trades via Coinbase — market orders, limit orders, and portfolio management.', category: 'Web3', isOfficial: true },
  { slug: 'coinbase/send-usdc', owner: 'coinbase', displayName: 'Send USDC', summary: 'Programmatically send USDC stablecoin transfers on Base and other EVM chains.', category: 'Web3', isOfficial: true },
  { slug: 'coinbase/authenticate-wallet', owner: 'coinbase', displayName: 'Wallet Auth', summary: 'Authenticate users with their crypto wallet — Sign-In with Ethereum and Base account patterns.', category: 'Web3', isOfficial: true },
  { slug: 'base/deploying-contracts-on-base', owner: 'base', displayName: 'Deploy Contracts', summary: 'Deploy and verify smart contracts on Base — Foundry/Hardhat patterns and gas optimization.', category: 'Web3', isOfficial: true },
  { slug: 'base/building-with-base-account', owner: 'base', displayName: 'Base Account', summary: 'Build apps on Base with smart wallets, account abstraction, and gasless transactions.', category: 'Web3', isOfficial: true },
  // Marketing
  { slug: 'coreyhaines31/seo-audit', owner: 'coreyhaines31', displayName: 'SEO Audit', summary: 'Comprehensive SEO analysis — technical issues, keyword gaps, backlink opportunities, and fixes.', category: 'Marketing', isOfficial: false },
  { slug: 'apify/apify-market-research', owner: 'apify', displayName: 'Market Research', summary: 'Automated market research — competitor analysis, pricing intelligence, and trend detection.', category: 'Marketing', isOfficial: true },
  { slug: 'apify/apify-lead-generation', owner: 'apify', displayName: 'Lead Generation', summary: 'Find and qualify B2B leads from LinkedIn, company websites, and public directories.', category: 'Marketing', isOfficial: true },
  // Data & Analytics
  { slug: 'datadog/dd-pup', owner: 'datadog', displayName: 'Datadog Monitor', summary: 'Query metrics, create monitors, and manage alerts. Full observability from your agent.', category: 'Data & Analytics', isOfficial: true },
  { slug: 'posthog/posthog', owner: 'posthog', displayName: 'PostHog Analytics', summary: 'Query user events, manage feature flags, and analyze funnels with PostHog.', category: 'Data & Analytics', isOfficial: true },
  { slug: 'tinybird/tinybird-agent-skills', owner: 'tinybird', displayName: 'Tinybird', summary: 'Real-time analytics at scale — ingest events, build APIs, and query billions of rows instantly.', category: 'Data & Analytics', isOfficial: true },
  { slug: 'dagster/dagster-expert', owner: 'dagster', displayName: 'Dagster', summary: 'Build and orchestrate data pipelines — assets, jobs, schedules, and sensors in one place.', category: 'Data & Analytics', isOfficial: true },
  // Scraping
  { slug: 'firecrawl/firecrawl', owner: 'firecrawl', displayName: 'Firecrawl', summary: 'Turn any website into clean LLM-ready data — crawl, scrape, and extract structured content.', category: 'Scraping', isOfficial: true },
  { slug: 'apify/apify-ultimate-scraper', owner: 'apify', displayName: 'Apify Scraper', summary: 'Enterprise web scraping — handle anti-bot measures, proxies, and large-scale extraction.', category: 'Scraping', isOfficial: true },
  { slug: 'brave/web-search', owner: 'brave', displayName: 'Brave Search', summary: 'Privacy-first web, news, and image search with clean JSON results and no tracking.', category: 'Scraping', isOfficial: true },
  { slug: 'browserbase/browser', owner: 'browserbase', displayName: 'Browserbase', summary: 'Scalable cloud browsers for agents — run headless Chromium with stealth and residential proxies.', category: 'Scraping', isOfficial: true },
  // Media
  { slug: 'elevenlabs/text-to-speech', owner: 'elevenlabs', displayName: 'ElevenLabs TTS', summary: 'Ultra-realistic voice generation — clone voices, generate audio, and create multilingual speech.', category: 'Media', isOfficial: true },
  { slug: 'elevenlabs/speech-to-text', owner: 'elevenlabs', displayName: 'Speech to Text', summary: 'Accurate transcription with speaker diarization, timestamps, and multi-language support.', category: 'Media', isOfficial: true },
  { slug: 'remotion/skills', owner: 'remotion', displayName: 'Remotion Video', summary: 'Programmatically create and render videos with React — animations, captions, and dynamic content.', category: 'Media', isOfficial: true },
  // Cloud
  { slug: 'vercel/ai', owner: 'vercel', displayName: 'Vercel AI SDK', summary: 'Build AI-powered Next.js apps — streaming UIs, model switching, and edge-ready deployments.', category: 'Cloud', isOfficial: true },
  { slug: 'cloudflare/cloudflare', owner: 'cloudflare', displayName: 'Cloudflare Workers', summary: 'Deploy serverless functions globally — edge computing, caching, and KV storage at scale.', category: 'Cloud', isOfficial: true },
  { slug: 'microsoft/azure-skills', owner: 'microsoft', displayName: 'Azure', summary: 'Full Azure cloud stack — compute, storage, AI services, and infrastructure as code.', category: 'Cloud', isOfficial: true },
  { slug: 'firebase/firebase-auth-basics', owner: 'firebase', displayName: 'Firebase Auth', summary: 'Add authentication to any app — email/password, OAuth, phone, and anonymous sign-in.', category: 'Cloud', isOfficial: true },
]

// ── Local skill card ─────────────────────────────────────────────────────────
function LocalSkillCard({ skill }: { skill: Skill }) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/skill/${skill.id}`)}>
      <View style={styles.cardHeader}>
        <Text style={[styles.skillName, { flex: 1 }]} numberOfLines={2}>{skill.name}</Text>
        <View style={styles.installBtn}><Text style={styles.installBtnText}>Install</Text></View>
      </View>
      <Text style={styles.skillDesc} numberOfLines={2}>{skill.description}</Text>
      <View style={styles.cardFooter}>
        <View style={styles.anthropicBadge}>
          <Text style={styles.anthropicBadgeText}>Anthropic</Text>
        </View>
        {skill.category && (
          <View style={styles.categoryBadge}><Text style={styles.categoryBadgeText}>{skill.category}</Text></View>
        )}
      </View>
    </TouchableOpacity>
  )
}

// ── ClawHub skill card ───────────────────────────────────────────────────────
interface ClawHubSkillCardProps {
  skill: ClawHubSkill
  onInstall: (skill: ClawHubSkill) => void
  installing: boolean
  installed: boolean
  activeCategory: string
}

function ClawHubSkillCard({ skill, onInstall, installing, installed, activeCategory }: ClawHubSkillCardProps) {
  const catLabel = activeCategory !== 'All'
    ? activeCategory
    : CLAWHUB_CATEGORIES.slice(1).find((cat) => matchesCategory(skill, cat)) ?? null

  return (
    <TouchableOpacity
      style={[styles.card, installed && styles.cardInstalled]}
      activeOpacity={0.8}
      onPress={() => router.push(`/skill/clawhub/${skill.name}`)}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.skillName, { flex: 1 }]} numberOfLines={2}>{skill.displayName}</Text>
        {installed ? (
          <View style={styles.installedBadge}><Text style={styles.installedBadgeText}>Installed ✓</Text></View>
        ) : (
          <TouchableOpacity
            style={[styles.installBtn, installing && styles.installBtnLoading]}
            onPress={(e) => { e.stopPropagation?.(); onInstall(skill) }}
            disabled={installing}
          >
            {installing
              ? <ActivityIndicator size="small" color={Colors.bgPrimary} />
              : <Text style={styles.installBtnText}>Install</Text>
            }
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.skillDesc} numberOfLines={2}>{skill.summary || 'No description.'}</Text>
      {skill.originalSummary ? (
        <Text style={styles.skillDescOriginal} numberOfLines={1}>{skill.originalSummary}</Text>
      ) : null}
      <View style={styles.cardFooter}>
        <Text style={styles.sourceLabelClawhub}>ClawHub</Text>
        {skill.verificationTier && (
          <View style={styles.verifiedBadge}><Text style={styles.verifiedBadgeText}>✓ Verified</Text></View>
        )}
        {catLabel && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{catLabel}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

// ── Skills.sh skill card ─────────────────────────────────────────────────────
interface SkillsShSkillCardProps {
  skill: SkillsShSkill
  onInstall: (skill: SkillsShSkill) => void
  installing: boolean
  installed: boolean
}

function SkillsShSkillCard({ skill, onInstall, installing, installed }: SkillsShSkillCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, installed && styles.cardInstalled]}
      activeOpacity={0.8}
      onPress={() => router.push(`/skill/skillssh/${encodeURIComponent(skill.slug)}`)}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.skillName, { flex: 1 }]} numberOfLines={2}>{skill.displayName}</Text>
        {installed ? (
          <View style={styles.installedBadge}><Text style={styles.installedBadgeText}>Installed ✓</Text></View>
        ) : (
          <TouchableOpacity
            style={[styles.installBtn, installing && styles.installBtnLoading]}
            onPress={(e) => { e.stopPropagation?.(); onInstall(skill) }}
            disabled={installing}
          >
            {installing
              ? <ActivityIndicator size="small" color={Colors.bgPrimary} />
              : <Text style={styles.installBtnText}>Install</Text>
            }
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.skillDesc} numberOfLines={2}>{skill.summary}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.sourceLabelSkillssh}>Skills.sh</Text>
        {skill.isOfficial && (
          <View style={styles.verifiedBadge}><Text style={styles.verifiedBadgeText}>✓ Official</Text></View>
        )}
        <View style={styles.categoryBadgeSkillssh}>
          <Text style={styles.categoryBadgeSkillsshText}>{skill.category}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

// ── Saved skill card ─────────────────────────────────────────────────────────
function SavedSkillCard({ skill }: { skill: SavedSkill }) {
  const { unsave } = useSavedSkillsStore()

  const route =
    skill.source === 'clawhub' ? `/skill/clawhub/${skill.id}` :
    skill.source === 'skillssh' ? `/skill/skillssh/${encodeURIComponent(skill.id)}` :
    `/skill/${skill.id}`

  const sourceLabel =
    skill.source === 'clawhub' ? 'ClawHub' :
    skill.source === 'skillssh' ? 'Skills.sh' :
    'Anthropic'

  const sourceLabelStyle =
    skill.source === 'clawhub' ? styles.sourceLabelClawhub :
    skill.source === 'skillssh' ? styles.sourceLabelSkillssh :
    styles.sourceLabelAnthropic

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => router.push(route as any)}>
      <View style={styles.cardHeader}>
        <Text style={[styles.skillName, { flex: 1 }]} numberOfLines={2}>{skill.name}</Text>
        <TouchableOpacity onPress={() => unsave(skill.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="bookmark" size={18} color={Colors.accentCrimson} />
        </TouchableOpacity>
      </View>
      <View style={styles.cardFooter}>
        <Text style={sourceLabelStyle}>{sourceLabel}</Text>
        {skill.category ? (
          <View style={styles.categoryBadge}><Text style={styles.categoryBadgeText}>{skill.category}</Text></View>
        ) : null}
        <Text style={styles.savedDate}>
          Saved {new Date(skill.savedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function SkillsScreen() {
  const { skills, setSkills } = useSkillsStore()
  const { agents, getConnectionStatus } = useAgentsStore()
  const { user } = useAuthStore()
  const showToast = useUIStore((s) => s.showToast)

  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [activeSource, setActiveSource] = useState<'all' | 'anthropic' | 'clawhub' | 'skillssh' | 'saved'>('all')
  const { saved: savedSkills } = useSavedSkillsStore()
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [clawHubSkills, setClawHubSkills] = useState<ClawHubSkill[]>([])
  const [searchResults, setSearchResults] = useState<ClawHubSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searching, setSearching] = useState(false)

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  useEffect(() => {
    if (selectedAgentId) return
    const connected = agents.find((a) => getConnectionStatus(a.id) === 'connected')
    if (connected) setSelectedAgentId(connected.id)
    else if (agents.length > 0) setSelectedAgentId(agents[0].id)
  }, [agents])

  const selectedAgent = agents.find((a) => a.id === selectedAgentId)

  const [installingSlug, setInstallingSlug] = useState<string | null>(null)
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set())

  const loadInstalledSlugs = useCallback((agentId: string) => {
    supabase
      .from('agent_skills')
      .select('skill_slug')
      .eq('agent_id', agentId)
      .eq('status', 'active')
      .then(({ data }) => {
        if (data) setInstalledSlugs(new Set(data.map((r: any) => r.skill_slug as string)))
      })
  }, [])

  useEffect(() => {
    if (selectedAgentId) loadInstalledSlugs(selectedAgentId)
  }, [selectedAgentId])

  const selectedAgentIdRef = useRef(selectedAgentId)
  selectedAgentIdRef.current = selectedAgentId
  useFocusEffect(useCallback(() => {
    if (selectedAgentIdRef.current) loadInstalledSlugs(selectedAgentIdRef.current)
  }, [loadInstalledSlugs]))

  useEffect(() => {
    supabase.from('skills').select('*').then(({ data }) => { if (data) setSkills(data) })
  }, [])

  // Fetch ClawHub skills for active category
  const fetchSkills = useCallback(async () => {
    try {
      let items: ClawHubSkill[] = []
      if (activeCategory === 'All') {
        const data = await fetch(`${CLAWHUB}/packages?family=skill&limit=30`).then((r) => r.json())
        items = (data.items ?? []).map((s: any) => ({ ...s, name: s.slug ?? s.name }))
      } else {
        const config = CATEGORY_CONFIG[activeCategory]
        if (config) {
          const seen = new Set<string>()
          const responses = await Promise.allSettled(
            config.queries.map((q) =>
              fetch(`${CLAWHUB}/search?q=${encodeURIComponent(q)}&limit=30`).then((r) => r.json())
            )
          )
          for (const res of responses) {
            if (res.status !== 'fulfilled') continue
            for (const s of (res.value.results ?? res.value.items ?? [])) {
              const skill: ClawHubSkill = { ...s, name: s.slug ?? s.name }
              if (!seen.has(skill.name)) { seen.add(skill.name); items.push(skill) }
            }
          }
          items = items.filter((s) => matchesCategory(s, activeCategory))
        }
      }
      const translated = await Promise.all(items.map(translateSkill))
      setClawHubSkills(translated)
    } catch {}
    setLoading(false)
  }, [activeCategory])

  useEffect(() => {
    setLoading(true)
    fetchSkills()
  }, [fetchSkills])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchSkills()
    setRefreshing(false)
  }, [fetchSkills])

  // Search — filtered by active category keywords when one is selected
  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`${CLAWHUB}/search?q=${encodeURIComponent(query)}&limit=40`)
        const data = await r.json()
        let results: ClawHubSkill[] = (data.results ?? []).map((s: any) => ({ ...s, name: s.slug ?? s.name }))
        if (activeCategory !== 'All') {
          results = results.filter((s) => matchesCategory(s, activeCategory))
        }
        const translated = await Promise.all(results.map(translateSkill))
        setSearchResults(translated)
      } catch {}
      setSearching(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [query, activeCategory])

  const handleInstall = useCallback(async (skill: ClawHubSkill) => {
    if (!user) { showToast('Not logged in'); return }
    if (!selectedAgentId) { showToast('No agent selected'); return }
    const agent = agents.find((a) => a.id === selectedAgentId)
    if (!agent) return

    setInstallingSlug(skill.name)
    try {
      const skillName = skill.displayName ?? skill.name
      const version = skill.latestVersion ?? '1.0.0'

      const { error: upsertError } = await supabase.from('agent_skills').upsert({
        agent_id: selectedAgentId,
        skill_slug: skill.name,
        config: { displayName: skillName, version },
        status: 'active',
      }, { onConflict: 'agent_id,skill_slug' })

      if (upsertError) throw new Error(upsertError.message)

      const { data: freshSlugs } = await supabase
        .from('agent_skills')
        .select('skill_slug')
        .eq('agent_id', selectedAgentId)
        .eq('status', 'active')
      if (freshSlugs) setInstalledSlugs(new Set(freshSlugs.map((r: any) => r.skill_slug)))

      showToast(`${skillName} installed on ${agent.name}`)
    } catch (err: any) {
      showToast(`Install failed: ${err?.message ?? 'unknown error'}`)
    }
    setInstallingSlug(null)
  }, [agents, selectedAgentId, user, showToast])

  const handleInstallSkillsSh = useCallback(async (skill: SkillsShSkill) => {
    if (!user) { showToast('Not logged in'); return }
    if (!selectedAgentId) { showToast('No agent selected'); return }
    const agent = agents.find((a) => a.id === selectedAgentId)
    if (!agent) return

    setInstallingSlug(skill.slug)
    try {
      const { error: upsertError } = await supabase.from('agent_skills').upsert({
        agent_id: selectedAgentId,
        skill_slug: skill.slug,
        config: { displayName: skill.displayName, source: 'skillssh', owner: skill.owner },
        status: 'active',
      }, { onConflict: 'agent_id,skill_slug' })

      if (upsertError) throw new Error(upsertError.message)

      const { data: freshSlugs } = await supabase
        .from('agent_skills')
        .select('skill_slug')
        .eq('agent_id', selectedAgentId)
        .eq('status', 'active')
      if (freshSlugs) setInstalledSlugs(new Set(freshSlugs.map((r: any) => r.skill_slug)))

      showToast(`${skill.displayName} installed on ${agent.name}`)
    } catch (err: any) {
      showToast(`Install failed: ${err?.message ?? 'unknown error'}`)
    }
    setInstallingSlug(null)
  }, [agents, selectedAgentId, user, showToast])

  const displayedClawHub = query.trim() ? searchResults : clawHubSkills

  const anthropicCategories = ['All', ...Array.from(new Set(skills.map((s) => s.category).filter(Boolean) as string[]))]
  const activeCategoryList =
    activeSource === 'anthropic' ? anthropicCategories :
    activeSource === 'skillssh' ? SKILLSSH_CATEGORIES :
    CLAWHUB_CATEGORIES

  const filteredLocalSkills = skills.filter((s) =>
    (activeCategory === 'All' || s.category === activeCategory) &&
    (!query.trim() || s.name.toLowerCase().includes(query.toLowerCase()) || s.description.toLowerCase().includes(query.toLowerCase()))
  )

  const filteredClawHub = (activeSource === 'anthropic' || activeSource === 'skillssh' || activeSource === 'saved')
    ? []
    : verifiedOnly
      ? displayedClawHub.filter((s) => !!s.verificationTier)
      : displayedClawHub

  const localSkillsToShow = (activeSource === 'clawhub' || activeSource === 'skillssh' || activeSource === 'saved') ? [] : filteredLocalSkills

  const filteredSkillsSh = (activeSource !== 'skillssh') ? [] : SKILLSSH_SKILLS.filter((s) => {
    const matchesCat = activeCategory === 'All' || s.category === activeCategory
    const matchesQuery = !query.trim() || s.displayName.toLowerCase().includes(query.toLowerCase()) || s.summary.toLowerCase().includes(query.toLowerCase())
    const matchesVerified = !verifiedOnly || s.isOfficial
    return matchesCat && matchesQuery && matchesVerified
  })

  const sectionLabel = activeCategory !== 'All'
    ? (CATEGORY_CONFIG[activeCategory]?.label ?? activeCategory)
    : 'Featured on ClawHub'

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Skills</Text>
        <Text style={styles.subtitle}>{clawHubSkills.length + skills.length} available</Text>
      </View>

      {/* Top filter row */}
      <View style={styles.topFilterWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topFilterRow}>
          {agents.length > 0 && (
            <TouchableOpacity style={styles.agentChip} onPress={() => setDropdownOpen(true)} activeOpacity={0.8}>
              <View style={[styles.agentDot, {
                backgroundColor: selectedAgent
                  ? (getConnectionStatus(selectedAgent.id) === 'connected' ? Colors.accentGreen : Colors.textMuted)
                  : Colors.textMuted
              }]} />
              <Text style={styles.agentChipText}>{selectedAgent ? selectedAgent.name : 'Select agent'}</Text>
              <Ionicons name="chevron-down" size={12} color={Colors.accentCrimson} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.sourceChip, activeSource === 'clawhub' && styles.sourceChipClawhubActive]}
            onPress={() => { setActiveSource((s) => s === 'clawhub' ? 'all' : 'clawhub'); setActiveCategory('All') }}
          >
            <Text style={[styles.sourceChipText, activeSource === 'clawhub' && styles.sourceChipClawhubTextActive]}>ClawHub</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sourceChip, activeSource === 'skillssh' && styles.sourceChipSkillsshActive]}
            onPress={() => { setActiveSource((s) => s === 'skillssh' ? 'all' : 'skillssh'); setActiveCategory('All') }}
          >
            <Text style={[styles.sourceChipText, activeSource === 'skillssh' && styles.sourceChipSkillsshTextActive]}>Skills.sh</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sourceChip, activeSource === 'anthropic' && styles.sourceChipAnthropicActive]}
            onPress={() => { setActiveSource((s) => s === 'anthropic' ? 'all' : 'anthropic'); setActiveCategory('All') }}
          >
            <Text style={[styles.sourceChipText, activeSource === 'anthropic' && styles.sourceChipAnthropicTextActive]}>Anthropic</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sourceChip, styles.verifiedFilterChip, verifiedOnly && styles.verifiedFilterChipActive]}
            onPress={() => setVerifiedOnly((v) => !v)}
          >
            <Ionicons name="shield-checkmark" size={12} color={verifiedOnly ? '#60a5fa' : Colors.textSecondary} style={{ marginRight: 4 }} />
            <Text style={[styles.sourceChipText, verifiedOnly && styles.verifiedFilterTextActive]}>Verified</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sourceChip, activeSource === 'saved' && styles.sourceChipSavedActive]}
            onPress={() => { setActiveSource((s) => s === 'saved' ? 'all' : 'saved'); setActiveCategory('All') }}
          >
            <Ionicons name="bookmark" size={12} color={activeSource === 'saved' ? Colors.accentCrimson : Colors.textSecondary} style={{ marginRight: 4 }} />
            <Text style={[styles.sourceChipText, activeSource === 'saved' && styles.sourceChipSavedTextActive]}>
              Saved{savedSkills.length > 0 ? ` (${savedSkills.length})` : ''}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Agent dropdown modal */}
      <Modal visible={dropdownOpen} transparent animationType="fade" onRequestClose={() => setDropdownOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownOpen(false)}>
          <View style={styles.dropdownMenu}>
            <Text style={styles.dropdownMenuLabel}>Install skills on</Text>
            {agents.map((a) => {
              const status = getConnectionStatus(a.id)
              return (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.dropdownItem, selectedAgentId === a.id && styles.dropdownItemActive]}
                  onPress={() => { setSelectedAgentId(a.id); loadInstalledSlugs(a.id); setDropdownOpen(false) }}
                >
                  <View style={[styles.agentDot, { backgroundColor: status === 'connected' ? Colors.accentGreen : Colors.textMuted }]} />
                  <Text style={[styles.dropdownItemText, selectedAgentId === a.id && styles.dropdownItemTextActive]}>{a.name}</Text>
                  {selectedAgentId === a.id && <Ionicons name="checkmark" size={16} color={Colors.accentCrimson} />}
                </TouchableOpacity>
              )
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search skills..."
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && <ActivityIndicator size="small" color={Colors.accentTeal} style={styles.searchSpinner} />}
      </View>

      {/* Category chips — only when a source is selected */}
      {!query.trim() && activeSource !== 'all' && (
        <View style={styles.chipRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {activeCategoryList.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, activeCategory === cat && styles.categoryChipActive]}
                onPress={() => setActiveCategory(cat)}
              >
                <Text style={[styles.categoryChipText, activeCategory === cat && styles.categoryChipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={[]}
        keyExtractor={() => ''}
        renderItem={() => null}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accentCrimson} />
        }
        ListHeaderComponent={
          <>
            {activeSource === 'saved' && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>Saved Skills</Text>
                </View>
                {savedSkills.length === 0 ? (
                  <Text style={styles.emptyText}>No saved skills yet. Tap ⊕ on any skill detail to save it.</Text>
                ) : (
                  savedSkills.map((s) => <SavedSkillCard key={s.id} skill={s} />)
                )}
              </>
            )}
            {activeSource !== 'anthropic' && activeSource !== 'skillssh' && activeSource !== 'saved' && (
              <>
                {activeCategory !== 'All' && (
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>{sectionLabel}</Text>
                    {loading && <ActivityIndicator size="small" color={Colors.accentTeal} />}
                  </View>
                )}
                {loading && activeCategory === 'All' && (
                  <View style={styles.sectionHeader}>
                    <ActivityIndicator size="small" color={Colors.accentTeal} />
                  </View>
                )}
                {!loading && filteredClawHub.length === 0 && (
                  <Text style={styles.emptyText}>No skills found</Text>
                )}
                {filteredClawHub.map((s) => (
                  <ClawHubSkillCard
                    key={s.name}
                    skill={s}
                    onInstall={handleInstall}
                    installing={installingSlug === s.name}
                    installed={installedSlugs.has(s.name)}
                    activeCategory={activeCategory}
                  />
                ))}
              </>
            )}
            {filteredSkillsSh.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>
                    {activeCategory !== 'All' ? activeCategory : 'Featured on Skills.sh'}
                  </Text>
                </View>
                {filteredSkillsSh.map((s) => (
                  <SkillsShSkillCard
                    key={s.slug}
                    skill={s}
                    onInstall={handleInstallSkillsSh}
                    installing={installingSlug === s.slug}
                    installed={installedSlugs.has(s.slug)}
                  />
                ))}
              </>
            )}
            {activeSource === 'skillssh' && filteredSkillsSh.length === 0 && activeSource !== 'saved' && (
              <Text style={styles.emptyText}>No skills found</Text>
            )}
            {localSkillsToShow.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>Anthropic</Text>
                </View>
                {localSkillsToShow.map((s) => (
                  <LocalSkillCard key={s.id} skill={s} />
                ))}
              </>
            )}
          </>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },

  topFilterWrapper: { height: 52 },
  topFilterRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center', height: 52 },

  agentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(255,69,58,0.08)', borderRadius: 20,
    borderWidth: 1, borderColor: Colors.accentCrimson,
    paddingHorizontal: 14, paddingVertical: 9, flexShrink: 0,
  },
  agentChipText: { fontSize: 13, fontWeight: '600', color: Colors.accentCrimson },
  agentDot: { width: 7, height: 7, borderRadius: 4 },

  sourceChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 20, backgroundColor: Colors.bgElevated,
    borderWidth: 1, borderColor: Colors.bgBorder, flexShrink: 0,
  },
  sourceChipText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  sourceChipAnthropicActive: { backgroundColor: 'rgba(99,102,241,0.12)', borderColor: '#a5b4fc' },
  sourceChipAnthropicTextActive: { color: '#a5b4fc' },
  sourceChipClawhubActive: { backgroundColor: 'rgba(0,200,150,0.1)', borderColor: Colors.accentTeal },
  sourceChipClawhubTextActive: { color: Colors.accentTeal },
  sourceChipSkillsshActive: { backgroundColor: 'rgba(251,146,60,0.12)', borderColor: '#fb923c' },
  sourceChipSkillsshTextActive: { color: '#fb923c' },
  verifiedFilterChip: { borderColor: 'rgba(96,165,250,0.3)' },
  verifiedFilterChipActive: { backgroundColor: 'rgba(59,130,246,0.1)', borderColor: '#60a5fa' },
  verifiedFilterTextActive: { color: '#60a5fa' },
  sourceChipSavedActive: { backgroundColor: 'rgba(255,69,58,0.08)', borderColor: Colors.accentCrimson },
  sourceChipSavedTextActive: { color: Colors.accentCrimson },
  savedDate: { fontSize: 11, color: Colors.textMuted, marginLeft: 'auto' as any },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start', paddingTop: 180, paddingHorizontal: 16,
  },
  dropdownMenu: {
    backgroundColor: Colors.bgElevated, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.bgBorder, overflow: 'hidden',
  },
  dropdownMenuLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 1, textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
    borderTopWidth: 1, borderTopColor: Colors.bgBorder,
  },
  dropdownItemActive: { backgroundColor: 'rgba(255,69,58,0.06)' },
  dropdownItemText: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  dropdownItemTextActive: { color: Colors.accentCrimson, fontWeight: '600' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 4,
    backgroundColor: Colors.bgElevated, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.bgBorder, paddingHorizontal: 14,
  },
  searchInput: { flex: 1, height: 44, color: Colors.textPrimary, fontSize: 15 },
  searchSpinner: { marginLeft: 8 },

  chipRow: { height: 52 },
  categoryRow: { paddingHorizontal: 16, alignItems: 'center', gap: 8, height: 52 },
  categoryChip: {
    paddingHorizontal: 16, paddingVertical: 9,
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, backgroundColor: Colors.bgElevated,
    borderWidth: 1, borderColor: Colors.bgBorder, flexShrink: 0,
  },
  categoryChipActive: { borderColor: Colors.accentGreen, backgroundColor: 'rgba(0,200,150,0.08)' },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  categoryChipTextActive: { color: Colors.accentGreen, fontWeight: '700' },

  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
  emptyText: { color: Colors.textSecondary, textAlign: 'center', paddingVertical: 24 },

  card: { backgroundColor: '#0f0f0f', borderRadius: 16, padding: 16, gap: 8 },
  cardInstalled: { borderWidth: 1, borderColor: 'rgba(0,200,150,0.25)' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8, flexWrap: 'wrap' },
  skillName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  skillDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  skillDescOriginal: { color: Colors.textMuted, fontSize: 11, lineHeight: 16, fontStyle: 'italic' },
  anthropicBadge: { backgroundColor: 'rgba(99,102,241,0.12)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  anthropicBadgeText: { color: '#a5b4fc', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  sourceLabelClawhub: { fontSize: 11, fontWeight: '700', color: Colors.accentTeal, letterSpacing: 0.3 },
  sourceLabelSkillssh: { fontSize: 11, fontWeight: '700', color: '#fb923c', letterSpacing: 0.3 },
  sourceLabelAnthropic: { fontSize: 11, fontWeight: '700', color: '#a5b4fc', letterSpacing: 0.3 },
  categoryBadgeSkillssh: { backgroundColor: 'rgba(251,146,60,0.1)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  categoryBadgeSkillsshText: { color: '#fb923c', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  categoryBadge: { backgroundColor: 'rgba(0,200,150,0.10)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  categoryBadgeText: { color: Colors.accentGreen, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  verifiedBadge: { backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  verifiedBadgeText: { color: '#60a5fa', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  installBtn: {
    backgroundColor: Colors.accentCrimson, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 6,
    minWidth: 70, alignItems: 'center', justifyContent: 'center',
  },
  installBtnLoading: { opacity: 0.7 },
  installBtnText: { color: Colors.bgPrimary, fontSize: 13, fontWeight: '600' },
  installedBadge: { backgroundColor: 'rgba(0,200,150,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  installedBadgeText: { color: Colors.accentGreen, fontSize: 13, fontWeight: '600' },
})
