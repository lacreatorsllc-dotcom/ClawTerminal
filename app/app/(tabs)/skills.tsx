import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Modal, RefreshControl } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useSkillsStore } from '../../stores/skillsStore'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
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

// ── Main screen ──────────────────────────────────────────────────────────────
export default function SkillsScreen() {
  const { skills, setSkills } = useSkillsStore()
  const { agents, getConnectionStatus } = useAgentsStore()
  const { user } = useAuthStore()
  const showToast = useUIStore((s) => s.showToast)

  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [activeSource, setActiveSource] = useState<'all' | 'anthropic' | 'clawhub'>('all')
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

      await supabase.from('messages').insert({
        agent_id: selectedAgentId,
        user_id: user.id,
        direction: 'outbound',
        content: `Skill installed: ${skillName} v${version}`,
      })
    } catch (err: any) {
      showToast(`Install failed: ${err?.message ?? 'unknown error'}`)
    }
    setInstallingSlug(null)
  }, [agents, selectedAgentId, user, showToast])

  const displayedClawHub = query.trim() ? searchResults : clawHubSkills

  const anthropicCategories = ['All', ...Array.from(new Set(skills.map((s) => s.category).filter(Boolean) as string[]))]
  const activeCategoryList = activeSource === 'anthropic' ? anthropicCategories : CLAWHUB_CATEGORIES

  const filteredLocalSkills = skills.filter((s) =>
    (activeCategory === 'All' || s.category === activeCategory) &&
    (!query.trim() || s.name.toLowerCase().includes(query.toLowerCase()) || s.description.toLowerCase().includes(query.toLowerCase()))
  )

  const filteredClawHub = activeSource === 'anthropic'
    ? []
    : verifiedOnly
      ? displayedClawHub.filter((s) => !!s.verificationTier)
      : displayedClawHub

  const localSkillsToShow = activeSource === 'clawhub' ? [] : filteredLocalSkills

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
            {activeSource !== 'anthropic' && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>{sectionLabel}</Text>
                  {loading && <ActivityIndicator size="small" color={Colors.accentTeal} />}
                </View>
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
  verifiedFilterChip: { borderColor: 'rgba(96,165,250,0.3)' },
  verifiedFilterChipActive: { backgroundColor: 'rgba(59,130,246,0.1)', borderColor: '#60a5fa' },
  verifiedFilterTextActive: { color: '#60a5fa' },

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
