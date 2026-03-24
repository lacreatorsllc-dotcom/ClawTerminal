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

export default function ClawHubSkillDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const { agents } = useAgentsStore()
  const { user } = useAuthStore()
  const showToast = useUIStore((s) => s.showToast)

  const [detail, setDetail] = useState<any>(null)
  const [changelog, setChangelog] = useState<string | null>(null)
  const [originalChangelog, setOriginalChangelog] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (!slug) return
    fetch(`${CLAWHUB}/packages/${slug}`)
      .then((r) => r.json())
      .then(async (data) => {
        const pkg = data?.package
        const rawDisplayName: string = pkg?.displayName ?? ''
        const rawSummary: string = pkg?.summary ?? ''

        const [translatedDisplayName, translatedSummary] = await Promise.all([
          translateToEnglish(rawDisplayName),
          translateToEnglish(rawSummary),
        ])

        setDetail({
          ...data,
          skill: {
            ...pkg,
            displayName: translatedDisplayName,
            originalDisplayName: translatedDisplayName !== rawDisplayName ? rawDisplayName : undefined,
            summary: translatedSummary,
            originalSummary: translatedSummary !== rawSummary ? rawSummary : undefined,
          },
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [slug])

  const handleInstall = useCallback(async () => {
    if (!user || !detail) return

    const connectedAgents = agents.filter((a) => a.status === 'connected')
    if (connectedAgents.length === 0) {
      Alert.alert('No agents', 'Connect an agent first before installing skills.')
      return
    }

    const doInstall = async (agentId: string, agentName: string) => {
      setInstalling(true)
      try {
        const skillName = detail.skill?.displayName ?? slug
        const version = detail.skill?.latestVersion ?? '1.0.0'

        const { data: savedSkill, error: skillError } = await supabase
          .from('skills')
          .upsert({
            name: skillName,
            description: detail.skill?.summary ?? '',
            category: 'Registry',
            version,
            config_schema: { fields: [] },
          }, { onConflict: 'name' })
          .select('id')
          .single()

        if (skillError || !savedSkill) throw new Error(skillError?.message ?? 'skill insert failed')

        await supabase.from('agent_skills').upsert({
          agent_id: agentId,
          skill_id: savedSkill.id,
          config: { source: 'clawhub', slug },
          status: 'active',
        }, { onConflict: 'agent_id,skill_id' })

        await supabase.channel(`agent:${agentId}`).send({
          type: 'broadcast',
          event: 'skill-assigned',
          payload: { skillName, slug, version },
        })

        setInstalled(true)
        showToast(`${skillName} installed on ${agentName}`)

        const msg = `Skill installed: ${skillName} v${version}`
        await supabase.from('messages').insert({
          agent_id: agentId,
          user_id: user!.id,
          direction: 'outbound',
          content: msg,
        })
        await supabase.channel(`agent:${agentId}`).send({
          type: 'broadcast',
          event: 'message',
          payload: { direction: 'outbound', content: msg, ts: Date.now() },
        })
      } catch {
        showToast('Install failed — try again')
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
            {owner && <Text style={styles.meta}>by @{owner.handle}</Text>}
            {version && <><Text style={styles.metaDot}>·</Text><Text style={styles.meta}>v{version}</Text></>}
            {skill.channel && <><Text style={styles.metaDot}>·</Text><Text style={styles.meta}>{skill.channel}</Text></>}
          </View>

          {skill.summary ? <Text style={styles.summary}>{skill.summary}</Text> : null}
          {skill.originalSummary ? <Text style={styles.original}>{skill.originalSummary}</Text> : null}

          {changelog ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>What's included</Text>
              <Text style={styles.changelogText}>{changelog}</Text>
              {originalChangelog ? <Text style={styles.original}>{originalChangelog}</Text> : null}
            </View>
          ) : null}

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
      )}
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  meta: { fontSize: 13, color: Colors.textSecondary },
  metaDot: { color: Colors.textMuted },
  summary: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  changelogText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },
  original: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, fontStyle: 'italic' },
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
