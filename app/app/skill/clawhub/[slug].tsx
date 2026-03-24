import { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAgentsStore } from '../../../stores/agentsStore'
import { useAuthStore } from '../../../stores/authStore'
import { useUIStore } from '../../../stores/uiStore'
import { Colors } from '../../../constants/colors'

const CLAWHUB = 'https://clawhub.ai/api/v1'

interface SkillDetail {
  name: string
  displayName: string
  summary: string
  latestVersion: string
  ownerHandle: string
  isOfficial: boolean
  channel: string
}

export default function ClawHubSkillDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const { agents } = useAgentsStore()
  const { user } = useAuthStore()
  const showToast = useUIStore((s) => s.showToast)

  const [skill, setSkill] = useState<SkillDetail | null>(null)
  const [readme, setReadme] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (!slug) return
    Promise.all([
      fetch(`${CLAWHUB}/skills/${slug}`).then((r) => r.json()),
      fetch(`${CLAWHUB}/skills/${slug}/file?path=skill.md`).then((r) => r.text()).catch(() => null),
    ]).then(([detail, md]) => {
      setSkill(detail)
      setReadme(md && !md.startsWith('<!') ? md : null)
    }).finally(() => setLoading(false))
  }, [slug])

  const handleInstall = useCallback(async () => {
    if (!user || !skill) return

    const connectedAgents = agents.filter((a) => a.status === 'connected')
    if (connectedAgents.length === 0) {
      Alert.alert('No agents', 'Connect an agent first before installing skills.')
      return
    }

    const doInstall = async (agentId: string, agentName: string) => {
      setInstalling(true)
      try {
        const { data: savedSkill } = await supabase
          .from('skills')
          .upsert({
            name: skill.displayName,
            description: skill.summary || '',
            category: 'Registry',
            version: skill.latestVersion,
            config_schema: { fields: [] },
          }, { onConflict: 'name' })
          .select('id')
          .single()

        if (savedSkill) {
          await supabase.from('agent_skills').upsert({
            agent_id: agentId,
            skill_id: savedSkill.id,
            config: { source: 'clawhub', slug: skill.name },
            status: 'active',
          })

          await supabase.channel(`agent:${agentId}`).send({
            type: 'broadcast',
            event: 'skill-assigned',
            payload: { skillName: skill.displayName, slug: skill.name, version: skill.latestVersion },
          })
        }

        setInstalled(true)
        showToast(`${skill.displayName} installed on ${agentName}`)
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
  }, [skill, agents, user, showToast])

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>‹ Skills</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color={Colors.accentTeal} />
        </View>
      ) : !skill ? (
        <View style={styles.loadingBlock}>
          <Text style={{ color: Colors.textSecondary }}>Skill not found</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.skillName}>{skill.displayName}</Text>
            <View style={styles.metaRow}>
              {skill.isOfficial && (
                <View style={styles.officialBadge}><Text style={styles.officialBadgeText}>Official</Text></View>
              )}
              <Text style={styles.meta}>by @{skill.ownerHandle}</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.meta}>v{skill.latestVersion}</Text>
            </View>
          </View>

          {skill.summary ? (
            <Text style={styles.summary}>{skill.summary}</Text>
          ) : null}

          {readme ? (
            <View style={styles.readmeBlock}>
              <Text style={styles.readmeLabel}>About</Text>
              <Text style={styles.readmeText}>{readme}</Text>
            </View>
          ) : null}

          <View style={styles.infoCard}>
            <Row label="Version" value={`v${skill.latestVersion}`} />
            <Row label="Author" value={`@${skill.ownerHandle}`} />
            <Row label="Channel" value={skill.channel} />
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
                : <Text style={styles.installBtnText}>Install</Text>
              }
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  backBtn: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 8 },
  backBtnText: { color: Colors.accentCrimson, fontSize: 16 },
  loadingBlock: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 24, paddingTop: 8, gap: 20, paddingBottom: 48 },
  header: { gap: 8 },
  skillName: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  meta: { fontSize: 13, color: Colors.textSecondary },
  metaDot: { color: Colors.textMuted, fontSize: 13 },
  officialBadge: { backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  officialBadgeText: { color: Colors.accentAmber, fontSize: 10, fontWeight: '700' },
  summary: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22 },
  readmeBlock: { gap: 8 },
  readmeLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  readmeText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },
  infoCard: { backgroundColor: Colors.bgSurface, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.bgBorder },
  rowLabel: { color: Colors.textSecondary, fontSize: 14 },
  rowValue: { color: Colors.textPrimary, fontSize: 14 },
  installBtn: {
    backgroundColor: Colors.accentCrimson,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  installBtnLoading: { opacity: 0.7 },
  installBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '600' },
  installedBtn: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  installedBtnText: { color: Colors.accentGreen, fontSize: 16, fontWeight: '600' },
})
