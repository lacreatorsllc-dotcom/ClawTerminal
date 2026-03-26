import { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAgentsStore } from '../../../stores/agentsStore'
import { useAuthStore } from '../../../stores/authStore'
import { useUIStore } from '../../../stores/uiStore'
import { Colors } from '../../../constants/colors'
import { translateToEnglish } from '../../../lib/translate'

const CLAWHUB = 'https://clawhub.ai/api/v1'

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleDateString([], { month: 'short', year: 'numeric' })
  } catch { return '' }
}

export default function ClawHubSkillDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const { agents, getConnectionStatus } = useAgentsStore()
  const { user } = useAuthStore()
  const showToast = useUIStore((s) => s.showToast)

  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)

  // Check if already installed for any of this user's agents
  useEffect(() => {
    if (!slug || !agents.length) return
    const agentIds = agents.map((a) => a.id)
    supabase
      .from('agent_skills')
      .select('id')
      .eq('skill_slug', slug)
      .in('agent_id', agentIds)
      .limit(1)
      .then(({ data }) => { if (data && data.length > 0) setInstalled(true) })
  }, [slug, agents])

  useEffect(() => {
    if (!slug) return
    fetch(`${CLAWHUB}/packages/${slug}`)
      .then((r) => r.json())
      .then(async (data) => {
        const pkg = data?.package
        const rawDisplayName: string = pkg?.displayName ?? ''
        const rawSummary: string = pkg?.summary ?? ''
        const rawReadme: string = pkg?.readme ?? pkg?.description ?? ''

        const [translatedDisplayName, translatedSummary, translatedReadme] = await Promise.all([
          translateToEnglish(rawDisplayName),
          translateToEnglish(rawSummary),
          rawReadme ? translateToEnglish(rawReadme) : Promise.resolve(''),
        ])

        setDetail({
          ...data,
          skill: {
            ...pkg,
            displayName: translatedDisplayName,
            originalDisplayName: translatedDisplayName !== rawDisplayName ? rawDisplayName : undefined,
            summary: translatedSummary,
            originalSummary: translatedSummary !== rawSummary ? rawSummary : undefined,
            readmeTranslated: translatedReadme || null,
          },
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [slug])

  const handleInstall = useCallback(async () => {
    if (!user || !detail) return

    const connectedAgents = agents.filter((a) => getConnectionStatus(a.id) === 'connected')
    if (connectedAgents.length === 0) {
      Alert.alert('No agents', 'Connect an agent first before installing skills.')
      return
    }

    const doInstall = async (agentId: string, agentName: string) => {
      setInstalling(true)
      try {
        const skillName = detail.skill?.displayName ?? slug
        const version = detail.skill?.latestVersion ?? '1.0.0'

        await supabase.from('agent_skills').upsert({
          agent_id: agentId,
          skill_slug: slug,
          config: { displayName: skillName, version },
          status: 'active',
        }, { onConflict: 'agent_id,skill_slug' })

        await supabase.channel(`agent:${agentId}:events`).send({
          type: 'broadcast',
          event: 'skill-assigned',
          payload: { skillName, slug, version },
        })

        setInstalled(true)
        showToast(`${skillName} installed on ${agentName}`)
      } catch (err: any) {
        console.error('[install]', err?.message)
        showToast(`Install failed: ${err?.message ?? 'unknown error'}`)
      }
      setInstalling(false)
    }

    if (connectedAgents.length === 1) {
      doInstall(connectedAgents[0].id, connectedAgents[0].name)
    } else {
      Alert.alert(
        'Install on agent',
        'Choose an agent',
        connectedAgents.map((a) => ({ text: a.name, onPress: () => doInstall(a.id, a.name) }))
      )
    }
  }, [detail, slug, agents, user, showToast])

  const skill = detail?.skill
  const version = skill?.latestVersion
  const owner = detail?.owner
  const stats = detail?.stats ?? detail?.package?.stats

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>‹ Skills</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.accentTeal} />
        </View>
      ) : !skill ? (
        <View style={styles.centered}>
          <Text style={{ color: Colors.textSecondary }}>Skill not found</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.skillName}>{skill.displayName}</Text>
          {skill.originalDisplayName ? <Text style={styles.original}>{skill.originalDisplayName}</Text> : null}

          <View style={styles.metaRow}>
            <View style={styles.providerBadge}><Text style={styles.providerBadgeText}>ClawHub</Text></View>
            {skill.verificationTier && (
              <View style={styles.verifiedBadge}><Text style={styles.verifiedBadgeText}>✓ Verified</Text></View>
            )}
            {skill.isOfficial && !skill.verificationTier && (
              <View style={styles.verifiedBadge}><Text style={styles.verifiedBadgeText}>✓ Official</Text></View>
            )}
          </View>

          <View style={styles.metaRow}>
            {owner && <Text style={styles.meta}>by @{owner.handle ?? owner.username ?? owner.name}</Text>}
            {version && <><Text style={styles.metaDot}>·</Text><Text style={styles.meta}>v{version}</Text></>}
            {skill.updatedAt && <><Text style={styles.metaDot}>·</Text><Text style={styles.meta}>Updated {formatDate(skill.updatedAt)}</Text></>}
          </View>

          {skill.summary ? <Text style={styles.summary}>{skill.summary}</Text> : null}
          {skill.originalSummary ? <Text style={styles.original}>{skill.originalSummary}</Text> : null}

          {skill.readmeTranslated ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>About this skill</Text>
              <Text style={styles.bodyText}>{skill.readmeTranslated}</Text>
            </View>
          ) : null}

          {(skill.tags?.length > 0 || skill.categories?.length > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Tags</Text>
              <View style={styles.tagRow}>
                {(skill.tags ?? skill.categories ?? []).map((tag: string, i: number) => (
                  <View key={i} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.infoGrid}>
            {owner?.handle && (
              <View style={styles.infoCell}>
                <Text style={styles.infoCellLabel}>Publisher</Text>
                <Text style={styles.infoCellValue}>@{owner.handle ?? owner.username ?? owner.name}</Text>
              </View>
            )}
            {version && (
              <View style={styles.infoCell}>
                <Text style={styles.infoCellLabel}>Version</Text>
                <Text style={styles.infoCellValue}>{version}</Text>
              </View>
            )}
            {(stats?.totalInstalls ?? stats?.installs ?? skill.totalInstalls) != null && (
              <View style={styles.infoCell}>
                <Text style={styles.infoCellLabel}>Installs</Text>
                <Text style={styles.infoCellValue}>{Number(stats?.totalInstalls ?? stats?.installs ?? skill.totalInstalls).toLocaleString()}</Text>
              </View>
            )}
            {skill.license && (
              <View style={styles.infoCell}>
                <Text style={styles.infoCellLabel}>License</Text>
                <Text style={styles.infoCellValue}>{skill.license}</Text>
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
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  backBtn: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 8 },
  backBtnText: { color: Colors.accentCrimson, fontSize: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 24, paddingTop: 8, paddingBottom: 60 },
  skillName: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  providerBadge: { backgroundColor: 'rgba(0,200,150,0.1)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  providerBadgeText: { color: Colors.accentTeal, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  verifiedBadge: { backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  verifiedBadgeText: { color: '#60a5fa', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  meta: { fontSize: 13, color: Colors.textSecondary },
  metaDot: { color: Colors.textMuted, marginHorizontal: 2 },
  summary: { fontSize: 15, color: Colors.textSecondary, lineHeight: 23, marginBottom: 24, marginTop: 8 },
  original: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, fontStyle: 'italic', marginTop: -16, marginBottom: 8 },
  section: { marginBottom: 28, gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  bodyText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
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
