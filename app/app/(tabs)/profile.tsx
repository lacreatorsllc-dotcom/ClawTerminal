import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, router } from 'expo-router'
import {
  getProfile,
  listAgentsForUser,
  listPublicFeedEventsForUser,
  listFollowersOf,
  listFollowingUsers,
  subscribeToUserAgents,
  type PublicUserListItem,
} from '../../lib/firebase'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'
import type { AgentStatus } from '../../lib/types'

function agentColor(name: string): string {
  const palette = ['#f59e0b', '#2dd4bf', '#a78bfa', '#60a5fa', '#34d399']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

const STATUS_COLOR: Record<AgentStatus, string> = {
  connected: Colors.accentGreen,
  connecting: Colors.accentTeal,
  stale: Colors.accentAmber,
  error: Colors.accentRed,
  disconnected: Colors.textSecondary,
}

interface AgentRow {
  id: string
  name: string
  status: AgentStatus
  last_seen: string | null
  last_synced?: string | null
  live_state?: {
    unrealizedPnlUsd?: number | null
    unrealized_pnl?: number | null
    dailyPnlUsd?: number | null
    daily_pnl?: number | null
    session_pnl?: number | null
  } | null
}

function agentActivityIso(agent: { last_seen?: string | null; last_synced?: string | null }) {
  return agent.last_seen ?? agent.last_synced ?? null
}

interface FeedRow {
  id: string
  type: string
  content: string
  created_at: string
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function readFiniteNumber(...values: any[]): number | null {
  for (const value of values) {
    if (value == null || value === '') continue
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

function resolvePositionPnl(position: any): number | null {
  const explicit = readFiniteNumber(
    position?.unrealizedPnlUsd,
    position?.unrealized_pnl,
    position?.unrealizedPnl,
    position?.unrealized,
    position?.floatingPnl,
    position?.pnl,
  )
  if (explicit != null) return explicit

  const current = readFiniteNumber(
    position?.currentPrice,
    position?.current_price,
    position?.markPrice,
    position?.mark_price,
  )
  const entry = readFiniteNumber(
    position?.entryPrice,
    position?.entry_price,
    position?.fillPrice,
    position?.fill_price,
  )
  const qty = readFiniteNumber(position?.qty, position?.size, position?.quantity)
  const sizeUsd = readFiniteNumber(position?.sizeUsd, position?.positionSize)
  const sideRaw = String(position?.side ?? position?.direction ?? '').toLowerCase()
  const multiplier = sideRaw.includes('sell') || sideRaw.includes('short') ? -1 : 1

  if (current != null && entry != null && qty != null && qty !== 0) {
    return (current - entry) * qty * multiplier
  }

  if (current != null && entry != null && entry > 0 && sizeUsd != null && sizeUsd > 0) {
    return multiplier * ((current - entry) / entry) * sizeUsd
  }

  return null
}

function resolveAgentPnl(agent: AgentRow): number | null {
  const metadata = (agent as any).metadata ?? {}
  const metadataLive = metadata.live_state ?? metadata.liveState ?? null
  const live = agent.live_state ?? metadataLive ?? null
  const openPositions = Array.isArray(live?.openPositions)
    ? live.openPositions
    : Array.isArray(live?.positions)
      ? live.positions
      : Array.isArray(live?.open_positions)
        ? live.open_positions
        : []
  const recentTrades = Array.isArray(live?.recentTrades)
    ? live.recentTrades
    : Array.isArray(live?.recent_trades)
      ? live.recent_trades
      : []

  const explicit = readFiniteNumber(
    live?.unrealizedPnlUsd,
    live?.unrealized_pnl,
    live?.unrealizedPnl,
    live?.dailyPnlUsd,
    live?.daily_pnl,
    live?.dailyPnl,
    live?.session_pnl,
    metadata.unrealizedPnlUsd,
    metadata.unrealized_pnl,
    metadata.unrealizedPnl,
    metadata.dailyPnlUsd,
    metadata.daily_pnl,
    metadata.dailyPnl,
    metadata.session_pnl,
  )
  if (explicit != null) return explicit

  const positionPnl = openPositions
    .map((position: any) => resolvePositionPnl(position))
    .filter((value: number | null): value is number => value != null)
  if (positionPnl.length > 0) {
    return positionPnl.reduce((sum: number, value: number) => sum + value, 0)
  }

  const tradePnl = recentTrades
    .map((trade: any) => readFiniteNumber(
      trade?.pnlUsd,
      trade?.pnl,
      trade?.realizedPnlUsd,
      trade?.realized_pnl,
      trade?.realizedPnl,
      trade?.unrealizedPnlUsd,
      trade?.unrealized_pnl,
      trade?.unrealizedPnl,
    ))
    .filter((value: number | null): value is number => value != null)
  if (tradePnl.length > 0) return tradePnl[0]

  return null
}

function ChevronMark() {
  return (
    <View style={styles.chevronMark}>
      <View style={[styles.chevronStroke, styles.chevronStrokeTop]} />
      <View style={[styles.chevronStroke, styles.chevronStrokeBottom]} />
    </View>
  )
}

function UserListModal({
  visible,
  title,
  users,
  onClose,
}: {
  visible: boolean
  title: string
  users: PublicUserListItem[]
  onClose: () => void
}) {
  const showGlyphIcons = Platform.OS !== 'web'
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} activeOpacity={0.8}>
              {showGlyphIcons ? <Ionicons name="close" size={18} color={Colors.textSecondary} /> : <Text style={styles.modalCloseFallback}>Close</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {users.length === 0 ? (
              <Text style={styles.modalEmpty}>No users yet.</Text>
            ) : (
              users.map((entry, index) => (
                <TouchableOpacity
                  key={entry.id}
                  style={[styles.userRow, index < users.length - 1 && styles.userRowBorder]}
                  activeOpacity={0.8}
                  onPress={() => {
                    onClose()
                    router.push({
                      pathname: '/profile/[username]',
                      params: { username: entry.username, uid: entry.id },
                    })
                  }}
                >
                  <View style={[styles.userAvatar, { borderColor: Colors.accentAmber }]}>
                    <View style={[styles.userAvatarInner, { backgroundColor: agentColor(entry.username) + '22' }]}>
                      <Text style={[styles.userAvatarInitial, { color: agentColor(entry.username) }]}>
                        {entry.username[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userHandle}>@{entry.username}</Text>
                    {!!entry.display_name && <Text style={styles.userDisplay}>{entry.display_name}</Text>}
                  </View>
                  {showGlyphIcons ? <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} /> : <ChevronMark />}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

export default function ProfileTabScreen() {
  const showGlyphIcons = Platform.OS !== 'web'
  const { user, username, displayName, avatarUrl } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [aiKey, setAiKey] = useState('')
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [feed, setFeed] = useState<FeedRow[]>([])
  const [followers, setFollowers] = useState<PublicUserListItem[]>([])
  const [following, setFollowing] = useState<PublicUserListItem[]>([])
  const [openList, setOpenList] = useState<'followers' | 'following' | null>(null)

  const loadProfile = useCallback(async (isActive?: () => boolean) => {
    if (!user?.uid) return
    if (isActive && !isActive()) return
    setLoading(true)
    try {
      const [profile, agentRows, feedRows, followerRows, followingRows] = await Promise.all([
        getProfile(user.uid),
        listAgentsForUser(user.uid),
        listPublicFeedEventsForUser(user.uid, 12),
        listFollowersOf(user.uid),
        listFollowingUsers(user.uid),
      ])

      if (isActive && !isActive()) return
      setEmail((profile?.email as string) ?? user.email ?? null)
      setAiKey(((profile?.ai_api_key as string) ?? '').trim())
      setAgents(agentRows as AgentRow[])
      setFeed(feedRows as FeedRow[])
      setFollowers(followerRows)
      setFollowing(followingRows)
    } finally {
      if (isActive && !isActive()) return
      setLoading(false)
    }
  }, [user?.email, user?.uid])

  useFocusEffect(
    useCallback(() => {
      let active = true
      void loadProfile(() => active)
      return () => {
        active = false
      }
    }, [loadProfile])
  )

  useEffect(() => {
    if (!user?.uid) return
    return subscribeToUserAgents(user.uid, (liveAgents) => {
      const nextAgents = liveAgents
        .map((agent) => ({
          id: String(agent.id),
          name: String(agent.name ?? 'Agent'),
          status: (agent.status as AgentStatus) ?? 'disconnected',
          last_seen: (agent.last_seen as string | null) ?? null,
          last_synced: (agent.last_synced as string | null) ?? null,
          live_state: (agent.live_state as Record<string, any> | null) ?? null,
          metadata: (agent.metadata as Record<string, unknown>) ?? {},
        }))
        .sort((a, b) => {
          const ta = agentActivityIso(a) ? new Date(agentActivityIso(a) as string).getTime() : 0
          const tb = agentActivityIso(b) ? new Date(agentActivityIso(b) as string).getTime() : 0
          return tb - ta
        })
      setAgents(nextAgents)
    })
  }, [user?.uid])

  const connectedCount = agents.filter((agent) => agent.status === 'connected').length
  const displayHandle = username ? `@${username}` : user?.email ?? '@you'
  const initials = (username ?? user?.email ?? '?').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '?'
  const profileTone = aiKey ? 'AI-ready' : 'Setup incomplete'
  const usernameSlug = username ?? 'you'

  return (
    <View style={styles.container}>
      <UserListModal
        visible={openList === 'followers'}
        title="Followers"
        users={followers}
        onClose={() => setOpenList(null)}
      />
      <UserListModal
        visible={openList === 'following'}
        title="Following"
        users={following}
        onClose={() => setOpenList(null)}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Profile</Text>
            <Text style={styles.headerSubtitle}>Your public home on SLUGS</Text>
          </View>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/(tabs)/settings')} activeOpacity={0.8}>
            {showGlyphIcons ? <Ionicons name="settings-outline" size={20} color={Colors.textPrimary} /> : <Text style={styles.headerIconFallback}>Settings</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroStatusWrap}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: aiKey ? Colors.accentGreen : Colors.accentAmber }]} />
                <Text style={[styles.statusText, { color: aiKey ? Colors.accentGreen : Colors.accentAmber }]}>{profileTone}</Text>
              </View>
            </View>
            <View style={styles.avatarRing}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>{initials}</Text>
                </View>
              )}
            </View>
            <View style={styles.heroMeta}>
              <Text style={styles.handle}>{displayHandle}</Text>
              {!!displayName && <Text style={styles.displayName}>{displayName}</Text>}
            </View>
          </View>

          <View style={styles.heroActions}>
            <View style={styles.heroActionSlot}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/account')} activeOpacity={0.85}>
                {showGlyphIcons ? <Ionicons name="create-outline" size={16} color={Colors.bgPrimary} /> : null}
                <Text style={styles.primaryBtnText}>Edit profile</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.heroActionSlot}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/(tabs)/settings')} activeOpacity={0.85}>
                {showGlyphIcons ? <Ionicons name="sparkles-outline" size={16} color={Colors.accentAmber} /> : null}
                <Text style={styles.secondaryBtnText}>{aiKey ? 'Manage AI key' : 'Add AI key'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.statStrip}>
          <TouchableOpacity style={styles.statCell} activeOpacity={0.8} onPress={() => setOpenList('followers')}>
            <Text style={styles.statValue}>{followers.length}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity style={styles.statCell} activeOpacity={0.8} onPress={() => setOpenList('following')}>
            <Text style={styles.statValue}>{following.length}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{agents.length}</Text>
            <Text style={styles.statLabel}>Slugs</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{connectedCount}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={Colors.accentAmber} />
          </View>
        ) : (
          <>
            {!aiKey && (
              <View style={styles.setupCard}>
                <View style={styles.setupBadge}>
                  {showGlyphIcons ? <Ionicons name="flash-outline" size={14} color={Colors.accentAmber} /> : <View style={styles.setupBadgeDot} />}
                  <Text style={styles.setupBadgeText}>Complete your profile</Text>
                </View>
                <Text style={styles.setupTitle}>Add an AI key to unlock agent chat</Text>
                <Text style={styles.setupBody}>
                  Market Advisor, Trading Boy, and your other slugs use this shared key to respond in chat.
                </Text>
                <TouchableOpacity style={styles.setupBtn} onPress={() => router.push('/(tabs)/settings')} activeOpacity={0.85}>
                  <Text style={styles.setupBtnText}>Open settings</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your slugs</Text>
                <TouchableOpacity onPress={() => router.push('/connect')} activeOpacity={0.8}>
                  <Text style={styles.sectionLink}>Connect</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.card}>
                {agents.length === 0 ? (
                  <Text style={styles.emptyText}>No slugs connected yet.</Text>
                ) : (
                  agents.map((agent, index) => (
                    (() => {
                      const pnl = resolveAgentPnl(agent)
                      const pnlPositive = (pnl ?? 0) >= 0
                      return (
                        <TouchableOpacity
                          key={agent.id}
                          style={[styles.agentRow, index < agents.length - 1 && styles.rowBorder]}
                          activeOpacity={0.85}
                          onPress={() => router.push(`/agent/${agent.id}` as any)}
                        >
                          <View style={styles.agentLeft}>
                            <View style={[styles.agentAvatar, { borderColor: STATUS_COLOR[agent.status] }]}>
                              <View style={[styles.agentAvatarInner, { backgroundColor: agentColor(agent.name) + '22' }]}>
                                <Text style={[styles.agentAvatarInitial, { color: agentColor(agent.name) }]}>
                                  {agent.name[0]?.toUpperCase() ?? '?'}
                                </Text>
                              </View>
                            </View>
                            <View>
                              <Text style={styles.agentName}>{agent.name}</Text>
                              <Text style={styles.agentHandle}>@{usernameSlug}/{agent.name.toLowerCase().replace(/\s+/g, '-')}</Text>
                            </View>
                          </View>
                          <View style={styles.agentRight}>
                            {pnl != null ? (
                              <Text style={[styles.agentPnl, { color: pnlPositive ? Colors.accentGreen : Colors.accentRed }]}>
                                {pnl >= 0 ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                              </Text>
                            ) : <View style={styles.agentPnlSpacer} />}
                            <View style={styles.agentMetaRow}>
                              <Text style={styles.agentTime}>{timeAgo(agentActivityIso(agent))}</Text>
                              <View style={[styles.agentStatusDot, { backgroundColor: STATUS_COLOR[agent.status] }]} />
                            </View>
                          </View>
                        </TouchableOpacity>
                      )
                    })()
                  ))
                )}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent public activity</Text>
              </View>
              <View style={styles.card}>
                {feed.length === 0 ? (
                  <Text style={styles.emptyText}>No public activity yet.</Text>
                ) : (
                  feed.map((item, index) => (
                    <View key={item.id} style={[styles.feedRow, index < feed.length - 1 && styles.rowBorder]}>
                      <View style={styles.feedTag}>
                        <Text style={styles.feedTagText}>{item.type}</Text>
                      </View>
                      <Text style={styles.feedContent} numberOfLines={3}>{item.content}</Text>
                      <Text style={styles.feedTime}>{timeAgo(item.created_at)}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { padding: 16, paddingTop: 60, paddingBottom: 120, gap: 16 },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerTitle: { fontSize: 30, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconFallback: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },

  heroCard: {
    backgroundColor: '#171614',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2a2723',
    gap: 16,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarRing: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 2,
    borderColor: Colors.accentAmber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarInitial: { fontSize: 28, fontWeight: '800', color: Colors.accentAmber },
  heroStatusWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 2,
  },
  heroMeta: { flex: 1, gap: 4 },
  handle: { fontSize: 30, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.6 },
  displayName: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  heroActions: { flexDirection: 'row', gap: 10, width: '100%' },
  heroActionSlot: { flex: 1, flexBasis: 0 },
  primaryBtn: {
    width: '100%',
    minHeight: 44,
    backgroundColor: Colors.accentAmber,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  primaryBtnText: { color: Colors.bgPrimary, fontWeight: '700', fontSize: 13 },
  secondaryBtn: {
    width: '100%',
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accentAmber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(217,119,87,0.08)',
    paddingHorizontal: 12,
  },
  secondaryBtnText: { color: Colors.accentAmber, fontWeight: '700', fontSize: 13 },

  statStrip: {
    flexDirection: 'row',
    backgroundColor: '#0f0f0f',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingVertical: 14,
  },
  statCell: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.9 },
  statDivider: { width: 1, backgroundColor: Colors.bgBorder },

  loadingCard: {
    backgroundColor: '#0f0f0f',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    padding: 28,
    alignItems: 'center',
  },
  setupCard: {
    backgroundColor: '#1a1412',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(217,119,87,0.28)',
    gap: 10,
  },
  setupBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(217,119,87,0.12)',
  },
  setupBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.accentAmber, textTransform: 'uppercase', letterSpacing: 0.8 },
  setupTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  setupBody: { fontSize: 13, lineHeight: 20, color: Colors.textSecondary },
  setupBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.accentAmber,
  },
  setupBtnText: { color: Colors.bgPrimary, fontWeight: '700' },

  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  sectionLink: { fontSize: 13, fontWeight: '700', color: Colors.accentAmber },
  card: { backgroundColor: '#0f0f0f', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: Colors.bgBorder },
  emptyText: { padding: 16, color: Colors.textMuted, fontSize: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.bgBorder },

  agentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  agentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  agentAvatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, overflow: 'hidden' },
  agentAvatarInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  agentAvatarInitial: { fontSize: 16, fontWeight: '800' },
  agentName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  agentHandle: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  agentRight: { alignItems: 'flex-end', gap: 6, marginLeft: 8, minWidth: 92 },
  agentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  agentPnl: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.accentGreen,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  agentPnlSpacer: {
    minHeight: 18,
  },
  agentTime: { fontSize: 11, color: Colors.textMuted },
  agentStatusDot: { width: 8, height: 8, borderRadius: 4 },

  feedRow: { padding: 14, gap: 8 },
  feedTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(168,85,247,0.14)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  feedTagText: { fontSize: 10, fontWeight: '700', color: Colors.accentPurple, textTransform: 'uppercase', letterSpacing: 0.6 },
  feedContent: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  feedTime: { color: Colors.textMuted, fontSize: 11 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '75%',
    backgroundColor: Colors.bgPrimary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    padding: 16,
    paddingBottom: 28,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseFallback: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  modalEmpty: { color: Colors.textMuted, fontSize: 14, padding: 8 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  userRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.bgBorder },
  userAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, overflow: 'hidden' },
  userAvatarInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  userAvatarInitial: { fontSize: 15, fontWeight: '800' },
  userHandle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  userDisplay: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  chevronMark: { width: 10, height: 14, alignItems: 'center', justifyContent: 'center' },
  chevronStroke: {
    position: 'absolute',
    width: 7,
    height: 1.8,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    right: 0,
  },
  chevronStrokeTop: { top: 4, transform: [{ rotate: '45deg' }] },
  chevronStrokeBottom: { bottom: 4, transform: [{ rotate: '-45deg' }] },
  setupBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.accentAmber,
  },
})
