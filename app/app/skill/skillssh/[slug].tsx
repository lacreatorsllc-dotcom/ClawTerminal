import { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Linking } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAgentsStore } from '../../../stores/agentsStore'
import { useAuthStore } from '../../../stores/authStore'
import { useUIStore } from '../../../stores/uiStore'
import { Colors } from '../../../constants/colors'

// Inline the curated skill data — same source as skills.tsx
const SKILLSSH_SKILLS = [
  { slug: 'github/git-commit', owner: 'github', displayName: 'Git Commit', summary: 'Generates structured, meaningful commit messages from your staged changes.', category: 'Developer', isOfficial: true },
  { slug: 'github/gh-cli', owner: 'github', displayName: 'GitHub CLI', summary: 'Full GitHub CLI integration — PRs, issues, repos, actions from your agent.', category: 'Developer', isOfficial: true },
  { slug: 'github/refactor', owner: 'github', displayName: 'Refactor', summary: 'Identifies and applies code refactoring patterns to improve readability and maintainability.', category: 'Developer', isOfficial: true },
  { slug: 'github/documentation-writer', owner: 'github', displayName: 'Documentation Writer', summary: 'Auto-generates inline docs, README files, and API references from your code.', category: 'Developer', isOfficial: true },
  { slug: 'cloudflare/wrangler', owner: 'cloudflare', displayName: 'Cloudflare Wrangler', summary: 'Deploy and manage Cloudflare Workers, Pages, and D1 databases with ease.', category: 'Developer', isOfficial: true },
  { slug: 'expo/expo-deployment', owner: 'expo', displayName: 'Expo Deployment', summary: 'Build, submit, and deploy React Native apps to the App Store and Google Play.', category: 'Developer', isOfficial: true },
  { slug: 'vercel-labs/vercel-react-best-practices', owner: 'vercel-labs', displayName: 'React Best Practices', summary: 'Enforces Vercel and React performance patterns — memoization, server components, lazy loading.', category: 'Developer', isOfficial: false },
  { slug: 'firebase/firebase-basics', owner: 'firebase', displayName: 'Firebase Basics', summary: 'Firebase setup, auth, Firestore, and Storage integration patterns for web and mobile.', category: 'Developer', isOfficial: true },
  { slug: 'anthropics/mcp-builder', owner: 'anthropics', displayName: 'MCP Builder', summary: 'Build and deploy Model Context Protocol servers. Add tools, resources, and prompts to any MCP host.', category: 'AI & Agents', isOfficial: true },
  { slug: 'anthropics/skill-creator', owner: 'anthropics', displayName: 'Skill Creator', summary: 'Generate new agent skills from a description — handles packaging, metadata, and publishing.', category: 'AI & Agents', isOfficial: true },
  { slug: 'anthropics/claude-api', owner: 'anthropics', displayName: 'Claude API', summary: 'Best practices for integrating the Claude API — streaming, tool use, prompt caching, vision.', category: 'AI & Agents', isOfficial: true },
  { slug: 'browser-use/browser-use', owner: 'browser-use', displayName: 'Browser Use', summary: 'Give your agent a real browser — navigate pages, fill forms, extract data, and interact with web UIs.', category: 'AI & Agents', isOfficial: false },
  { slug: 'mastra/skills', owner: 'mastra', displayName: 'Mastra', summary: 'TypeScript AI agent framework — build, test, and deploy agents with memory, tools, and workflows.', category: 'AI & Agents', isOfficial: false },
  { slug: 'langchain/langchain-skills', owner: 'langchain', displayName: 'LangChain', summary: 'LLM orchestration patterns — chains, agents, memory, and retrieval-augmented generation.', category: 'AI & Agents', isOfficial: true },
  { slug: 'vercel-labs/agent-browser', owner: 'vercel-labs', displayName: 'Agent Browser', summary: 'Headless browser automation built for AI agents — scrape, screenshot, and interact with any site.', category: 'AI & Agents', isOfficial: false },
  { slug: 'supabase/agent-skills', owner: 'supabase', displayName: 'Supabase', summary: 'Postgres database best practices, row-level security, real-time subscriptions, and Edge Functions.', category: 'Database', isOfficial: true },
  { slug: 'neon/agent-skills', owner: 'neon', displayName: 'Neon Postgres', summary: 'Serverless Postgres on Neon — branching, autoscaling, and connection pooling patterns.', category: 'Database', isOfficial: true },
  { slug: 'prisma/skills', owner: 'prisma', displayName: 'Prisma ORM', summary: 'Type-safe database access with Prisma — schema design, migrations, and query optimization.', category: 'Database', isOfficial: true },
  { slug: 'redis/agent-skills', owner: 'redis', displayName: 'Redis', summary: 'In-memory caching, pub/sub messaging, and session management with Redis.', category: 'Database', isOfficial: true },
  { slug: 'planetscale/database-skills', owner: 'planetscale', displayName: 'PlanetScale', summary: 'MySQL-compatible serverless database — branching workflow and zero-downtime schema changes.', category: 'Database', isOfficial: true },
  { slug: 'figma/implement-design', owner: 'figma', displayName: 'Figma to Code', summary: 'Convert Figma designs to production-ready React, HTML, or CSS with pixel-perfect accuracy.', category: 'Design', isOfficial: true },
  { slug: 'shadcn/ui', owner: 'shadcn', displayName: 'shadcn/ui', summary: 'Build beautiful UIs with shadcn components — accessible, customizable, and Tailwind-powered.', category: 'Design', isOfficial: false },
  { slug: 'anthropics/canvas-design', owner: 'anthropics', displayName: 'Canvas Design', summary: 'Interactive visual design and rendering on HTML Canvas — charts, diagrams, and custom graphics.', category: 'Design', isOfficial: true },
  { slug: 'anthropics/theme-factory', owner: 'anthropics', displayName: 'Theme Factory', summary: 'Generate and apply consistent color themes, typography scales, and spacing systems.', category: 'Design', isOfficial: true },
  { slug: 'figma/create-design-system-rules', owner: 'figma', displayName: 'Design System Rules', summary: 'Define and enforce design system tokens, components, and patterns across your codebase.', category: 'Design', isOfficial: true },
  { slug: 'coinbase/trade', owner: 'coinbase', displayName: 'Coinbase Trade', summary: 'Execute cryptocurrency trades via Coinbase — market orders, limit orders, and portfolio management.', category: 'Web3', isOfficial: true },
  { slug: 'coinbase/send-usdc', owner: 'coinbase', displayName: 'Send USDC', summary: 'Programmatically send USDC stablecoin transfers on Base and other EVM chains.', category: 'Web3', isOfficial: true },
  { slug: 'coinbase/authenticate-wallet', owner: 'coinbase', displayName: 'Wallet Auth', summary: 'Authenticate users with their crypto wallet — Sign-In with Ethereum and Base account patterns.', category: 'Web3', isOfficial: true },
  { slug: 'base/deploying-contracts-on-base', owner: 'base', displayName: 'Deploy Contracts', summary: 'Deploy and verify smart contracts on Base — Foundry/Hardhat patterns and gas optimization.', category: 'Web3', isOfficial: true },
  { slug: 'base/building-with-base-account', owner: 'base', displayName: 'Base Account', summary: 'Build apps on Base with smart wallets, account abstraction, and gasless transactions.', category: 'Web3', isOfficial: true },
  { slug: 'coreyhaines31/seo-audit', owner: 'coreyhaines31', displayName: 'SEO Audit', summary: 'Comprehensive SEO analysis — technical issues, keyword gaps, backlink opportunities, and fixes.', category: 'Marketing', isOfficial: false },
  { slug: 'apify/apify-market-research', owner: 'apify', displayName: 'Market Research', summary: 'Automated market research — competitor analysis, pricing intelligence, and trend detection.', category: 'Marketing', isOfficial: true },
  { slug: 'apify/apify-lead-generation', owner: 'apify', displayName: 'Lead Generation', summary: 'Find and qualify B2B leads from LinkedIn, company websites, and public directories.', category: 'Marketing', isOfficial: true },
  { slug: 'datadog/dd-pup', owner: 'datadog', displayName: 'Datadog Monitor', summary: 'Query metrics, create monitors, and manage alerts. Full observability from your agent.', category: 'Data & Analytics', isOfficial: true },
  { slug: 'posthog/posthog', owner: 'posthog', displayName: 'PostHog Analytics', summary: 'Query user events, manage feature flags, and analyze funnels with PostHog.', category: 'Data & Analytics', isOfficial: true },
  { slug: 'tinybird/tinybird-agent-skills', owner: 'tinybird', displayName: 'Tinybird', summary: 'Real-time analytics at scale — ingest events, build APIs, and query billions of rows instantly.', category: 'Data & Analytics', isOfficial: true },
  { slug: 'dagster/dagster-expert', owner: 'dagster', displayName: 'Dagster', summary: 'Build and orchestrate data pipelines — assets, jobs, schedules, and sensors in one place.', category: 'Data & Analytics', isOfficial: true },
  { slug: 'firecrawl/firecrawl', owner: 'firecrawl', displayName: 'Firecrawl', summary: 'Turn any website into clean LLM-ready data — crawl, scrape, and extract structured content.', category: 'Scraping', isOfficial: true },
  { slug: 'apify/apify-ultimate-scraper', owner: 'apify', displayName: 'Apify Scraper', summary: 'Enterprise web scraping — handle anti-bot measures, proxies, and large-scale extraction.', category: 'Scraping', isOfficial: true },
  { slug: 'brave/web-search', owner: 'brave', displayName: 'Brave Search', summary: 'Privacy-first web, news, and image search with clean JSON results and no tracking.', category: 'Scraping', isOfficial: true },
  { slug: 'browserbase/browser', owner: 'browserbase', displayName: 'Browserbase', summary: 'Scalable cloud browsers for agents — run headless Chromium with stealth and residential proxies.', category: 'Scraping', isOfficial: true },
  { slug: 'elevenlabs/text-to-speech', owner: 'elevenlabs', displayName: 'ElevenLabs TTS', summary: 'Ultra-realistic voice generation — clone voices, generate audio, and create multilingual speech.', category: 'Media', isOfficial: true },
  { slug: 'elevenlabs/speech-to-text', owner: 'elevenlabs', displayName: 'Speech to Text', summary: 'Accurate transcription with speaker diarization, timestamps, and multi-language support.', category: 'Media', isOfficial: true },
  { slug: 'remotion/skills', owner: 'remotion', displayName: 'Remotion Video', summary: 'Programmatically create and render videos with React — animations, captions, and dynamic content.', category: 'Media', isOfficial: true },
  { slug: 'vercel/ai', owner: 'vercel', displayName: 'Vercel AI SDK', summary: 'Build AI-powered Next.js apps — streaming UIs, model switching, and edge-ready deployments.', category: 'Cloud', isOfficial: true },
  { slug: 'cloudflare/cloudflare', owner: 'cloudflare', displayName: 'Cloudflare Workers', summary: 'Deploy serverless functions globally — edge computing, caching, and KV storage at scale.', category: 'Cloud', isOfficial: true },
  { slug: 'microsoft/azure-skills', owner: 'microsoft', displayName: 'Azure', summary: 'Full Azure cloud stack — compute, storage, AI services, and infrastructure as code.', category: 'Cloud', isOfficial: true },
  { slug: 'firebase/firebase-auth-basics', owner: 'firebase', displayName: 'Firebase Auth', summary: 'Add authentication to any app — email/password, OAuth, phone, and anonymous sign-in.', category: 'Cloud', isOfficial: true },
]

