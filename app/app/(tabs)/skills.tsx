import { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Platform } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useSkillsStore } from '../../stores/skillsStore'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { Colors } from '../../constants/colors'
import type { Skill } from '../../lib/types'

const CLAWHUB = 'https://clawhub.ai/api/v1'

interface ClawHubSkill {
  name: string
  displayName: string
  summary: string
  latestVersion: string
  ownerHandle: string
  channel: string
  isOfficial: boolean
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
function ClawHubSkillCard({ skill, onInstall, installing, installed }: {
  skill: ClawHubSkill
  onInstall: (skill: ClawHubSkill) => void
  installing: boolean
  installed: boolean
}) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <View style={styles.nameRow}>
          <Text style={styles.skillName}>{skill.displayName}</Text>
          {skill.isOfficial && <View style={styles.officialBadge}><Text style={styles.officialBadgeText}>Official</Text></View>}
        </View>
      </View>
      <Text style={styles.skillDesc} numberOfLines={2}>{skill.summary || 'No description.'}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.version}>by @{skill.ownerHandle} · v{skill.latestVersion}</Text>
        {installed ? (
          <View style={styles.installedBadge}><Text style={styles.installedBadgeText}>Installed ✓</Text></View>
        ) : (
          <TouchableOpacity
            style={[styles.installBtn, installing && styles.installBtnLoading]}
            onPress={() => onInstall(skill)}
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
  const { agents } = useAgentsStore()
  const { user } = useAuthStore()
  const showToast = useUIStore((s) => s.showToast)

  const [query, setQuery] = useState('')
  const [clawHubSkills, setClawHubSkills] = useState<ClawHubSkill[]>([])
  const [searchResults, setSearchResults] = useState<ClawHubSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [installed, setInstalled] = useState<Set<string>>(new Set())

  // Load local skills + ClawHub top skills
  useEffect(() => {
    supabase.from('skills').select('*').then(({ data }) => { if (data) setSkills(data) })

    fetch(`${CLAWHUB}/packages?family=skill&limit=30`)
      .then((r) => r.json())
      .then((data) => setClawHubSkills(data.items ?? []))
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
        setSearchResults(data.results ?? [])
      } catch {}
      setSearching(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  const handleInstall = useCallback(async (skill: ClawHubSkill) => {
    if (!user) return

    // Pick the first connected agent, or prompt
    const connectedAgent = agents.find((a) => a.status === 'connected')
    if (!connectedAgent) {
      showToast('Connect an agent first')
      return
    }

    setInstalling(skill.name)

    try {
      // Upsert into skills table
      const { data: savedSkill } = await supabase
        .from('skills')
        .upsert({
          name: skill.displayName,
          description: skill.summary || '',
          category: 'ClawHub',
          version: skill.latestVersion,
          config_schema: { fields: [] },
        }, { onConflict: 'name' })
        .select('id')
        .single()

      if (savedSkill) {
        // Assign to agent
        await supabase.from('agent_skills').upsert({
          agent_id: connectedAgent.id,
          skill_id: savedSkill.id,
          config: { source: 'clawhub', slug: skill.name },
          status: 'active',
        })

        // Notify agent via broadcast
        await supabase.channel(`agent:${connectedAgent.id}`).send({
          type: 'broadcast',
          event: 'skill-assigned',
          payload: {
            skillName: skill.displayName,
            slug: skill.name,
            version: skill.latestVersion,
            source: 'clawhub',
          },
        })
      }

      setInstalled((prev) => new Set(prev).add(skill.name))
      showToast(`${skill.displayName} installed on ${connectedAgent.name}`)
    } catch {
      showToast('Install failed — try again')
    }

    setInstalling(null)
  }, [agents, user, showToast])

  const displayedClawHub = query.trim() ? searchResults : clawHubSkills

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Skills</Text>
        <Text style={styles.subtitle}>{clawHubSkills.length + skills.length} available</Text>
      </View>

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
        renderItem={null}
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
                installing={installing === s.name}
                installed={installed.has(s.name)}
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  nameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  skillName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  badge: { backgroundColor: 'rgba(0,236,196,0.08)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: Colors.accentTeal, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  officialBadge: { backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  officialBadgeText: { color: Colors.accentAmber, fontSize: 10, fontWeight: '700' },
  skillDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
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
