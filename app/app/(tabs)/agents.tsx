import { useEffect, useRef } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { Colors } from '../../constants/colors'
import type { Agent, AgentStatus } from '../../lib/types'

const STATUS_COLOR: Record<AgentStatus, string> = {
  connected: Colors.accentGreen,
  connecting: Colors.accentTeal,
  stale: Colors.accentAmber,
  error: Colors.accentRed,
  disconnected: Colors.textSecondary,
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  connected: 'Active',
  connecting: 'Connecting',
  stale: 'Reconnecting',
  error: 'Error',
  disconnected: 'Offline',
}

const SKELETON_MIN_MS = 1200

// ── Shimmer skeleton ──────────────────────────────────────────────────────────

function SkeletonCard() {
  const shimmer = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] })

  return (
    <Animated.View style={[styles.card, styles.skeletonCard, { opacity }]}>
      <View style={styles.cardLeft}>
        <View style={styles.skeletonAvatar} />
        <View style={{ gap: 8 }}>
          <View style={styles.skeletonNameBar} />
          <View style={styles.skeletonMetaBar} />
        </View>
      </View>
      <View style={styles.skeletonBadge} />
    </Animated.View>
  )
}

function SkeletonList() {
  return (
    <View style={styles.list}>
      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  )
}

// ── Agent card ────────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: Agent }) {
  const getConnectionStatus = useAgentsStore((s) => s.getConnectionStatus)
  const status = getConnectionStatus(agent.id)

  return (
    <TouchableOpacity
      style={[styles.card, status === 'connected' && styles.cardActive]}
      onPress={() => router.push(`/agent/${agent.id}`)}
    >
      <View style={styles.cardLeft}>
        <View style={[styles.avatar, { borderColor: STATUS_COLOR[status] }]}>
          <Text style={styles.avatarText}>{agent.name[0]?.toUpperCase()}</Text>
        </View>
        <View>
          <Text style={styles.agentName}>{agent.name}</Text>
          <Text style={styles.agentMeta}>
            {agent.metadata?.bot_username
              ? `@${agent.metadata.bot_username as string}`
              : agent.metadata?.current_task
              ? String(agent.metadata.current_task)
              : agent.last_seen
              ? `Last seen ${new Date(agent.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Never connected'}
          </Text>
        </View>
      </View>
      <View style={styles.statusBadge}>
        <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] }]} />
        <Text style={[styles.statusText, { color: STATUS_COLOR[status] }]}>{STATUS_LABEL[status]}</Text>
      </View>
    </TouchableOpacity>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AgentsScreen() {
  const { agents, setAgents, upsertAgent, loading, setLoading } = useAgentsStore()
  const { user } = useAuthStore()
  const setConnectModalVisible = useUIStore((s) => s.setConnectModalVisible)

  useEffect(() => {
    if (!user) return

    const fetchAgents = async () => {
      const start = Date.now()
      const { data } = await supabase
        .from('agents')
        .select('*')
        .eq('user_id', user.id)
      if (data) {
        setAgents(data)
        // enforce minimum skeleton display time on first load
        const elapsed = Date.now() - start
        const delay = Math.max(0, SKELETON_MIN_MS - elapsed)
        setTimeout(() => setLoading(false), delay)
      }
    }

    fetchAgents()
    const poll = setInterval(fetchAgents, 15_000)

    const channel = supabase
      .channel(`user:${user.id}:agents`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agents',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') upsertAgent(payload.new as any)
        if (payload.eventType === 'UPDATE') upsertAgent(payload.new as any)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel); clearInterval(poll) }
  }, [user])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark} />
            <Text style={styles.title}>CLAW_TERMINAL</Text>
          </View>
          <View style={styles.systemStatus}>
            <View style={styles.systemStatusDot} />
            <Text style={styles.systemStatusText}>System Online</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.connectBtn} onPress={() => router.push('/connect')}>
          <Text style={styles.connectBtnText}>+ Connect</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <SkeletonList />
      ) : agents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>◈</Text>
          <Text style={styles.emptyTitle}>No agents connected</Text>
          <Text style={styles.emptySubtitle}>Run the setup command to connect your first agent</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/connect')}>
            <Text style={styles.emptyBtnText}>Connect an agent</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={agents}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => <AgentCard agent={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerLeft: { gap: 4 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoMark: { width: 18, height: 18, borderRadius: 3, backgroundColor: Colors.accentCrimson },
  title: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3 },
  systemStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  systemStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accentTeal },
  systemStatusText: { color: Colors.accentTeal, fontSize: 9, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  connectBtn: {
    backgroundColor: 'rgba(193, 18, 31, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  connectBtnText: { color: Colors.accentCrimson, fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 16, gap: 10 },
  card: {
    backgroundColor: '#0f0f0f',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardActive: {},
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    backgroundColor: 'rgba(193, 18, 31, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: Colors.accentCrimson, fontSize: 20, fontWeight: '700' },
  agentName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  agentMeta: { color: Colors.textSecondary, fontSize: 11, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 12 },
  emptyIcon: { fontSize: 48, color: Colors.textMuted },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: Colors.textPrimary },
  emptySubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  emptyBtn: { backgroundColor: Colors.accentCrimson, borderRadius: 24, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  emptyBtnText: { color: Colors.bgPrimary, fontSize: 15, fontWeight: '600' },

  // Skeleton
  skeletonCard: { opacity: 0.5 },
  skeletonAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.bgElevated,
  },
  skeletonNameBar: {
    width: 120,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.bgElevated,
  },
  skeletonMetaBar: {
    width: 80,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.bgElevated,
  },
  skeletonBadge: {
    width: 56,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.bgElevated,
  },
})
