import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image,
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
    loadProfile()
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
    const myUid = me.uid
    setFollowLoading(true)

    try {
      if (isFollowing) {
        await unfollowUser(myUid, profile.id)
        setIsFollowing(false)
        setFollowerCount((c) => Math.max(0, c - 1))
      } else {
        await followUser(myUid, profile.id)
        setIsFollowing(true)
        setFollowerCount((c) => c + 1)
      }
    } finally {
      setFollowLoading(false)
    }
  }, [me, profile, isFollowing])

  const messageUser = useCallback(async () => {
    if (!me?.uid || !profile?.id || me.uid === profile.id) return
    const threadId = getDirectThreadId(me.uid, profile.id)
    void createOrGetDirectThread(me.uid, profile.id)
    router.push({
      pathname: '/messages/[threadId]',
      params: { threadId, otherUid: profile.id, username: profile.username },
    })
  }, [me?.uid, profile?.id, profile?.username])

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

  const connectedCount = agents.filter((a) => a.status === 'connected').length
  const safeUsername = profile?.username || 'user'

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* Back */}
      <TouchableOpacity style={styles.backRow} onPress={() => router.back()}>
        <Text style={styles.backArrow}>‹</Text>
        <Text style={styles.backLabel}>Search</Text>
      </TouchableOpacity>

      {/* Profile header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarRing}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>
                {safeUsername[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.handle}>@{safeUsername}</Text>
          {profile?.display_name ? (
            <Text style={styles.displayName}>{profile.display_name}</Text>
          ) : null}
          <View style={styles.followCounts}>
            <Text style={styles.followCount}><Text style={styles.followCountBold}>{followerCount}</Text> followers</Text>
            <Text style={styles.followDot}>·</Text>
            <Text style={styles.followCount}><Text style={styles.followCountBold}>{followingCount}</Text> following</Text>
          </View>
        </View>
      </View>

      {/* Follow button */}
      {me && !isOwnProfile && (
        <View style={styles.followBtnRow}>
          <TouchableOpacity
            style={[styles.followBtn, isFollowing && styles.followBtnActive]}
            onPress={toggleFollow}
            disabled={followLoading}
            activeOpacity={0.8}
          >
            {followLoading
              ? <ActivityIndicator size="small" color={isFollowing ? Colors.accentAmber : Colors.bgPrimary} />
              : <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.messageBtn} onPress={messageUser} activeOpacity={0.8}>
            <Text style={styles.messageBtnText}>Message</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsRow}>
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

      {/* Their slugs */}
      {agents.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SLUGS</Text>
          <View style={styles.card}>
            {agents.map((agent, i) => (
              (() => {
                const safeAgentName = agent.name || 'slug'
                return (
              <TouchableOpacity
                key={agent.id}
                style={[styles.agentRow, i < agents.length - 1 && styles.agentRowBorder]}
                activeOpacity={0.85}
                onPress={() => router.push(`/slug/${agent.id}`)}
              >
                <View style={styles.agentLeft}>
                  <View style={[styles.agentAvatar, { borderColor: STATUS_COLOR[agent.status] }]}>
                    <View style={[styles.agentAvatarInner, { backgroundColor: agentColor(safeAgentName) + '22' }]}>
                      <Text style={[styles.agentAvatarInitial, { color: agentColor(safeAgentName) }]}>
                        {safeAgentName[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  </View>
                  <View>
                    <Text style={styles.agentName}>{safeAgentName}</Text>
                    <Text style={styles.agentSlug}>
                      @{safeUsername}/{safeAgentName.toLowerCase().replace(/\s+/g, '-')}
                    </Text>
                  </View>
                </View>
                <View style={styles.agentRight}>
                  <Text style={styles.lastSeen}>{timeAgo(agent.last_seen)}</Text>
                  <View style={styles.agentRightMeta}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[agent.status] }]} />
                    <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                  </View>
                </View>
              </TouchableOpacity>
                )
              })()
            ))}
          </View>
        </View>
      )}

      {/* Public feed */}
      {feed.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
          <View style={styles.card}>
            {feed.map((event, i) => (
              <View
                key={event.id}
                style={[styles.feedRow, i < feed.length - 1 && styles.feedRowBorder]}
              >
                <View style={styles.feedTypeTag}>
                  <Text style={styles.feedTypeText}>{event.type || 'update'}</Text>
                </View>
                <Text style={styles.feedContent} numberOfLines={3}>{event.content || 'No details yet.'}</Text>
                <Text style={styles.feedTime}>{timeAgo(event.created_at)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  content: { paddingBottom: 120 },

  centered: { flex: 1, backgroundColor: Colors.bgPrimary, justifyContent: 'center', alignItems: 'center', gap: 16 },
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
    paddingBottom: 8,
    gap: 4,
  },
  backArrow: { fontSize: 24, color: Colors.accentAmber, lineHeight: 28 },
  backLabel: { fontSize: 16, color: Colors.accentAmber },

  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
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
  profileInfo: { flex: 1, gap: 4 },
  handle: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  displayName: { fontSize: 13, color: Colors.textMuted },
  followCounts: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  followCount: { fontSize: 12, color: Colors.textMuted },
  followCountBold: { fontWeight: '700', color: Colors.textSecondary },
  followDot: { fontSize: 12, color: Colors.textMuted },

  followBtnRow: { paddingHorizontal: 16, marginBottom: 16, flexDirection: 'row', gap: 10 },
  followBtn: {
    backgroundColor: Colors.accentAmber,
    borderRadius: 12,
    paddingVertical: 11,
    flex: 1,
    alignItems: 'center',
  },
  followBtnActive: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.accentAmber,
  },
  followBtnText: { fontSize: 15, fontWeight: '700', color: Colors.bgPrimary },
  followBtnTextActive: { color: Colors.accentAmber },
  messageBtn: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBtnText: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },

  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: '#0f0f0f',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 24,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: 10, fontWeight: '600', color: Colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
  statDivider: { width: 1, backgroundColor: Colors.bgBorder },

  section: { marginBottom: 16, paddingHorizontal: 16 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 1.2, marginBottom: 8, paddingHorizontal: 4,
    textTransform: 'uppercase',
  },
  card: { backgroundColor: '#0f0f0f', borderRadius: 16, overflow: 'hidden' },

  agentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  agentRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.bgBorder },
  agentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  agentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  agentAvatarInner: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
  agentAvatarInitial: { fontSize: 16, fontWeight: '700' },
  agentName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  agentSlug: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  agentRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  agentRightMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastSeen: { fontSize: 11, color: Colors.textMuted },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  feedRow: { padding: 14, gap: 6 },
  feedRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.bgBorder },
  feedTypeTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(168,85,247,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  feedTypeText: { fontSize: 10, fontWeight: '700', color: Colors.accentPurple, textTransform: 'uppercase', letterSpacing: 0.5 },
  feedContent: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  feedTime: { fontSize: 11, color: Colors.textMuted },
})
