import { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { useAgentsStore } from '../../../stores/agentsStore'
import { useAuthStore } from '../../../stores/authStore'
import { useUIStore } from '../../../stores/uiStore'
import { Colors } from '../../../constants/colors'
import { translateToEnglish } from '../../../lib/translate'

const CLAWHUB = 'https://clawhub.ai/api/v1'

export default function ClawHubSkillDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const { agents, getConnectionStatus } = useAgentsStore()
  const { user } = useAuthStore()
  const showToast = useUIStore((s) => s.showToast)

  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)

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
        const pkg = data?.package ?? {}
        const rawDisplayName: string = pkg?.displayName ?? ''
        const rawSummary: string = pkg?.summary ?? ''
        const rawDescription: string = pkg?.description ?? pkg?.readme ?? ''

        const [displayName, summary, description] = await Promise.all([
          translateToEnglish(rawDisplayName),
          translateToEnglish(rawSummary),
          rawDescription ? translateToEnglish(rawDescription) : Promise.resolve(''),
        ])

        const rawFeatures: string[] = pkg?.features ?? pkg?.tags ?? []

        setDetail({
          pkg: {
            ...pkg,
            displayName,
            originalDisplayName: displayName !== rawDisplayName ? rawDisplayName : undefined,
            summary,
            originalSummary: summary !== rawSummary ? rawSummary : undefined,
            description,
          },
          owner: data?.owner,
          features: rawFeatures,
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
        const skillName = detail.pkg?.displayName ?? slug
        const version = detail.pkg?.latestVersion ?? '1.0.0'

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

  const pkg = detail?.pkg
  const owner = detail?.owner
  const features: string[] = detail?.features ?? []

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>‹ Skills</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.accentTeal} />
        </View>
      ) : !pkg ? (
        <View style={styles.centered}>
          <Text style={{ color: Colors.textSecondary }}>Skill not found</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.skillName}>{pkg.displayName}</Text>
          {pkg.originalDisplayName ? (
            <Text style={styles.original}>{pkg.originalDisplayName}</Text>
          ) : null}

          <View style={styles.metaRow}>
            <View style={styles.providerBadge}>
              <Text style={styles.providerBadgeText}>ClawHub</Text>
            </View>
            {pkg.verificationTier && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={13} color="#60a5fa" />
                <Text style={styles.verifiedBadgeText}>Verified</Text>
              </View>
            )}
            {pkg.latestVersion && (
              <View style={styles.versionBadge}>
                <Text style={styles.versionBadgeText}>v{pkg.latestVersion}</Text>
              </View>
            )}
          </View>

          {owner?.handle ? (
            <Text style={styles.ownerText}>by @{owner.handle}</Text>
          ) : null}

          {(pkg.description || pkg.summary) ? (
            <Text style={styles.description}>{pkg.description || pkg.summary}</Text>
          ) : null}
          {pkg.originalSummary && !pkg.description ? (
            <Text style={[styles.original, { marginTop: -20 }]}>{pkg.originalSummary}</Text>
          ) : null}

          {features.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>What it does</Text>
              {features.map((f: string, i: number) => (
                <View key={i} style={styles.featureRow}>
                  <Text style={styles.featureDot}>◆</Text>
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
          )}

          {features.length === 0 && pkg.description && pkg.summary ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Summary</Text>
              <Text style={styles.featureText}>{pkg.summary}</Text>
              {pkg.originalSummary ? (
                <Text style={styles.original}>{pkg.originalSummary}</Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.infoGrid}>
            {pkg.latestVersion && (
              <View style={styles.infoCell}>
                <Text style={styles.infoCellLabel}>Version</Text>
                <Text style={styles.infoCellValue}>v{pkg.latestVersion}</Text>
              </View>
            )}
            {owner?.handle && (
              <View style={styles.infoCell}>
                <Text style={styles.infoCellLabel}>Publisher</Text>
                <Text style={styles.infoCellValue}>@{owner.handle}</Text>
              </View>
            )}
            {pkg.verificationTier && (
              <View style={styles.infoCell}>
                <Text style={styles.infoCellLabel}>Verification</Text>
                <Text style={styles.infoCellValue}>{pkg.verificationTier}</Text>
              </View>
            )}
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>Source</Text>
              <Text style={styles.infoCellValue}>clawhub.ai</Text>
            </View>
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  providerBadge: {
    backgroundColor: 'rgba(0,200,150,0.1)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  providerBadgeText: { color: Colors.accentTeal, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)',
  },
  verifiedBadgeText: { color: '#60a5fa', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  versionBadge: {
    backgroundColor: Colors.bgElevated, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  versionBadgeText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  ownerText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 20 },
  description: { fontSize: 15, color: Colors.textSecondary, lineHeight: 23, marginBottom: 28 },
  original: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, fontStyle: 'italic', marginBottom: 20 },
  section: { marginBottom: 28, gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  featureRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  featureDot: { fontSize: 8, color: Colors.accentTeal, marginTop: 5 },
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
