import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useSkillsStore } from '../../stores/skillsStore'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { useSavedSkillsStore } from '../../stores/savedSkillsStore'
import { Colors } from '../../constants/colors'

export default function SkillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { skills } = useSkillsStore()
  const { agents } = useAgentsStore()
  const { user } = useAuthStore()
  const showToast = useUIStore((s) => s.showToast)

  const skill = skills.find((s) => s.id === id)
  const { save, unsave, isSaved } = useSavedSkillsStore()
  const saved = id ? isSaved(id) : false

  const toggleSave = () => {
    if (!skill) return
    if (saved) {
      unsave(skill.id)
    } else {
      save({ id: skill.id, name: skill.name, source: 'anthropic', category: skill.category, savedAt: Date.now() })
    }
  }

  const connectedAgents = agents.filter((a) => {
    const delta = a.last_seen ? Date.now() - new Date(a.last_seen).getTime() : Infinity
    return delta < 300_000
  })

  async function assignToAgent(agentId: string, agentName: string) {
    if (!user || !skill) return
    showToast(`${skill.name} assigned to ${agentName}`)
    router.back()
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
      assignToAgent(connectedAgents[0].id, connectedAgents[0].name)
      return
    }
    Alert.alert(
      'Assign to agent',
      'Choose an agent',
      connectedAgents.map((a) => ({ text: a.name, onPress: () => assignToAgent(a.id, a.name) }))
    )
  }

  if (!skill) return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>‹ Skills</Text>
      </TouchableOpacity>
      <View style={styles.centered}>
        <Text style={{ color: Colors.textSecondary }}>Skill not found</Text>
      </View>
    </View>
  )

  const configFields: { key: string; label: string; type: string; required?: boolean }[] =
    skill.config_schema?.fields ?? []

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Skills</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleSave} style={styles.bookmarkBtn}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={22} color={saved ? Colors.accentCrimson : Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.skillName}>{skill.name}</Text>

        <View style={styles.metaRow}>
          <View style={styles.providerBadge}>
            <Text style={styles.providerBadgeText}>Anthropic</Text>
          </View>
          {skill.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{skill.category}</Text>
            </View>
          )}
          <View style={styles.versionBadge}>
            <Text style={styles.versionBadgeText}>v{skill.version}</Text>
          </View>
        </View>

        <Text style={styles.ownerText}>by @anthropic</Text>

        {skill.description ? (
          <Text style={styles.description}>{skill.description}</Text>
        ) : null}

        {configFields.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>What it does</Text>
            {configFields.map((f) => (
              <View key={f.key} style={styles.featureRow}>
                <Text style={styles.featureDot}>◆</Text>
                <Text style={styles.featureText}>
                  {f.label}
                  {f.required ? <Text style={styles.requiredTag}> · required</Text> : null}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.infoGrid}>
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Version</Text>
            <Text style={styles.infoCellValue}>v{skill.version}</Text>
          </View>
          {skill.category && (
            <View style={styles.infoCell}>
              <Text style={styles.infoCellLabel}>Category</Text>
              <Text style={styles.infoCellValue}>{skill.category}</Text>
            </View>
          )}
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Publisher</Text>
            <Text style={styles.infoCellValue}>Anthropic</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoCellLabel}>Source</Text>
            <Text style={styles.infoCellValue}>anthropic.com</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.assignBtn} onPress={handleAssign}>
          <Text style={styles.assignBtnText}>Assign to Agent</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingBottom: 8, paddingHorizontal: 24 },
  backBtn: {},
  backBtnText: { color: Colors.accentCrimson, fontSize: 16 },
  bookmarkBtn: { padding: 4 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 24, paddingTop: 8, paddingBottom: 60 },
  skillName: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary, marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  providerBadge: {
    backgroundColor: 'rgba(99,102,241,0.15)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  providerBadgeText: { color: '#a5b4fc', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  categoryBadge: {
    backgroundColor: 'rgba(0,200,150,0.1)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  categoryBadgeText: { color: Colors.accentGreen, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  versionBadge: {
    backgroundColor: Colors.bgElevated, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  versionBadgeText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  ownerText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 20 },
  description: { fontSize: 15, color: Colors.textSecondary, lineHeight: 23, marginBottom: 28 },
  section: { marginBottom: 28, gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  featureRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  featureDot: { fontSize: 8, color: '#a5b4fc', marginTop: 5 },
  featureText: { flex: 1, fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },
  requiredTag: { color: Colors.textMuted, fontSize: 12 },
  infoGrid: { gap: 14, marginBottom: 28, backgroundColor: '#0f0f0f', borderRadius: 14, padding: 16 },
  infoCell: { gap: 4 },
  infoCellLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  infoCellValue: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  assignBtn: {
    backgroundColor: Colors.accentCrimson, borderRadius: 12,
    paddingVertical: 16, alignItems: 'center',
  },
  assignBtnText: { color: Colors.bgPrimary, fontSize: 16, fontWeight: '600' },
})
