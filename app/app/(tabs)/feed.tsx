import { useEffect, useRef, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, Platform, TouchableOpacity,
  Modal, ScrollView, Animated,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import {
  subscribeToFollowing,
  subscribeToPublicFeed,
  subscribeToTrackedAgents,
  subscribeToTrackedAgentFeed,
  subscribeToTrackedAgentDocs,
  subscribeToUserAgentsPnl,
  publishAgentPnl,
  getPnlSharingPref,
  setPnlSharingPref,
} from '../../lib/firebase'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'
import { useDesktopWebLayout } from '../../lib/responsive'

// ── Types ─────────────────────────────────────────────────────────────────────

type CardType = 'pnl' | 'update' | 'system'
type SharingPref = 'auto' | 'manual' | 'private' | null

interface PnLData {
  symbol?: string
  pnl: number
  pct: number
  side?: string
}

interface FeedItem {
  id: string
  agent_id: string
  user_id: string
  agentName: string
  content: string
  created_at: string
  cardType: CardType
  pnl?: PnLData | null
  payload?: Record<string, any>
  rawType?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: string): string {
  const d = new Date(ts)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function toFeedItem(raw: any, nameMap?: Map<string, string>): FeedItem {
  const cardType: CardType =
    raw.type === 'pnl' || raw.type === 'daily_pnl' ? 'pnl'
    : raw.type === 'system' ? 'system'
    : 'update'

  const pnlVal = raw.payload?.pnl ?? null
  const pnl: PnLData | null =
    cardType === 'pnl' && pnlVal != null
      ? { pnl: Number(pnlVal), pct: raw.payload?.pct ?? 0, symbol: raw.payload?.symbol, side: raw.payload?.side }
      : null

  const agentName = raw.agent_name || (nameMap instanceof Map ? nameMap.get(String(raw.agent_id ?? '')) : undefined) || 'Agent'

  return {
    id: raw.id,
    agent_id: raw.agent_id,
    user_id: raw.user_id,
    agentName,
    content: raw.content,
    created_at: raw.created_at,
    cardType,
    pnl,
    payload: raw.payload,
    rawType: raw.type,
  }
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function agentColor(name: string): string {
  const palette = ['#f59e0b', '#2dd4bf', '#a78bfa', '#60a5fa', '#34d399']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

function AgentAvatar({ name }: { name: string }) {
  const color = agentColor(name)
  return (
    <View style={[styles.avatar, { backgroundColor: color + '22', borderColor: color }]}>
      <Text style={[styles.avatarText, { color }]}>{name[0]?.toUpperCase() ?? 'A'}</Text>
    </View>
  )
}

// ── Cards ──────────────────────────────────────────────────────────────────────

function PnLCard({ item }: { item: FeedItem }) {
  const data = item.pnl
  const isPositive = !data || data.pnl >= 0
  const pnlColor = isPositive ? Colors.accentGreen : Colors.accentRed

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => router.push(`/agent/${item.agent_id}` as any)}
      style={styles.card}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.agentRow}>
          <AgentAvatar name={item.agentName} />
          <View style={{ gap: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.agentName}>{item.agentName}</Text>
              {data?.symbol && (
                <View style={styles.symbolBadge}>
                  <Text style={styles.symbolText}>{data.symbol}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
      </View>

      {data && (
        <View style={styles.pnlRow}>
          <Text style={[styles.pnlDollar, { color: pnlColor }]}>
            {data.pnl >= 0 ? '+$' : '-$'}{Math.abs(data.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          {data.pct !== 0 && (
            <Text style={[styles.pnlPct, { color: pnlColor }]}>
              {data.pct > 0 ? '+' : ''}{data.pct.toFixed(2)}%
            </Text>
          )}
        </View>
      )}

      <View style={styles.cardTypeRow}>
        <Text style={[styles.cardTypeText, { color: Colors.accentGreen }]}>◆ Unrealized PnL</Text>
        <Text style={styles.cardChevron}>›</Text>
      </View>
    </TouchableOpacity>
  )
}

function UpdateCard({ item }: { item: FeedItem }) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => router.push(`/agent/${item.agent_id}` as any)}
      style={styles.card}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.agentRow}>
          <AgentAvatar name={item.agentName} />
          <Text style={styles.agentName}>{item.agentName}</Text>
        </View>
        <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
      </View>
      <Text style={styles.cardContent}>{item.content}</Text>
      <View style={styles.cardTypeRow}>
        <Text style={styles.cardChevron}>›</Text>
      </View>
    </TouchableOpacity>
  )
}

function renderCard(item: FeedItem) {
  if (item.cardType === 'pnl' && item.pnl != null) return <PnLCard item={item} />
  return <UpdateCard item={item} />
}

// ── Empty states ───────────────────────────────────────────────────────────────

function EmptyFollowing() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>◎</Text>
      <Text style={styles.emptyTitle}>No one here yet</Text>
      <Text style={styles.emptySubtitle}>Follow traders or track specific slugs to see performance updates in your feed.</Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/search' as any)}>
        <Text style={styles.emptyBtnText}>Find People & Slugs</Text>
      </TouchableOpacity>
    </View>
  )
}

