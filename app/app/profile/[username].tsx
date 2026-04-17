import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, router } from 'expo-router'
import {
  getPublicProfileByUsername,
  getPublicProfileByUid,
  listAgentsForUser,
  listPublicFeedEventsForUser,
  countFollowersOf,
  countFollowingOf,
  isFollowingUser,
  followUser,
  unfollowUser,
  createOrGetDirectThread,
  getDirectThreadId,
} from '../../lib/firebase'
import { useAuthStore } from '../../stores/authStore'
import { useChatDockStore } from '../../stores/chatDockStore'
import { Colors } from '../../constants/colors'
import { useDesktopWebLayout } from '../../lib/responsive'
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

interface PublicProfile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

interface PublicAgent {
  id: string
  name: string
  status: AgentStatus
  last_seen: string | null
  metadata: Record<string, unknown>
}

interface FeedEvent {
  id: string
  type: string
  content: string
  created_at: string
  agent_id: string
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default function PublicProfileScreen() {
  const { username, uid } = useLocalSearchParams<{ username: string; uid?: string }>()
  const { user: me } = useAuthStore()
  const openConversation = useChatDockStore((state) => state.openConversation)
  const isDesktopWeb = useDesktopWebLayout()

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [agents, setAgents] = useState<PublicAgent[]>([])
  const [feed, setFeed] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const isOwnProfile = !!me?.uid && !!profile?.id && me.uid === profile.id

  useEffect(() => {
    if (!username) return
    void loadProfile()
  }, [username, me?.uid])

  async function loadProfile() {
    setLoading(true)
    setNotFound(false)
    try {
      const uname = Array.isArray(username) ? username[0] : username
      const userId = Array.isArray(uid) ? uid[0] : uid
      if (!uname && !userId) return

      const profileData = userId
        ? await getPublicProfileByUid(userId)
        : await getPublicProfileByUsername(uname)
      if (!profileData) {
        setNotFound(true)
        return
      }

      setProfile(profileData as PublicProfile)

      const myUid = me?.uid ?? null
      const [agentRows, feedRows, followers, following, amFollowing] = await Promise.all([
        listAgentsForUser(profileData.id),
        listPublicFeedEventsForUser(profileData.id, 20),
        countFollowersOf(profileData.id),
        countFollowingOf(profileData.id),
        myUid ? isFollowingUser(myUid, profileData.id) : Promise.resolve(false),
      ])

      setAgents(agentRows as unknown as PublicAgent[])
      setFeed(feedRows)
      setFollowerCount(followers)
      setFollowingCount(following)
      setIsFollowing(amFollowing)
    } catch (error) {
      console.warn('[profile] loadProfile failed', error)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  const toggleFollow = useCallback(async () => {
    if (!me || !profile) return
    setFollowLoading(true)
    try {
      if (isFollowing) {
        await unfollowUser(me.uid, profile.id)
        setIsFollowing(false)
        setFollowerCount((count) => Math.max(0, count - 1))
      } else {
        await followUser(me.uid, profile.id)
        setIsFollowing(true)
        setFollowerCount((count) => count + 1)
      }
    } finally {
      setFollowLoading(false)
    }
  }, [isFollowing, me, profile])

  const messageUser = useCallback(async () => {
    if (!me?.uid || !profile?.id || me.uid === profile.id) return
    const threadId = getDirectThreadId(me.uid, profile.id)
    void createOrGetDirectThread(me.uid, profile.id)
    if (Platform.OS === 'web') {
      openConversation({ threadId, otherUid: profile.id, username: profile.username })
      return
    }
    router.push({
      pathname: '/messages/[threadId]',
      params: { threadId, otherUid: profile.id, username: profile.username },
    })
  }, [me?.uid, openConversation, profile?.id, profile?.username])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.accentAmber} />
      </View>
    )
  }

