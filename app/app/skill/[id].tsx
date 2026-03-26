import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useSkillsStore } from '../../stores/skillsStore'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { Colors } from '../../constants/colors'

export default function SkillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { skills } = useSkillsStore()
  const { agents } = useAgentsStore()
  const { user } = useAuthStore()
  const showToast = useUIStore((s) => s.showToast)

  const skill = skills.find((s) => s.id === id)
  const connectedAgents = agents.filter((a) => {
    const delta = a.last_seen ? Date.now() - new Date(a.last_seen).getTime() : Infinity
    return delta < 300_000 // not fully disconnected
  })

  async function assignToAgent(agentId: string) {
    if (!user || !skill) return
    // Optimistic — show confirmation immediately
    showToast(`${skill.name} assigned`)
    router.back()

    // Persist in background
    await supabase.from('agent_skills').upsert({
      agent_id: agentId,
      skill_id: skill.id,
      config: {},
      status: 'pending' as const,
    })
  }

  function handleAssign() {
    if (connectedAgents.length === 0) {
      Alert.alert('No agents', 'Connect an agent first before assigning skills.')
      return
    }
    if (connectedAgents.length === 1) {
      assignToAgent(connectedAgents[0].id)
      return
    }
    Alert.alert(
      'Assign to agent',
      'Choose an agent',
      connectedAgents.map((a) => ({ text: a.name, onPress: () => assignToAgent(a.id) }))
    )
  }

  if (!skill) return (
    <View style={styles.container}>
      <Text style={{ color: Colors.textSecondary, textAlign: 'center', marginTop: 100 }}>Skill not found</Text>
    </View>
  )

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>‹ Skills</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.skillName}>{skill.name}</Text>
        <View style={styles.metaRow}>
          <View style={styles.providerBadge}><Text style={styles.providerBadgeText}>Anthropic</Text></View>
          {skill.category && <View style={styles.badge}><Text style={styles.badgeText}>{skill.category}</Text></View>}
        </View>
      </View>

      <Text style={styles.description}>{skill.description}</Text>

      <View style={styles.meta}>
        <Text style={styles.metaLabel}>Version</Text>
        <Text style={styles.metaValue}>v{skill.version}</Text>
      </View>

      {skill.config_schema?.fields?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuration</Text>
          {skill.config_schema.fields.map((f) => (
            <View key={f.key} style={styles.configRow}>
              <Text style={styles.configKey}>{f.label}</Text>
              <Text style={styles.configType}>{f.type}{f.required ? ' · required' : ''}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.assignBtn} onPress={handleAssign}>
        <Text style={styles.assignBtnText}>Assign to Agent</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { padding: 24, paddingTop: 60, gap: 20 },
  backBtn: { marginBottom: 8 },
  backBtnText: { color: Colors.accentCrimson, fontSize: 16 },
  header: { gap: 8 },
  skillName: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  providerBadge: { backgroundColor: 'rgba(99,102,241,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  providerBadgeText: { color: '#a5b4fc', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,200,150,0.10)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  badgeText: { color: Colors.accentGreen, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  description: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22 },
  meta: { flexDirection: 'row', gap: 8 },
  metaLabel: { color: Colors.textMuted, fontSize: 13 },
  metaValue: { color: Colors.textSecondary, fontSize: 13 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, letterSpacing: 0.8, textTransform: 'uppercase' },
  configRow: {
    backgroundColor: Colors.bgSurface,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  configKey: { color: Colors.textPrimary, fontSize: 14 },
  configType: { color: Colors.textMuted, fontSize: 12 },
  assignBtn: {
    backgroundColor: Colors.accentCrimson,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  assignBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '600' },
})
