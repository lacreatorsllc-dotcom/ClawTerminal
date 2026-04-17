import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { markDirectThreadRead, subscribeToDirectThreads } from '../../lib/firebase'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'
import { useDesktopWebLayout } from '../../lib/responsive'

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'now'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}

function ChevronMark() {
  return <Text style={styles.chevronText}>›</Text>
}

export default function ChatTabScreen() {
  const { user } = useAuthStore()
  const [threads, setThreads] = useState<any[]>([])
  const isDesktopWeb = useDesktopWebLayout()

  useEffect(() => {
    if (!user?.uid) return
    return subscribeToDirectThreads(user.uid, setThreads)
  }, [user?.uid])

  const visibleThreads = useMemo(
    () => threads.filter((thread) => thread.other_user?.id && thread.other_user.id !== user?.uid),
    [threads, user?.uid]
  )

  return (
    <View style={styles.container}>
      <View style={[styles.pageFrame, isDesktopWeb && styles.pageFrameDesktop]}>
        <View style={styles.header}>
          <Text style={styles.title}>Chat</Text>
          <Text style={styles.subtitle}>Talk directly with other operators.</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {visibleThreads.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptyBody}>Open a public profile or slug profile and tap Message to start a chat.</Text>
            </View>
          ) : (
            visibleThreads.map((thread) => (
              <TouchableOpacity
                key={thread.id}
                style={styles.threadCard}
                activeOpacity={0.85}
                onPress={() => {
                  if (user?.uid) {
                    void markDirectThreadRead(thread.id, user.uid)
                  }
                  router.push({ pathname: '/messages/[threadId]', params: { threadId: thread.id, otherUid: thread.other_user?.id, username: thread.other_user?.username } })
                }}
              >
                <View style={styles.threadAvatar}>
                  <Text style={styles.threadAvatarText}>{thread.other_user?.username?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <View style={styles.threadBody}>
                  <View style={styles.threadTopRow}>
                    <Text style={styles.threadHandle}>@{thread.other_user?.username ?? 'user'}</Text>
                    <View style={styles.threadMetaRight}>
                      <Text style={styles.threadTime}>{timeAgo(thread.last_message_at ?? thread.updated_at)}</Text>
                      <View style={[styles.readBadge, thread.unread ? styles.unreadBadge : styles.readBadgeMuted]}>
                        <Text style={[styles.readBadgeText, thread.unread ? styles.unreadBadgeText : styles.readBadgeTextMuted]}>
                          {thread.unread ? 'Unread' : 'Read'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.threadPreview} numberOfLines={2}>
                    {thread.last_message_text || 'Say hello.'}
                  </Text>
                </View>
                <ChevronMark />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  pageFrame: { flex: 1, width: '100%' },
  pageFrameDesktop: { alignSelf: 'center', maxWidth: 1040 },
  header: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 18 },
  title: { color: Colors.textPrimary, fontSize: 28, fontWeight: '800' },
  subtitle: { color: Colors.textMuted, fontSize: 14, marginTop: 4 },
  content: { paddingHorizontal: 16, paddingBottom: 110, gap: 12 },
  emptyCard: { backgroundColor: '#171614', borderWidth: 1, borderColor: Colors.bgBorder, borderRadius: 22, padding: 22, gap: 10 },
  emptyTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  emptyBody: { color: Colors.textSecondary, fontSize: 14, lineHeight: 22 },
  threadCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#171614', borderWidth: 1, borderColor: Colors.bgBorder, borderRadius: 20, padding: 16 },
  threadAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.accentAmber, alignItems: 'center', justifyContent: 'center' },
  threadAvatarText: { color: Colors.accentAmber, fontSize: 18, fontWeight: '800' },
  threadBody: { flex: 1, gap: 4 },
  threadTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  threadMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  threadHandle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  threadTime: { color: Colors.textMuted, fontSize: 12 },
  readBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  readBadgeMuted: {
    borderColor: Colors.bgBorder,
    backgroundColor: Colors.bgElevated,
  },
  unreadBadge: {
    borderColor: 'rgba(217,119,87,0.28)',
    backgroundColor: 'rgba(217,119,87,0.12)',
  },
  readBadgeText: { fontSize: 10, fontWeight: '700' },
  readBadgeTextMuted: { color: Colors.textMuted },
  unreadBadgeText: { color: Colors.accentAmber },
  threadPreview: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  chevronText: {
    color: Colors.textMuted,
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '500',
    marginLeft: 2,
  },
})