  if (notFound) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFoundText}>@{username} not found</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const connectedCount = agents.filter((agent) => agent.status === 'connected').length
  const safeUsername = profile?.username || 'user'
  const secondaryIdentity = profile?.display_name && profile.display_name !== `@${safeUsername}`
    ? profile.display_name
    : null

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.pageFrame, isDesktopWeb && styles.pageFrameDesktop]}>
        <TouchableOpacity style={[styles.backRow, isDesktopWeb && styles.backRowDesktop]} onPress={() => router.back()}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>Search</Text>
        </TouchableOpacity>

        <View style={styles.headerBlock}>
          <Text style={styles.headerTitle}>Profile</Text>
          <Text style={styles.headerSubtitle}>Public home on SLUGS</Text>
        </View>

        <View style={[styles.heroCard, isDesktopWeb && styles.heroCardDesktop]}>
          <View style={[styles.profileHeader, isDesktopWeb && styles.profileHeaderDesktop]}>
            <View style={styles.avatarRing}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>{safeUsername[0]?.toUpperCase() ?? '?'}</Text>
                </View>
              )}
            </View>
            <View style={[styles.profileInfo, isDesktopWeb && styles.profileInfoDesktop]}>
              <Text style={[styles.handle, isDesktopWeb && styles.handleDesktop]}>@{safeUsername}</Text>
              {secondaryIdentity ? <Text style={styles.displayName}>{secondaryIdentity}</Text> : null}
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: Colors.accentGreen }]} />
                <Text style={styles.statusText}>Public profile</Text>
              </View>
            </View>
          </View>

          {me && !isOwnProfile ? (
            <View style={[styles.followBtnRow, isDesktopWeb && styles.followBtnRowDesktop]}>
              <TouchableOpacity
                style={[styles.primaryBtn, isFollowing && styles.secondaryBtn]}
                onPress={toggleFollow}
                disabled={followLoading}
                activeOpacity={0.85}
              >
                {followLoading ? (
                  <ActivityIndicator size="small" color={isFollowing ? Colors.accentAmber : Colors.bgPrimary} />
                ) : (
                  <Text style={[styles.primaryBtnText, isFollowing && styles.secondaryBtnText]}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={messageUser} activeOpacity={0.85}>
                <Text style={styles.secondaryBtnText}>Message</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.statStrip}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{followerCount}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{followingCount}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
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

        {agents.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Their slugs</Text>
            </View>
            <View style={styles.card}>
              {agents.map((agent, index) => {
                const safeAgentName = agent.name || 'slug'
                return (
                  <TouchableOpacity
                    key={agent.id}
                    style={[styles.agentRow, index < agents.length - 1 && styles.rowBorder]}
                    activeOpacity={0.85}
                    onPress={() => router.push(`/slug/${agent.id}`)}
                  >
                    <View style={styles.agentLeft}>
                      <View style={[styles.agentAvatar, { borderColor: STATUS_COLOR[agent.status] }]}>
                        <View style={[styles.agentAvatarInner, { backgroundColor: `${agentColor(safeAgentName)}22` }]}>
                          <Text style={[styles.agentAvatarInitial, { color: agentColor(safeAgentName) }]}>
                            {safeAgentName[0]?.toUpperCase() ?? '?'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.agentCopy}>
                        <Text style={styles.agentName}>{safeAgentName}</Text>
                        <Text style={styles.agentHandle}>@{safeUsername}/{safeAgentName.toLowerCase().replace(/\s+/g, '-')}</Text>
                      </View>
                    </View>
                    <View style={styles.agentRight}>
                      <Text style={styles.agentTime}>{timeAgo(agent.last_seen)}</Text>
                      <View style={[styles.agentStatusDot, { backgroundColor: STATUS_COLOR[agent.status] }]} />
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        ) : null}

        {feed.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent public activity</Text>
            </View>
            <View style={styles.card}>
              {feed.map((event, index) => (
                <View key={event.id} style={[styles.feedRow, index < feed.length - 1 && styles.rowBorder]}>
                  <View style={styles.feedTag}>
                    <Text style={styles.feedTagText}>{event.type || 'update'}</Text>
                  </View>
                  <Text style={styles.feedContent} numberOfLines={3}>{event.content || 'No details yet.'}</Text>
                  <Text style={styles.feedTime}>{timeAgo(event.created_at)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { paddingBottom: 120 },
  pageFrame: { width: '100%' },
  pageFrameDesktop: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 1120,
    paddingHorizontal: 28,
  },

  centered: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  notFoundText: { fontSize: 16, color: Colors.textMuted },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#0f0f0f',
    borderRadius: 12,
  },
  backBtnText: { color: Colors.textPrimary, fontSize: 14 },

  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 10,
    gap: 4,
  },
  backRowDesktop: {
    paddingHorizontal: 0,
    paddingBottom: 18,
  },
  backArrow: { fontSize: 24, color: Colors.accentAmber, lineHeight: 28 },
  backLabel: { fontSize: 16, color: Colors.accentAmber },
  headerBlock: { marginBottom: 14 },
  headerTitle: { fontSize: 30, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },

  heroCard: {
    marginHorizontal: 16,
    marginBottom: 18,
  },
  heroCardDesktop: {
    marginHorizontal: 0,
    marginBottom: 24,
    paddingVertical: 28,
    paddingHorizontal: 32,
    backgroundColor: '#11100f',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 18,
  },
  profileHeaderDesktop: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 16,
  },
  avatarRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: Colors.accentAmber,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: { width: 68, height: 68, borderRadius: 34 },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { fontSize: 28, fontWeight: '700', color: Colors.accentAmber },
  profileInfo: { flex: 1, gap: 6 },
  profileInfoDesktop: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  handle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  handleDesktop: { fontSize: 36, letterSpacing: -0.8 },
  displayName: { fontSize: 13, color: Colors.textMuted },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusText: { fontSize: 12, fontWeight: '700', color: Colors.accentGreen },
  followBtnRow: {
    paddingHorizontal: 0,
    marginBottom: 0,
    flexDirection: 'row',
    gap: 10,
  },
  followBtnRowDesktop: {
    marginBottom: 0,
    justifyContent: 'stretch',
  },
  primaryBtn: {
    backgroundColor: Colors.accentAmber,
    borderRadius: 14,
    paddingVertical: 12,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: Colors.bgPrimary, fontWeight: '700', fontSize: 14 },
  secondaryBtn: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accentAmber,
    backgroundColor: 'rgba(217,119,87,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: Colors.accentAmber, fontWeight: '700', fontSize: 14 },

  statStrip: {
    flexDirection: 'row',
    backgroundColor: '#0f0f0f',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingVertical: 14,
    marginBottom: 18,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statDivider: { width: 1, backgroundColor: Colors.bgBorder },
  statValue: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  section: { gap: 10, marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  card: {
    backgroundColor: '#0f0f0f',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.bgBorder,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.bgBorder },

  agentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  agentRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.bgBorder },
  agentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  agentCopy: { gap: 2 },
  agentAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  agentAvatarInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentAvatarInitial: { fontSize: 16, fontWeight: '700' },
  agentName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  agentHandle: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  agentRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  agentTime: { fontSize: 11, color: Colors.textMuted },
  agentStatusDot: { width: 8, height: 8, borderRadius: 4 },

  feedRow: { padding: 16, gap: 8 },
  feedTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(168,85,247,0.14)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  feedTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.accentPurple,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  feedContent: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  feedTime: { fontSize: 11, color: Colors.textMuted },
})
