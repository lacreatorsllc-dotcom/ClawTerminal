import { useEffect } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useSkillsStore } from '../../stores/skillsStore'
import { Colors } from '../../constants/colors'
import type { Skill } from '../../lib/types'

function SkillCard({ skill }: { skill: Skill }) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/skill/${skill.id}`)}>
      <View style={styles.cardHeader}>
        <Text style={styles.skillName}>{skill.name}</Text>
        {skill.category && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{skill.category}</Text>
          </View>
        )}
      </View>
      <Text style={styles.skillDesc} numberOfLines={2}>{skill.description}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.version}>v{skill.version}</Text>
        <TouchableOpacity style={styles.assignBtn} onPress={() => router.push(`/skill/${skill.id}`)}>
          <Text style={styles.assignBtnText}>Assign</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
}

const CATEGORIES = ['All', 'Information', 'Development', 'Data', 'Automation']

export default function SkillsScreen() {
  const { skills, setSkills, categoryFilter, setCategoryFilter } = useSkillsStore()

  useEffect(() => {
    supabase.from('skills').select('*').then(({ data }) => { if (data) setSkills(data) })
  }, [])

  const filtered = categoryFilter
    ? skills.filter((s) => s.category === categoryFilter)
    : skills

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Skills</Text>
        <Text style={styles.subtitle}>{skills.length} available</Text>
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filtersContent}>
        {CATEGORIES.map((cat) => {
          const active = (cat === 'All' && !categoryFilter) || cat === categoryFilter
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setCategoryFilter(cat === 'All' ? null : cat)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>◈</Text>
          <Text style={styles.emptyTitle}>No skills found</Text>
          <Text style={styles.emptySubtitle}>Try a different category</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => <SkillCard skill={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  filters: { marginBottom: 8 },
  filtersContent: { paddingHorizontal: 16, gap: 8 },
  chip: {
    backgroundColor: '#0f0f0f',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: 'rgba(193, 18, 31, 0.12)' },
  chipText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  chipTextActive: { color: Colors.accentCrimson },
  list: { paddingHorizontal: 16, gap: 10, paddingTop: 8 },
  card: {
    backgroundColor: '#0f0f0f',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skillName: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  badge: {
    backgroundColor: 'rgba(0, 236, 196, 0.08)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { color: Colors.accentTeal, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  skillDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  version: { color: Colors.textMuted, fontSize: 12 },
  assignBtn: { backgroundColor: Colors.accentCrimson, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  assignBtnText: { color: Colors.bgPrimary, fontSize: 13, fontWeight: '600' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyIcon: { fontSize: 40, color: Colors.textMuted },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary },
  emptySubtitle: { fontSize: 13, color: Colors.textSecondary },
})
