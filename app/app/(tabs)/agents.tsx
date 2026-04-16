import { useEffect, useRef, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Platform,
  Animated, Image as RNImage, Modal, ActivityIndicator, ScrollView, TextInput, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import {
  subscribeToSlug001, subscribeToUserAgents, createAgent, deleteAgent,
  type PaperAgentState,
} from '../../lib/firebase'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'
import type { Agent, AgentStatus } from '../../lib/types'
import { useDesktopWebLayout } from '../../lib/responsive'

// ── Helpers ───────────────────────────────────────────────────────────────────

function agentColor(name: string): string {
  const palette = ['#f59e0b', '#2dd4bf', '#a78bfa', '#60a5fa', '#34d399']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
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

const AGENT_STATUS_COLOR: Record<AgentStatus, string> = {
  connected: Colors.accentGreen,
  connecting: Colors.accentTeal,
  stale: Colors.accentAmber,
  error: Colors.accentRed,
  disconnected: Colors.textSecondary,
}

const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  connected: 'Active',
  connecting: 'Connecting',
  stale: 'Stale',
  error: 'Error',
  disconnected: 'Offline',
}

const SLUG001_STATUS: Record<string, { color: string; label: string }> = {
  active:    { color: Colors.accentGreen, label: 'Active' },
  paused:    { color: Colors.accentAmber, label: 'Paused' },
  cooldown:  { color: Colors.accentTeal,  label: 'Cooldown' },
  'no-trade':{ color: Colors.textMuted,   label: 'No Trade' },
}

// ── Slug #001 Card ────────────────────────────────────────────────────────────

function Slug001Card({ state }: { state: PaperAgentState | null }) {
  const s = state?.status ?? 'active'
  const { color, label } = SLUG001_STATUS[s] ?? SLUG001_STATUS.active
  const sessionPnl = state?.session_pnl ?? 0
  const isPositive = sessionPnl >= 0

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push('/agent/slug-001' as any)}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardTopLeft}>
          <View style={[styles.avatar, { borderColor: color, backgroundColor: 'rgba(217,119,87,0.1)' }]}>
            <Text style={[styles.avatarInitial, { color: Colors.accentAmber }]}>⬡</Text>
          </View>
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Text style={styles.agentName}>Slug #001</Text>
              <View style={styles.paperBadge}>
                <Text style={styles.paperBadgeText}>PAPER</Text>
              </View>
            </View>
            <Text style={styles.agentSlug}>@slugs/range-farmer</Text>
          </View>
        </View>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: color }]} />
          <Text style={[styles.statusText, { color }]}>{label}</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>SESSION PNL</Text>
          <Text style={[styles.statValue, { color: isPositive ? Colors.accentGreen : Colors.accentRed }]}>
            {isPositive ? '+$' : '-$'}{Math.abs(sessionPnl).toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.tag}>
          <Text style={styles.tagText}>grid</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
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

// ── User Agent card ───────────────────────────────────────────────────────────

