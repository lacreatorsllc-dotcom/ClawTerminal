import { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useSkillsStore } from '../../stores/skillsStore'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { Colors } from '../../constants/colors'
import { translateToEnglish } from '../../lib/translate'
import type { Skill } from '../../lib/types'

const CLAWHUB = 'https://clawhub.ai/api/v1'

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
  originalSummary?: string
  originalDisplayName?: string
}

// ── Local skill card ────────────────────────────────────────────────────────
function LocalSkillCard({ skill }: { skill: Skill }) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/skill/${skill.id}`)}>
      <View style={styles.cardHeader}>
        <Text style={styles.skillName}>{skill.name}</Text>
        {skill.category && <View style={styles.badge}><Text style={styles.badgeText}>{skill.category}</Text></View>}
      </View>
      <Text style={styles.skillDesc} numberOfLines={2}>{skill.description}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.version}>v{skill.version}</Text>
        <TouchableOpacity style={styles.installBtn} onPress={() => router.push(`/skill/${skill.id}`)}>
          <Text style={styles.installBtnText}>Install</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
}

// ── ClawHub skill card ──────────────────────────────────────────────────────
interface ClawHubSkillCardProps {
  skill: ClawHubSkill
  onInstall: (skill: ClawHubSkill) => void
  installing: boolean
  installed: boolean
}

function ClawHubSkillCard({ skill, onInstall, installing, installed }: ClawHubSkillCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, installed && styles.cardInstalled]}
      activeOpacity={0.8}
      onPress={() => router.push(`/skill/clawhub/${skill.name}`)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.nameRow}>
          <Text style={styles.skillName}>{skill.displayName}</Text>
          {skill.isOfficial && <View style={styles.officialBadge}><Text style={styles.officialBadgeText}>Official</Text></View>}
        </View>
      </View>
      <Text style={styles.skillDesc} numberOfLines={2}>{skill.summary || 'No description.'}</Text>
      {skill.originalSummary ? (
        <Text style={styles.skillDescOriginal} numberOfLines={2}>{skill.originalSummary}</Text>
      ) : null}
      <View style={styles.cardFooter}>
        <Text style={styles.version}>by @{skill.ownerHandle} · v{skill.latestVersion}</Text>
        {installed ? (
          <View style={styles.installedBadge}>
            <Text style={styles.installedBadgeText}>Installed ✓</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.installBtn, installing && styles.installBtnLoading]}
            onPress={(e) => {
              // @ts-ignore — stopPropagation exists on synthetic events
              e.stopPropagation?.()
              onInstall(skill)
            }}
            disabled={installing}
          >
            {installing
              ? <ActivityIndicator size="small" color={Colors.bgPrimary} />
              : <Text style={styles.installBtnText}>Install</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  )
}

// ── Main screen ─────────────────────────────────────────────────────────────
export default function SkillsScreen() {
  const { skills, setSkills } = useSkillsStore()
  const { agents, getConnectionStatus } = useAgentsStore()
  const { user } = useAuthStore()
  const showToast = useUIStore((s) => s.showToast)

  const [query, setQuery] = useState('')
  const [clawHubSkills, setClawHubSkills] = useState<ClawHubSkill[]>([])
  const [searchResults, setSearchResults] = useState<ClawHubSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)

  // Selected agent for install
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  // Auto-select first connected agent (use derived status from store)
  useEffect(() => {
    if (selectedAgentId) return
    const connected = agents.find((a) => getConnectionStatus(a.id) === 'connected')
    if (connected) setSelectedAgentId(connected.id)
    else if (agents.length > 0) setSelectedAgentId(agents[0].id)
  }, [agents])

  // Per-skill install state
  const [installingSlug, setInstallingSlug] = useState<string | null>(null)
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set())

  // Load installed slugs for selected agent from DB
  useEffect(() => {
    if (!selectedAgentId) return
    supabase
      .from('agent_skills')
      .select('skill_slug')
      .eq('agent_id', selectedAgentId)
      .eq('status', 'active')
      .then(({ data }) => {
        if (!data) return
        setInstalledSlugs(new Set(data.map((row: any) => row.skill_slug as string)))
      })
  }, [selectedAgentId])

  // Load local skills + ClawHub top skills
  useEffect(() => {
    supabase.from('skills').select('*').then(({ data }) => { if (data) setSkills(data) })

    fetch(`${CLAWHUB}/packages?family=skill&limit=30`)
      .then((r) => r.json())
      .then(async (data) => {
        const items: ClawHubSkill[] = data.items ?? []
        const translated = await Promise.all(items.map(translateSkill))
        setClawHubSkills(translated)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Search ClawHub
  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch(`${CLAWHUB}/search?q=${encodeURIComponent(query)}&limit=20`)
        const data = await r.json()
        const results: ClawHubSkill[] = (data.results ?? []).map((r: any) => ({ ...r, name: r.slug ?? r.name }))
        const translated = await Promise.all(results.map(translateSkill))
        setSearchResults(translated)
      } catch {}
      setSearching(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  const handleInstall = useCallback(async (skill: ClawHubSkill) => {
    if (!user) { showToast('Not logged in'); return }
    if (!selectedAgentId) { showToast('No agent selected'); return }
    const agent = agents.find((a) => a.id === selectedAgentId)
    if (!agent) return

    setInstallingSlug(skill.name)
    try {
      const skillName = skill.displayName ?? skill.name
      const version = skill.latestVersion ?? '1.0.0'

      await supabase.from('agent_skills').upsert({
        agent_id: selectedAgentId,
        skill_slug: skill.name,
        config: { displayName: skillName, version },
        status: 'active',
      }, { onConflict: 'agent_id,skill_slug' })

      await supabase.channel(`agent:${selectedAgentId}:events`).send({
        type: 'broadcast',
        event: 'skill-assigned',
        payload: { skillName, slug: skill.name, version },
      })

      setInstalledSlugs((prev) => new Set([...prev, skill.name]))
      showToast(`${skillName} installed on ${agent.name}`)

      await supabase.from('messages').insert({
        agent_id: selectedAgentId,
        user_id: user.id,
        direction: 'outbound',
        content: `Skill installed: ${skillName} v${version}`,
      })
    } catch (err: any) {
      console.error('[install]', err?.message)
      showToast(`Install failed: ${err?.message ?? 'unknown error'}`)
    }
    setInstallingSlug(null)
  }, [agents, selectedAgentId, user, showToast])

  const displayedClawHub = query.trim() ? searchResults : clawHubSkills

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Skills</Text>
        <Text style={styles.subtitle}>{clawHubSkills.length + skills.length} available</Text>
      </View>

      {/* Agent picker */}
      {agents.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.agentPicker}
        >
          {agents.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.agentChip, selectedAgentId === a.id && styles.agentChipSelected]}
              onPress={() => setSelectedAgentId(a.id)}
            >
              <View style={[styles.agentDot, { backgroundColor: a.status === 'connected' ? Colors.accentGreen : Colors.textMuted }]} />
              <Text style={[styles.agentChipText, selectedAgentId === a.id && styles.agentChipTextSelected]}>
                {a.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

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

      <FlatList
        data={[]}
        keyExtractor={() => ''}
        renderItem={() => null}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {/* ClawHub skills — featured first */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{query.trim() ? 'Search results' : 'Featured'}</Text>
              {loading && <ActivityIndicator size="small" color={Colors.accentTeal} />}
            </View>

            {!loading && displayedClawHub.length === 0 && (
              <Text style={styles.emptyText}>{query.trim() ? 'No results' : 'No skills available'}</Text>
            )}

            {displayedClawHub.map((s) => (
              <ClawHubSkillCard
                key={s.name}
                skill={s}
                onInstall={handleInstall}
                installing={installingSlug === s.name}
                installed={installedSlugs.has(s.name)}
              />
            ))}
          </>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  agentPicker: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  agentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
  },
  agentChipSelected: {
    borderColor: Colors.accentCrimson,
    backgroundColor: 'rgba(220,38,38,0.08)',
  },
  agentDot: { width: 6, height: 6, borderRadius: 3 },
  agentChipText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  agentChipTextSelected: { color: Colors.accentCrimson },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  searchSpinner: { marginLeft: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' },
  emptyText: { color: Colors.textSecondary, textAlign: 'center', paddingVertical: 24 },
  card: { backgroundColor: '#0f0f0f', borderRadius: 16, padding: 16, gap: 8 },
  cardInstalled: { borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  nameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  skillName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  badge: { backgroundColor: 'rgba(0,236,196,0.08)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: Colors.accentTeal, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  officialBadge: { backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  officialBadgeText: { color: Colors.accentAmber, fontSize: 10, fontWeight: '700' },
  skillDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  skillDescOriginal: { color: Colors.textMuted, fontSize: 11, lineHeight: 16, fontStyle: 'italic' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  version: { color: Colors.textMuted, fontSize: 11, flex: 1 },
  installBtn: {
    backgroundColor: Colors.accentCrimson,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 70,
    alignItems: 'center',
  },
  installBtnLoading: { opacity: 0.7 },
  installBtnText: { color: Colors.bgPrimary, fontSize: 13, fontWeight: '600' },
  installedBadge: { backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  installedBadgeText: { color: Colors.accentGreen, fontSize: 13, fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyIcon: { fontSize: 40, color: Colors.textMuted },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary },
})