function EmptyPosts() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>◎</Text>
      <Text style={styles.emptyTitle}>Feed is quiet</Text>
      <Text style={styles.emptySubtitle}>The people and slugs you follow have not shared any public updates yet.</Text>
    </View>
  )
}

// ── PnL Sharing Prompt ────────────────────────────────────────────────────────

function PnlSharingPrompt({
  visible,
  onSelect,
}: {
  visible: boolean
  onSelect: (pref: 'auto' | 'manual' | 'private') => void
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => onSelect('private')}
    >
      <View style={styles.promptContainer}>
        <View style={styles.promptHandle} />

        <View style={styles.promptHeader}>
          <Text style={styles.promptTitle}>Share your PnL?</Text>
          <Text style={styles.promptSubtitle}>
            Let your followers see how your agents are performing.
          </Text>
        </View>

        <View style={styles.promptOptions}>
          {/* Auto share */}
          <TouchableOpacity style={styles.optionCard} onPress={() => onSelect('auto')} activeOpacity={0.8}>
            <View style={[styles.optionIcon, { backgroundColor: 'rgba(0,200,150,0.12)' }]}>
              <Ionicons name="flash" size={20} color={Colors.accentGreen} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Share All Agents</Text>
              <Text style={styles.optionDesc}>Automatically post live PnL for all your agents. Followers see updates as they happen.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Manual share */}
          <TouchableOpacity style={styles.optionCard} onPress={() => onSelect('manual')} activeOpacity={0.8}>
            <View style={[styles.optionIcon, { backgroundColor: 'rgba(99,102,241,0.12)' }]}>
              <Ionicons name="send" size={20} color="#818cf8" />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Post Manually</Text>
              <Text style={styles.optionDesc}>You control what gets shared. Tap "Post PnL" whenever you want to show off a win (or a lesson).</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Keep private */}
          <TouchableOpacity style={[styles.optionCard, styles.optionCardMuted]} onPress={() => onSelect('private')} activeOpacity={0.8}>
            <View style={[styles.optionIcon, { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
              <Ionicons name="lock-closed" size={20} color={Colors.textMuted} />
            </View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: Colors.textMuted }]}>Keep Private</Text>
              <Text style={styles.optionDesc}>Only you can see your PnL. You can change this anytime in settings.</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// ── Post PnL Modal ────────────────────────────────────────────────────────────