export default function SkillsShDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const decodedSlug = decodeURIComponent(slug ?? '')
  const { agents, getConnectionStatus } = useAgentsStore()
  const { user } = useAuthStore()
  const showToast = useUIStore((s) => s.showToast)

  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)

  const skill = SKILLSSH_SKILLS.find((s) => s.slug === decodedSlug)

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

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>‹ Skills</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.skillName}>{skill.displayName}</Text>

        <View style={styles.metaRow}>
          <View style={styles.providerBadge}><Text style={styles.providerBadgeText}>Skills.sh</Text></View>
          {skill.isOfficial && (
            <View style={styles.officialBadge}><Text style={styles.officialBadgeText}>✓ Official</Text></View>
          )}
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.meta}>by @{skill.owner}</Text>
          <Text style={styles.metaDot}>·</Text>
          <View style={styles.categoryBadge}><Text style={styles.categoryBadgeText}>{skill.category}</Text></View>
        </View>

        <Text style={styles.summary}>{skill.summary}</Text>

        <TouchableOpacity
          style={styles.viewOnWeb}
          onPress={() => Linking.openURL(`https://skills.sh/${skill.slug}`)}
        >
          <Text style={styles.viewOnWebText}>View on skills.sh ↗</Text>
        </TouchableOpacity>

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
              : <Text style={styles.installBtnText}>Install</Text>
            }
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  backBtn: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 8 },
  backBtnText: { color: Colors.accentCrimson, fontSize: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 24, paddingTop: 8, gap: 20, paddingBottom: 48 },
  skillName: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  providerBadge: { backgroundColor: 'rgba(251,146,60,0.12)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  providerBadgeText: { color: '#fb923c', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  officialBadge: { backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  officialBadgeText: { color: '#60a5fa', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  categoryBadge: { backgroundColor: 'rgba(251,146,60,0.1)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  categoryBadgeText: { color: '#fb923c', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  meta: { fontSize: 13, color: Colors.textSecondary },
  metaDot: { color: Colors.textMuted },
  summary: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22 },
  viewOnWeb: { paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(251,146,60,0.3)', borderRadius: 12 },
  viewOnWebText: { color: '#fb923c', fontSize: 14, fontWeight: '600' },
  installBtn: {
    backgroundColor: Colors.accentCrimson,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  installBtnLoading: { opacity: 0.7 },
  installBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '600' },
  installedBtn: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  installedBtnText: { color: Colors.accentGreen, fontSize: 16, fontWeight: '600' },
})