function AgentCard({ agent, username }: { agent: Agent; username: string | null }) {
  const getConnectionStatus = useAgentsStore((s) => s.getConnectionStatus)
  const status = getConnectionStatus(agent.id)
  const meta = agent.metadata ?? {}
  const slugHandle = username
    ? `@${username}/${agent.name.toLowerCase().replace(/\s+/g, '-')}`
    : agent.name
  const unrealized: number = (agent as any).live_state?.unrealizedPnlUsd ?? null
  const hasUnrealized = unrealized !== null && unrealized !== undefined
  const isPos = hasUnrealized && unrealized >= 0

  function handleLongPress() {
    Alert.alert(
      'Remove Agent',
      `Remove "${agent.name}"? This won't affect any live trading — it just removes it from your list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: () => deleteAgent(agent.id).catch(() =>
            Alert.alert('Error', 'Could not remove agent. Try again.')
          ),
        },
      ]
    )
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/agent/${agent.id}` as any)}
      onLongPress={handleLongPress}
      delayLongPress={500}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardTopLeft}>
          <View style={[styles.avatar, { borderColor: AGENT_STATUS_COLOR[status], backgroundColor: agentColor(agent.name) + '22' }]}>
            <Text style={[styles.avatarInitial, { color: agentColor(agent.name) }]}>{agent.name[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.agentName}>{agent.name}</Text>
            <Text style={styles.agentSlug}>{slugHandle}</Text>
          </View>
        </View>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: AGENT_STATUS_COLOR[status] }]} />
          <Text style={[styles.statusText, { color: AGENT_STATUS_COLOR[status] }]}>{AGENT_STATUS_LABEL[status]}</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        {hasUnrealized ? (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>UNREALIZED PNL</Text>
            <Text style={[styles.statValue, { color: isPos ? Colors.accentGreen : Colors.accentRed }]}>
              {isPos ? '+$' : '-$'}{Math.abs(unrealized).toFixed(2)}
            </Text>
          </View>
        ) : (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>LAST SEEN</Text>
            <Text style={styles.statValue}>{timeAgo(agent.last_seen)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {(meta.platform as string) && (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{meta.platform as string}</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={handleLongPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.removeBtn}
        >
          <Ionicons name="trash-outline" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SlugsScreen() {
  const isDesktopWeb = useDesktopWebLayout()
  const { agents, setAgents, upsertAgent, loading, setLoading } = useAgentsStore()
  const { user, username } = useAuthStore()
  const [slug001, setSlug001] = useState<PaperAgentState | null>(null)

  // Deploy modal
  const [deployVisible, setDeployVisible] = useState(false)
  const [deployName, setDeployName] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [deployedAgent, setDeployedAgent] = useState<{ id: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // Subscribe to Slug #001 live state
  useEffect(() => {
    if (!user) return
    return subscribeToSlug001((state) => setSlug001(state))
  }, [user?.uid])

  // Subscribe to user's own agents
  useEffect(() => {
    if (!user) return
    setLoading(true)
    const unsub = subscribeToUserAgents(user.uid, (data) => {
      setAgents(data as Agent[])
      setLoading(false)
    })
    return unsub
  }, [user?.uid])

  async function handleDeploy() {
    if (!user || !deployName.trim()) return
    setDeploying(true)
    try {
      const id = await createAgent(user.uid, deployName.trim(), {
        protocol_version: '1.1',
        env: 'node',
        storage_mode: 'local',
      })
      setDeployedAgent({ id, name: deployName.trim() })
    } catch (e) {
      console.warn('[deploy]', e)
    }
    setDeploying(false)
  }

  const connectCmd = user ? `npx slugs-connector connect --token ${user.uid}` : ''

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

  return (
    <View style={styles.container}>
      <View style={[styles.pageFrame, isDesktopWeb && styles.pageFrameDesktop]}>
        {/* Header */}
        <View style={[styles.header, isDesktopWeb && styles.headerDesktop]}>
          <View style={styles.headerLeft}>
            <RNImage
              source={require('../../assets/slugs-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            {username && <Text style={styles.handleText}>@{username}</Text>}
            {isDesktopWeb ? <Text style={styles.desktopSubtitle}>Manage your connected slugs, paper traders, and live agents.</Text> : null}
          </View>
          <View style={styles.headerBtns}>
            <TouchableOpacity style={styles.connectBtn} onPress={() => router.push('/deploy' as any)}>
              <Text style={styles.connectBtnText}>+ Deploy</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Deploy modal */}
        <Modal visible={deployVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeDeploy}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{deployedAgent ? 'Agent Deployed' : 'Deploy a Slug'}</Text>
            <TouchableOpacity onPress={closeDeploy} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            {!deployedAgent ? (
              <>
                <Text style={styles.modalDesc}>Name your agent. It will appear in your slug list immediately.</Text>
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
                <Text style={styles.successSub}>Agent created. Run this to connect it:</Text>
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
                  onPress={() => { closeDeploy(); router.push(`/agent/${deployedAgent.id}` as any) }}
                >
                  <Text style={styles.viewAgentBtnText}>Open Agent →</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
        </Modal>

        <ScrollView contentContainerStyle={[styles.scrollContent, isDesktopWeb && styles.scrollContentDesktop]} showsVerticalScrollIndicator={false}>
        {/* Featured: Slug #001 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>FEATURED</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        </View>
        <Slug001Card state={slug001} />

        {/* User's own agents */}
        {loading ? (
          <View style={{ gap: 10, marginTop: 24 }}>
            <Text style={styles.sectionLabel}>YOUR SLUGS</Text>
            {[0, 1].map((i) => <SkeletonCard key={i} />)}
          </View>
        ) : agents.length > 0 ? (
          <View style={{ gap: 10, marginTop: 24 }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>YOUR SLUGS</Text>
              <TouchableOpacity onPress={() => router.push('/deploy' as any)}>
                <Text style={styles.deployLink}>+ Deploy</Text>
              </TouchableOpacity>
            </View>
            {agents.map((a) => <AgentCard key={a.id} agent={a} username={username} />)}
          </View>
        ) : (
          <View style={styles.connectPrompt}>
            <TouchableOpacity style={styles.connectPromptBtn} onPress={() => router.push('/deploy' as any)}>
              <Ionicons name="add" size={16} color={Colors.accentAmber} />
              <Text style={styles.connectPromptText}>Deploy your first agent</Text>
            </TouchableOpacity>
          </View>
        )}
        </ScrollView>
      </View>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  pageFrame: { flex: 1, width: '100%' },
  pageFrameDesktop: { maxWidth: 1120, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerDesktop: {
    paddingTop: 42,
    paddingHorizontal: 20,
    alignItems: 'flex-start',
  },
  headerLeft: { gap: 2 },
  logoImage: { width: 90, height: 27, tintColor: Colors.accentAmber },
  handleText: { fontSize: 11, color: Colors.textMuted, fontWeight: '500', letterSpacing: 0.3 },
  desktopSubtitle: { fontSize: 14, lineHeight: 22, color: Colors.textMuted, maxWidth: 460, marginTop: 8 },
  headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  connectBtn: {
    backgroundColor: 'rgba(217,119,87,0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  connectBtnText: { color: Colors.accentAmber, fontSize: 13, fontWeight: '600' },

  scrollContent: { paddingHorizontal: 16, paddingBottom: 120 },
  scrollContentDesktop: { paddingHorizontal: 20, paddingBottom: 56, maxWidth: 920, alignSelf: 'center', width: '100%' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.5 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accentGreen },
  liveText: { fontSize: 11, fontWeight: '700', color: Colors.accentGreen },
  deployLink: { fontSize: 12, fontWeight: '600', color: Colors.accentAmber },

  paperBadge: {
    backgroundColor: 'rgba(217,119,87,0.12)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(217,119,87,0.3)',
  },
  paperBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.accentAmber, letterSpacing: 0.8 },
  // User agent card
  card: { backgroundColor: '#0f0f0f', borderRadius: 16, padding: 16, gap: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1.5,
    backgroundColor: '#000', justifyContent: 'center', alignItems: 'center',
  },
  avatarInitial: { fontSize: 16, fontWeight: '700' },
  agentName: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  agentSlug: { color: Colors.textMuted, fontSize: 11, marginTop: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stat: { gap: 2 },
  statLabel: { fontSize: 9, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2 },
  statValue: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  tag: { backgroundColor: '#1a1a1a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  removeBtn: { padding: 4, marginLeft: 6 },
  tagText: { fontSize: 9, color: Colors.textMuted, fontWeight: '600', letterSpacing: 0.5 },

  hostedBadge: {
    backgroundColor: 'rgba(52,211,153,0.1)', borderWidth: 1, borderColor: Colors.accentGreen,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
  },
  hostedBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.accentGreen, letterSpacing: 0.5 },
  marketCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0f0f0f', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#1a1a1a',
  },
  marketIcon: {
    width: 44, height: 44, borderRadius: 12, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  marketName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  marketDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  // Connect prompt
  connectPrompt: { marginTop: 24, alignItems: 'center' },
  connectPromptBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: 'rgba(217,119,87,0.2)',
    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12,
  },
  connectPromptText: { color: Colors.accentAmber, fontSize: 13, fontWeight: '600' },

  // Modal
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

  // Skeleton
  skeletonAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgElevated },
  skeletonNameBar: { width: 120, height: 14, borderRadius: 7, backgroundColor: Colors.bgElevated },
  skeletonMetaBar: { width: 80, height: 10, borderRadius: 5, backgroundColor: Colors.bgElevated },
  skeletonBadge: { width: 56, height: 18, borderRadius: 9, backgroundColor: Colors.bgElevated },
  skeletonStats: { height: 32, borderRadius: 8, backgroundColor: Colors.bgElevated },
})
