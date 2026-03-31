import { useEffect, useRef, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Platform,
  Animated, Image as RNImage, Modal, TextInput, ActivityIndicator, ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'

function agentColor(name: string): string {
  const palette = ['#f59e0b', '#2dd4bf', '#a78bfa', '#60a5fa', '#34d399']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
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
  stale: 'Stale',
  error: 'Error',
  disconnected: 'Offline',
}

const SKELETON_MIN_MS = 1200

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const delta = Date.now() - new Date(iso).getTime()
  const s = Math.floor(delta / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

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
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.cardTop}>
        <View style={styles.cardTopLeft}>
          <View style={styles.skeletonAvatar} />
          <View style={{ gap: 8 }}>
            <View style={styles.skeletonNameBar} />
            <View style={styles.skeletonMetaBar} />
          </View>
        </View>
        <View style={styles.skeletonBadge} />
      </View>
      <View style={styles.skeletonStats} />
    </Animated.View>
  )
}

// ── Agent card ────────────────────────────────────────────────────────────────

function AgentCard({ agent, username }: { agent: Agent; username: string | null }) {
  const getConnectionStatus = useAgentsStore((s) => s.getConnectionStatus)
  const status = getConnectionStatus(agent.id)
  const meta = agent.metadata ?? {}

  const inputTokens: number = (meta.last_input_tokens as number) ?? 0
  const outputTokens: number = (meta.last_output_tokens as number) ?? 0
  const hasTokens = inputTokens > 0 || outputTokens > 0
  const storageMode = meta.storage_mode as string | undefined
  const poweredBy = meta.powered_by as string | undefined
  const agentPlatform = meta.platform as string | undefined
  const slugHandle = username ? `@${username}/${agent.name.toLowerCase().replace(/\s+/g, '-')}` : agent.name

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/agent/${agent.id}`)}
      activeOpacity={0.8}
    >
      {/* Top row */}
      <View style={styles.cardTop}>
        <View style={styles.cardTopLeft}>
          <View style={[styles.avatar, { borderColor: STATUS_COLOR[status], backgroundColor: agentColor(agent.name) + '22' }]}>
            <Text style={[styles.avatarInitial, { color: agentColor(agent.name) }]}>{agent.name[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.agentName}>{agent.name}</Text>
            <Text style={styles.agentSlug}>{slugHandle}</Text>
          </View>
        </View>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] }]} />
          <Text style={[styles.statusText, { color: STATUS_COLOR[status] }]}>{STATUS_LABEL[status]}</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>HEARTBEAT</Text>
          <Text style={styles.statValue}>{timeAgo(agent.last_seen)}</Text>
        </View>
        {hasTokens && (
          <>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statLabel}>IN</Text>
              <Text style={styles.statValue}>{formatTokens(inputTokens)}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statLabel}>OUT</Text>
              <Text style={styles.statValue}>{formatTokens(outputTokens)}</Text>
            </View>
          </>
        )}
        <View style={{ flex: 1 }} />
        <View style={styles.tagRow}>
          {agentPlatform && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{agentPlatform}</Text>
            </View>
          )}
          {storageMode && storageMode !== 'cloud' && (
            <View style={[styles.tag, styles.tagPrivate]}>
              <Text style={[styles.tagText, styles.tagPrivateText]}>
                {storageMode === 'relay' ? 'relay' : 'local'}
              </Text>
            </View>
          )}
          {poweredBy && (
            <View style={[styles.tag, styles.tagPowered]}>
              <Text style={[styles.tagText, styles.tagPoweredText]}>{poweredBy}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'active' | 'offline'

export default function SlugsScreen() {
  const { agents, setAgents, upsertAgent, loading, setLoading } = useAgentsStore()
  const { user, username } = useAuthStore()
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Deploy modal
  const [deployVisible, setDeployVisible] = useState(false)
  const [deployName, setDeployName] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [deployedAgent, setDeployedAgent] = useState<{ id: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleDeploy() {
    if (!user || !deployName.trim()) return
    setDeploying(true)
    const { data, error } = await supabase
      .from('agents')
      .insert({ name: deployName.trim(), status: 'disconnected', user_id: user.id, metadata: { protocol_version: '1.1', env: 'node', storage_mode: 'local' } })
      .select()
      .single()
    setDeploying(false)
    if (!error && data) {
      upsertAgent(data as Agent)
      setDeployedAgent({ id: data.id, name: data.name })
    }
  }

  const connectCmd = user ? `npx slugs-connector connect --token ${user.id}` : ''

  async function handleCopy() {
    await Clipboard.setStringAsync(connectCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function closeDeploy() {
    setDeployVisible(false)
    setDeployName('')
    setDeployedAgent(null)
    setCopied(false)
  }

  useEffect(() => {
    if (!user) return

    const fetchAgents = async () => {
      const start = Date.now()
      const { data } = await supabase
        .from('agents')
        .select('*')
        .eq('user_id', user.id)

      setAgents(data ?? [])

      const elapsed = Date.now() - start
      const delay = Math.max(0, SKELETON_MIN_MS - elapsed)
      setTimeout(() => setLoading(false), delay)
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
        if (payload.eventType === 'INSERT') upsertAgent(payload.new as Agent)
        if (payload.eventType === 'UPDATE') upsertAgent(payload.new as Agent)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel); clearInterval(poll) }
  }, [user])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <RNImage
            source={require('../../assets/slugs-logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          {username && (
            <Text style={styles.handleText}>@{username}</Text>
          )}
        </View>
        <View style={styles.headerBtns}>
          <TouchableOpacity style={styles.deployBtn} onPress={() => setDeployVisible(true)}>
            <Text style={styles.deployBtnText}>⚡ Deploy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.connectBtn} onPress={() => router.push('/connect')}>
            <Text style={styles.connectBtnText}>+ Connect</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Deploy modal ── */}
      <Modal visible={deployVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeDeploy}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {deployedAgent ? 'Agent Deployed' : 'Deploy a Slug'}
            </Text>
            <TouchableOpacity onPress={closeDeploy} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {!deployedAgent ? (
              <>
                <Text style={styles.modalDesc}>Name your agent. It will appear in your slug list immediately — then connect it to a live process whenever you're ready.</Text>
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>Agent Name</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={deployName}
                    onChangeText={setDeployName}
                    placeholder="e.g. OKX Trader, Research Bot"
                    placeholderTextColor={Colors.textMuted}
                    autoFocus
                    autoCapitalize="words"
                    returnKeyType="done"
                    onSubmitEditing={handleDeploy}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.deployConfirmBtn, (!deployName.trim() || deploying) && { opacity: 0.4 }]}
                  onPress={handleDeploy}
                  disabled={!deployName.trim() || deploying}
                >
                  {deploying
                    ? <ActivityIndicator size="small" color={Colors.bgPrimary} />
                    : <Text style={styles.deployConfirmBtnText}>Deploy Agent</Text>
                  }
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.successIcon}>
                  <Ionicons name="checkmark-circle" size={56} color={Colors.accentGreen} />
                </View>
                <Text style={styles.successName}>{deployedAgent.name}</Text>
                <Text style={styles.successSub}>Agent created. Run this command to connect it to a live process:</Text>

                <View style={styles.cmdBox}>
                  <View style={styles.cmdBoxHeader}>
                    <View style={styles.cmdDots}>
                      <View style={[styles.dot, { backgroundColor: '#ff5f57' }]} />
                      <View style={[styles.dot, { backgroundColor: '#ffbd2e' }]} />
                      <View style={[styles.dot, { backgroundColor: '#28c840' }]} />
                    </View>
                    <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
                      <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={15} color={copied ? Colors.accentGreen : Colors.textSecondary} />
                      <Text style={[styles.copyBtnText, copied && { color: Colors.accentGreen }]}>{copied ? 'Copied' : 'Copy'}</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ padding: 14 }}>
                    <Text style={styles.cmdText}>{connectCmd}</Text>
                  </ScrollView>
                </View>

                <TouchableOpacity
                  style={styles.viewAgentBtn}
                  onPress={() => { closeDeploy(); router.push(`/agent/${deployedAgent.id}`) }}
                >
                  <Text style={styles.viewAgentBtnText}>Open Agent →</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search agents or @username…"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter pills */}
      {!loading && agents.length > 0 && (
        <View style={styles.filterRow}>
          {(['all', 'active', 'offline'] as FilterStatus[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterPill, filter === f && styles.filterPillActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : agents.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="hardware-chip-outline" size={48} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No slugs yet</Text>
          <Text style={styles.emptySubtitle}>Connect your first agent in one command — Claude Code, Telegram, or any terminal.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/connect')}>
            <Ionicons name="add" size={18} color={Colors.bgPrimary} />
            <Text style={styles.emptyBtnText}>Connect a slug</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(tabs)/feed')}>
            <Text style={styles.emptySecondary}>Explore the feed first →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={agents.filter((a) => {
            const q = searchQuery.trim().toLowerCase()
            if (q && !a.name.toLowerCase().includes(q)) return false
            if (filter === 'all') return true
            const s = a.status ?? 'disconnected'
            if (filter === 'active') return ['connected', 'connecting', 'stale'].includes(s)
            return ['disconnected', 'error'].includes(s)
          })}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => <AgentCard agent={item} username={username} />}
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
  headerLeft: { gap: 2 },
  logoImage: { width: 90, height: 27, tintColor: Colors.accentAmber },
  handleText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  deployBtn: {
    backgroundColor: 'rgba(99,102,241,0.12)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)',
  },
  deployBtnText: { color: '#a5b4fc', fontSize: 13, fontWeight: '600' },
  connectBtn: {
    backgroundColor: 'rgba(217,119,87,0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  connectBtnText: { color: Colors.accentAmber, fontSize: 13, fontWeight: '600' },

  // Deploy modal
  modalContainer: { flex: 1, backgroundColor: Colors.bgPrimary },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.bgBorder,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgElevated, justifyContent: 'center', alignItems: 'center' },
  modalContent: { padding: 24, gap: 20 },
  modalDesc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },
  fieldBlock: { gap: 8 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  fieldInput: {
    backgroundColor: Colors.bgSurface, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.bgBorder, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: Colors.textPrimary,
  },
  deployConfirmBtn: { backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  deployConfirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  successIcon: { alignItems: 'center', paddingVertical: 8 },
  successName: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  successSub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  cmdBox: { backgroundColor: '#080808', borderRadius: 12, borderWidth: 1, borderColor: Colors.bgBorder, overflow: 'hidden' },
  cmdBoxHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.bgBorder,
  },
  cmdDots: { flexDirection: 'row', gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  copyBtnText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  cmdText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: Colors.accentGreen, lineHeight: 18 },
  viewAgentBtn: { backgroundColor: Colors.bgElevated, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.bgBorder },
  viewAgentBtnText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    minHeight: 52,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.textPrimary,
    padding: 0,
    marginLeft: 2,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
  },
  filterPillActive: {
    backgroundColor: 'rgba(217,119,87,0.12)',
    borderColor: Colors.accentAmber,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  filterPillTextActive: {
    color: Colors.accentAmber,
  },
  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 100 },

  // Card
  card: {
    backgroundColor: '#0f0f0f',
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarInitial: { fontSize: 18, fontWeight: '700' },
  agentName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  agentSlug: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stat: { gap: 2 },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.2,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.bgBorder,
  },
  tagRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  tag: {
    backgroundColor: Colors.bgElevated,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  tagText: { fontSize: 9, color: Colors.textMuted, fontWeight: '600', letterSpacing: 0.5 },
  tagPrivate: { backgroundColor: 'rgba(0,200,150,0.08)' },
  tagPrivateText: { color: Colors.accentGreen },
  tagPowered: { backgroundColor: 'rgba(168,85,247,0.08)' },
  tagPoweredText: { color: Colors.accentPurple },

  // Empty
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 12 },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: Colors.bgElevated,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accentAmber,
    borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, marginTop: 4,
  },
  emptyBtnText: { color: Colors.bgPrimary, fontSize: 15, fontWeight: '700' },
  emptySecondary: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },

  // Skeleton
  skeletonAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.bgElevated },
  skeletonNameBar: { width: 120, height: 14, borderRadius: 7, backgroundColor: Colors.bgElevated },
  skeletonMetaBar: { width: 80, height: 10, borderRadius: 5, backgroundColor: Colors.bgElevated },
  skeletonBadge: { width: 56, height: 18, borderRadius: 9, backgroundColor: Colors.bgElevated },
  skeletonStats: { height: 32, borderRadius: 8, backgroundColor: Colors.bgElevated },
})
