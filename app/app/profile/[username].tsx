import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
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
  const { username } = useLocalSearchParams<{ username: string }>()
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

  useEffect(() => {
    if (!username) return
    loadProfile()
  }, [username])

  async function loadProfile() {
    setLoading(true)

    // 1. Load user profile
    const { data: profileData } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, created_at')
      .eq('username', username)
      .single()

    if (!profileData) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setProfile(profileData as PublicProfile)

    // 2. Load agents, public feed, and follow data in parallel
    const [
      { data: agentData },
      { data: feedData },
      { count: followers },
      { count: following },
      { data: followRow },
    ] = await Promise.all([
      supabase
        .from('agents')
        .select('id, name, status, last_seen, metadata')
        .eq('user_id', profileData.id)
        .order('last_seen', { ascending: false }),
      supabase
        .from('feed_events')
        .select('id, type, content, created_at, agent_id')
        .eq('user_id', profileData.id)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profileData.id),
      supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', profileData.id),
      me
        ? supabase
            .from('follows')
            .select('id')
            .eq('follower_id', me.id)
            .eq('following_id', profileData.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    setAgents((agentData as PublicAgent[]) ?? [])
    setFeed((feedData as FeedEvent[]) ?? [])
    setFollowerCount(followers ?? 0)
    setFollowingCount(following ?? 0)
    setIsFollowing(!!followRow)
    setLoading(false)
  }

  const toggleFollow = useCallback(async () => {
    if (!me || !profile) return
    setFollowLoading(true)

    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', me.id)
        .eq('following_id', profile.id)
      setIsFollowing(false)
      setFollowerCount((c) => Math.max(0, c - 1))
    } else {
      await supabase
        .from('follows')
        .insert({ follower_id: me.id, following_id: profile.id })
      setIsFollowing(true)
      setFollowerCount((c) => c + 1)
    }

    setFollowLoading(false)
  }, [me, profile, isFollowing])

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
                {(profile?.username ?? '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.handle}>@{profile?.username}</Text>
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
      {me && (
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
              <View
                key={agent.id}
                style={[styles.agentRow, i < agents.length - 1 && styles.agentRowBorder]}
              >
                <View style={styles.agentLeft}>
                  <View style={[styles.agentAvatar, { borderColor: STATUS_COLOR[agent.status] }]}>
                    <View style={[styles.agentAvatarInner, { backgroundColor: agentColor(agent.name) + '22' }]}>
                      <Text style={[styles.agentAvatarInitial, { color: agentColor(agent.name) }]}>
                        {agent.name[0].toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View>
                    <Text style={styles.agentName}>{agent.name}</Text>
                    <Text style={styles.agentSlug}>
                      @{profile?.username}/{agent.name.toLowerCase().replace(/\s+/g, '-')}
                    </Text>
                  </View>
                </View>
                <View style={styles.agentRight}>
                  <Text style={styles.lastSeen}>{timeAgo(agent.last_seen)}</Text>
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[agent.status] }]} />
                </View>
              </View>
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
                  <Text style={styles.feedTypeText}>{event.type}</Text>
                </View>
                <Text style={styles.feedContent} numberOfLines={3}>{event.content}</Text>
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

  followBtnRow: { paddingHorizontal: 16, marginBottom: 16 },
  followBtn: {
    backgroundColor: Colors.accentAmber,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  followBtnActive: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.accentAmber,
  },
  followBtnText: { fontSize: 15, fontWeight: '700', color: Colors.bgPrimary },
  followBtnTextActive: { color: Colors.accentAmber },

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
