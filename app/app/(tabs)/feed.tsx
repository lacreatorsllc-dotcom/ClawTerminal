import { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native'
import { supabase } from '../../lib/supabase'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'
import type { Agent } from '../../lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeedItem {
  id: string
  agent_id: string
  content: string
  created_at: string
}

// ── Cards ──────────────────────────────────────────────────────────────────────

function SystemCard({ item, agent }: { item: FeedItem; agent?: Agent }) {
  return (
    <View style={styles.systemCard}>
      <View style={[styles.agentDot, { backgroundColor: Colors.accentAmber }]} />
      <Text style={styles.systemText} numberOfLines={2}>
        <Text style={styles.systemAgentName}>{agent?.name ?? 'Agent'} </Text>
        {item.content}
      </Text>
      <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
    </View>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const { agents } = useAgentsStore()
  const { user } = useAuthStore()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const agentMap = Object.fromEntries(agents.map((a) => [a.id, a]))

  const loadFeed = useCallback(async () => {
    if (!user) return
    const agentIds = agents.map((a) => a.id)
    if (agentIds.length === 0) { setLoading(false); return }

    const { data: skillInstalls } = await supabase
      .from('agent_skills')
      .select('id, agent_id, skill_slug, config, created_at')
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(60)

    const skillItems: FeedItem[] = (skillInstalls ?? []).map((s) => ({
      id: `skill:${s.id}`,
      agent_id: s.agent_id,
      content: `Skill installed: ${s.config?.displayName ?? s.skill_slug}${s.config?.version ? ` v${s.config.version}` : ''}`,
      created_at: s.created_at,
    }))

    setItems(skillItems)
    setLoading(false)
  }, [user, agents])

  useEffect(() => { loadFeed() }, [loadFeed])

  // Realtime: push new skill installs to top of feed
  useEffect(() => {
    if (!user || agents.length === 0) return
    const agentIds = agents.map((a) => a.id)

    const channel = supabase
      .channel('feed:live')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_skills',
      }, (payload) => {
        const row = payload.new as any
        if (!agentIds.includes(row.agent_id)) return
        const newItem: FeedItem = {
          id: `skill:${row.id}`,
          agent_id: row.agent_id,
          content: `Skill installed: ${row.config?.displayName ?? row.skill_slug}${row.config?.version ? ` v${row.config.version}` : ''}`,
          created_at: row.created_at,
        }
        setItems((prev) => [newItem, ...prev.slice(0, 59)])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, agents])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadFeed()
    setRefreshing(false)
  }, [loadFeed])

  const renderItem = ({ item }: { item: FeedItem }) => {
    const agent = agentMap[item.agent_id]
    return <SystemCard item={item} agent={agent} />
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Feed</Text>
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live updates</Text>
          </View>
        </View>
      </View>

      {!loading && items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>◉</Text>
          <Text style={styles.emptyTitle}>No updates yet</Text>
          <Text style={styles.emptySubtitle}>Agent activity will appear here as they work</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accentCrimson} />
          }
        />
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accentGreen },
  liveText: { fontSize: 11, fontWeight: '700', color: Colors.accentGreen, letterSpacing: 1.5, textTransform: 'uppercase' },

  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 10 },

  agentDot: { width: 7, height: 7, borderRadius: 4 },
  timestamp: { fontSize: 11, color: Colors.textMuted },

  systemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
  },
  systemText: { flex: 1, fontSize: 12, color: Colors.textMuted },
  systemAgentName: { color: Colors.textSecondary, fontWeight: '600' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, color: Colors.textMuted },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary },
  emptySubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
})