function PostPnlModal({
  visible,
  agents,
  onClose,
  onPost,
}: {
  visible: boolean
  agents: any[]
  onClose: () => void
  onPost: (agent: any) => void
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.promptContainer}>
        <View style={styles.promptHandle} />
        <View style={styles.promptHeader}>
          <Text style={styles.promptTitle}>Post PnL</Text>
          <Text style={styles.promptSubtitle}>Choose an agent to share with your followers.</Text>
        </View>

        {agents.length === 0 ? (
          <View style={styles.noAgentsPnl}>
            <Text style={styles.noAgentsPnlText}>No agents with live PnL data right now.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.agentList}>
            {agents.map((a) => {
              const unrealized: number = a.live_state?.unrealizedPnlUsd ?? 0
              const isPos = unrealized >= 0
              return (
                <TouchableOpacity key={a.id} style={styles.agentPostRow} onPress={() => onPost(a)} activeOpacity={0.8}>
                  <View style={styles.agentPostLeft}>
                    <View style={[styles.agentPostAvatar, { backgroundColor: agentColor(a.name) + '22', borderColor: agentColor(a.name) }]}>
                      <Text style={[styles.avatarText, { color: agentColor(a.name) }]}>{a.name[0].toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={styles.agentPostName}>{a.name}</Text>
                      <Text style={styles.agentPostLabel}>Unrealized PnL</Text>
                    </View>
                  </View>
                  <Text style={[styles.agentPostPnl, { color: isPos ? Colors.accentGreen : Colors.accentRed }]}>
                    {isPos ? '+$' : '-$'}{Math.abs(unrealized).toFixed(2)}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}

        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

// ── Tracked Slug Card ──────────────────────────────────────────────────────────

function TrackedSlugCard({ agent }: { agent: { id: string; name: string; status: string; last_seen: string | null; live_state: Record<string, any> | null } }) {
  const pnl: number = agent.live_state?.unrealizedPnlUsd ?? 0
  const isPos = pnl >= 0
  const hasPnl = agent.live_state?.unrealizedPnlUsd != null
  const isOnline = agent.status === 'connected'
  const color = agentColor(agent.name)

  return (
    <TouchableOpacity
      style={trackedStyles.card}
      onPress={() => router.push(`/agent/${agent.id}` as any)}
      activeOpacity={0.75}
    >
      <View style={[trackedStyles.avatar, { backgroundColor: color + '22', borderColor: isOnline ? Colors.accentGreen : color }]}>
        <Text style={[trackedStyles.avatarText, { color }]}>{agent.name[0]?.toUpperCase() ?? '?'}</Text>
        {isOnline && <View style={trackedStyles.onlineDot} />}
      </View>
      <Text style={trackedStyles.name} numberOfLines={1}>{agent.name}</Text>
      {hasPnl ? (
        <Text style={[trackedStyles.pnl, { color: isPos ? Colors.accentGreen : Colors.accentRed }]}>
          {isPos ? '+$' : '-$'}{Math.abs(pnl).toFixed(2)}
        </Text>
      ) : (
        <Text style={trackedStyles.pnlMuted}>No data</Text>
      )}
    </TouchableOpacity>
  )
}

function TrackedSlugsSection({ agentIds }: { agentIds: string[] }) {
  const [agents, setAgents] = useState<any[]>([])

  useEffect(() => {
    return subscribeToTrackedAgentDocs(agentIds, setAgents)
  }, [agentIds.join(',')])

  if (agents.length === 0) return null

  return (
    <View style={trackedStyles.section}>
      <Text style={trackedStyles.sectionLabel}>TRACKING</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={trackedStyles.row}>
        {agents.map((a) => <TrackedSlugCard key={a.id} agent={a} />)}
      </ScrollView>
    </View>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const isDesktopWeb = useDesktopWebLayout()
  const { user } = useAuthStore()
  const [followingUids, setFollowingUids] = useState<string[]>([])
  const [trackedAgentIds, setTrackedAgentIds] = useState<string[]>([])
  const [trackedAgentDocs, setTrackedAgentDocs] = useState<any[]>([])
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [followingFeed, setFollowingFeed] = useState<FeedItem[]>([])
  const [trackedFeed, setTrackedFeed] = useState<FeedItem[]>([])
  const [userAgents, setUserAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sharingPref, setSharingPref] = useState<SharingPref>(undefined as any)
  const [showSharingPrompt, setShowSharingPrompt] = useState(false)
  const [showPostModal, setShowPostModal] = useState(false)
  const [posting, setPosting] = useState(false)

  // Load sharing pref once
  useEffect(() => {
    if (!user) return
    getPnlSharingPref(user.uid).then((pref) => {
      setSharingPref(pref)
      // Show prompt if: pref never set AND user has agents with live data
      if (pref === null) {
        // Will check again after agents load
      }
    })
  }, [user?.uid])

  // Subscribe to following list
  useEffect(() => {
    if (!user) return
    return subscribeToFollowing(user.uid, (ids) => {
      setFollowingUids(ids)
    })
  }, [user?.uid])

  useEffect(() => {
    if (!user) return
    return subscribeToTrackedAgents(user.uid, (ids) => {
      setTrackedAgentIds(ids)
    })
  }, [user?.uid])

  useEffect(() => {
    if (trackedAgentIds.length === 0) { setTrackedAgentDocs([]); return }
    return subscribeToTrackedAgentDocs(trackedAgentIds, setTrackedAgentDocs)
  }, [trackedAgentIds.join(',')])

  // Subscribe to followed users' public feed
  useEffect(() => {
    if (!user) return
    if (followingUids.length === 0) {
      setFollowingFeed([])
      return
    }
    const unsub = subscribeToPublicFeed(followingUids, (events) => {
      setFollowingFeed(events.map(toFeedItem))
    })
    return unsub
  }, [user?.uid, followingUids.join(',')])

  useEffect(() => {
    if (!user) return
    if (trackedAgentIds.length === 0) {
      setTrackedFeed([])
      return
    }
    const nameMap = new Map(trackedAgentDocs.map((a) => [a.id, a.name]))
    const unsub = subscribeToTrackedAgentFeed(trackedAgentIds, (events) => {
      setTrackedFeed(events.map((e) => toFeedItem(e, nameMap)))
    })
    return unsub
  }, [user?.uid, trackedAgentIds.join(','), trackedAgentDocs])

  useEffect(() => {
    const merged = [...followingFeed, ...trackedFeed]
      .reduce((rows, item) => {
        if (!rows.some((row) => row.id === item.id)) rows.push(item)
        return rows
      }, [] as FeedItem[])
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setFeedItems(merged)
    setLoading(false)
  }, [followingFeed, trackedFeed])

  // Subscribe to user's own agents with live PnL (for posting + prompt trigger)
  useEffect(() => {
    if (!user) return
    return subscribeToUserAgentsPnl(user.uid, (agents) => {
      setUserAgents(agents)
      // Show prompt once if pref unset and they have live data
      setSharingPref((prev) => {
        if (prev === null && agents.length > 0) {
          setShowSharingPrompt(true)
        }
        return prev
      })
    })
  }, [user?.uid])

  async function handleSharingPrefSelect(pref: 'auto' | 'manual' | 'private') {
    if (!user) return
    setShowSharingPrompt(false)
    setSharingPref(pref)
    await setPnlSharingPref(user.uid, pref)
  }

  async function handlePostPnl(agent: any) {
    if (!user || posting) return
    setPosting(true)
    setShowPostModal(false)
    try {
      await publishAgentPnl(
        user.uid,
        agent.id,
        agent.name,
        agent.live_state?.unrealizedPnlUsd ?? 0,
        agent.live_state?.dailyPnlUsd ?? null,
      )
    } catch (e) {
      console.warn('[feed] post pnl error', e)
    }
    setPosting(false)
  }

  const showPostBtn = sharingPref === 'manual' && userAgents.length > 0

  return (
    <View style={styles.container}>
      <View style={[styles.pageFrame, isDesktopWeb && styles.pageFrameDesktop]}>
        {/* Header */}
        <View style={[styles.header, isDesktopWeb && styles.headerDesktop]}>
          <View>
            <Text style={styles.title}>Feed</Text>
            {isDesktopWeb ? <Text style={styles.desktopSubtitle}>Performance from the traders you follow and the specific slugs you track.</Text> : null}
          </View>
          <View style={styles.headerRight}>
            {showPostBtn && (
              <TouchableOpacity
                style={[styles.postBtn, posting && { opacity: 0.5 }]}
                onPress={() => !posting && setShowPostModal(true)}
                disabled={posting}
              >
                <Ionicons name="send" size={13} color={Colors.accentAmber} />
                <Text style={styles.postBtnText}>Post PnL</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tracked slugs row */}
        {trackedAgentIds.length > 0 && (
          <TrackedSlugsSection agentIds={trackedAgentIds} />
        )}

        {/* Feed */}
        {loading ? null : followingUids.length === 0 && trackedAgentIds.length === 0 ? (
          <EmptyFollowing />
        ) : feedItems.length === 0 ? (
          <EmptyPosts />
        ) : (
          <FlatList
            style={styles.feedList}
            data={feedItems}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <View style={isDesktopWeb ? styles.desktopListItem : undefined}>
                {renderCard(item)}
              </View>
            )}
            contentContainerStyle={[styles.list, isDesktopWeb && styles.listDesktop]}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Modals */}
      <PnlSharingPrompt
        visible={showSharingPrompt}
        onSelect={handleSharingPrefSelect}
      />
      <PostPnlModal
        visible={showPostModal}
        agents={userAgents}
        onClose={() => setShowPostModal(false)}
        onPost={handlePostPnl}
      />
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  pageFrame: { flex: 1, width: '100%' },
  pageFrameDesktop: {
    alignSelf: 'center',
    maxWidth: 1080,
  },

  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerDesktop: {
    paddingTop: 42,
    paddingHorizontal: 20,
  },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  desktopSubtitle: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  postBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(217,119,87,0.1)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(217,119,87,0.2)',
  },
  postBtnText: { color: Colors.accentAmber, fontSize: 13, fontWeight: '600' },

  feedList: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 10 },
  listDesktop: { paddingHorizontal: 20, paddingBottom: 48 },
  desktopListItem: { width: '100%', maxWidth: 760, alignSelf: 'center' },

  // Cards
  card: { backgroundColor: '#0f0f0f', borderRadius: 16, padding: 16, gap: 10 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  agentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  agentName: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  timestamp: { fontSize: 11, color: Colors.textMuted },

  avatar: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '700' },

  symbolBadge: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  symbolText: { fontSize: 10, fontWeight: '700', color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  pnlRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  pnlDollar: { fontSize: 28, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  pnlPct: { fontSize: 16, fontWeight: '600' },

  cardContent: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  cardTypeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTypeText: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  cardChevron: { fontSize: 18, color: Colors.textMuted, lineHeight: 20 },

  // Empty states
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingBottom: 80 },
  emptyIcon: { fontSize: 40, color: Colors.textMuted },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textSecondary },
  emptySubtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(217,119,87,0.1)', borderRadius: 20,
    paddingHorizontal: 24, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(217,119,87,0.25)',
  },
  emptyBtnText: { color: Colors.accentAmber, fontSize: 14, fontWeight: '600' },

  // PnL sharing prompt
  promptContainer: {
    flex: 1, backgroundColor: Colors.bgPrimary,
    paddingHorizontal: 20, paddingBottom: 40,
  },
  promptHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.bgBorder,
    alignSelf: 'center', marginTop: 12, marginBottom: 28,
  },
  promptHeader: { gap: 8, marginBottom: 28 },
  promptTitle: { fontSize: 24, fontWeight: '700', color: Colors.textPrimary },
  promptSubtitle: { fontSize: 14, color: Colors.textMuted, lineHeight: 20 },
  promptOptions: { gap: 10 },

  optionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#0f0f0f', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  optionCardMuted: { borderColor: 'transparent', backgroundColor: '#0a0a0a' },
  optionIcon: {
    width: 42, height: 42, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  optionText: { flex: 1, gap: 4 },
  optionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  optionDesc: { fontSize: 12, color: Colors.textMuted, lineHeight: 17 },

  // Post PnL modal
  agentList: { paddingVertical: 8, gap: 8 },
  agentPostRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0f0f0f', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  agentPostLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  agentPostAvatar: {
    width: 38, height: 38, borderRadius: 19, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  agentPostName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  agentPostLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  agentPostPnl: { fontSize: 17, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  cancelBtn: {
    marginTop: 16,
    backgroundColor: Colors.bgElevated, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.bgBorder,
  },
  cancelBtnText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '600' },
  noAgentsPnl: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noAgentsPnlText: { fontSize: 14, color: Colors.textMuted },
})

const trackedStyles = StyleSheet.create({
  section: { paddingBottom: 4 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 1.2, textTransform: 'uppercase',
    paddingHorizontal: 20, paddingBottom: 10,
  },
  row: { paddingHorizontal: 16, gap: 10 },
  card: {
    width: 110,
    backgroundColor: '#0f0f0f',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700' },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.accentGreen,
    borderWidth: 2, borderColor: '#0f0f0f',
  },
  name: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },
  pnl: { fontSize: 13, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  pnlMuted: { fontSize: 11, color: Colors.textMuted },
})
