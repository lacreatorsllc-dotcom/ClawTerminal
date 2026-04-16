import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  sendDirectMessage,
  subscribeToDirectMessages,
  subscribeToDirectThreads,
} from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { Colors } from '../constants/colors'

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'now'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function DesktopChatDock() {
  const { user } = useAuthStore()
  const [threads, setThreads] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')

  useEffect(() => {
    if (!user?.uid) return
    return subscribeToDirectThreads(user.uid, setThreads)
  }, [user?.uid])

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([])
      return
    }
    return subscribeToDirectMessages(activeThreadId, setMessages)
  }, [activeThreadId])

  useEffect(() => {
    if (!activeThreadId && threads.length > 0) {
      setActiveThreadId(threads[0].id)
    }
  }, [threads, activeThreadId])

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  )

  async function handleSend() {
    if (!user?.uid || !activeThreadId || !text.trim()) return
    const body = text
    setText('')
    await sendDirectMessage(activeThreadId, user.uid, body)
  }

  if (!user) return null

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {open && (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelTitle}>Chats</Text>
              <Text style={styles.panelSubtitle}>Talk without leaving the page</Text>
            </View>
            <TouchableOpacity style={styles.headerBtn} onPress={() => setOpen(false)} activeOpacity={0.8}>
              <Ionicons name="remove" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.threadColumn}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.threadList}>
                {threads.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No conversations yet</Text>
                    <Text style={styles.emptyBody}>Start one from a public profile or slug profile.</Text>
                  </View>
                ) : (
                  threads.map((thread) => {
                    const active = thread.id === activeThreadId
                    return (
                      <TouchableOpacity
                        key={thread.id}
                        style={[styles.threadItem, active && styles.threadItemActive]}
                        onPress={() => setActiveThreadId(thread.id)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.threadAvatar}>
                          <Text style={styles.threadAvatarText}>
                            {thread.other_user?.username?.[0]?.toUpperCase() ?? '?'}
                          </Text>
                        </View>
                        <View style={styles.threadMeta}>
                          <View style={styles.threadTopRow}>
                            <Text style={styles.threadHandle}>@{thread.other_user?.username ?? 'user'}</Text>
                            <Text style={styles.threadTime}>{timeAgo(thread.last_message_at ?? thread.updated_at)}</Text>
                          </View>
                          <Text style={styles.threadPreview} numberOfLines={2}>
                            {thread.last_message_text || 'Say hello.'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )
                  })
                )}
              </ScrollView>
            </View>

            <View style={styles.conversationColumn}>
              {activeThread ? (
                <>
                  <View style={styles.conversationHeader}>
                    <Text style={styles.conversationTitle}>@{activeThread.other_user?.username ?? 'chat'}</Text>
                    <Text style={styles.conversationSubtitle}>Direct messages</Text>
                  </View>

                  <ScrollView
                    style={styles.messageScroll}
                    contentContainerStyle={styles.messageList}
                    showsVerticalScrollIndicator={false}
                  >
                    {messages.length === 0 ? (
                      <Text style={styles.emptyBody}>No messages yet. Start the conversation.</Text>
                    ) : (
                      messages.map((message) => {
                        const mine = message.sender_uid === user.uid
                        return (
                          <View key={message.id} style={[styles.messageRow, mine && styles.messageRowMine]}>
                            <View style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
                              <Text style={[styles.messageText, mine && styles.messageTextMine]}>{message.content}</Text>
                            </View>
                            <Text style={[styles.messageTimeText, mine && styles.messageTimeTextMine]}>
                              {formatTime(message.created_at)}
                            </Text>
                          </View>
                        )
                      })
                    )}
                  </ScrollView>

                  <View style={styles.composer}>
                    <TextInput
                      style={styles.input}
                      value={text}
                      onChangeText={setText}
                      placeholder={`Message @${activeThread.other_user?.username ?? 'chat'}...`}
                      placeholderTextColor={Colors.textMuted}
                    />
                    <TouchableOpacity style={styles.sendBtn} onPress={handleSend} activeOpacity={0.85}>
                      <Ionicons name="arrow-up" size={15} color={Colors.bgPrimary} />
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.noSelection}>
                  <Text style={styles.emptyTitle}>Pick a chat</Text>
                  <Text style={styles.emptyBody}>Choose a thread from the left to open a conversation.</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.launcher, open && styles.launcherActive]}
        onPress={() => setOpen((value) => !value)}
        activeOpacity={0.9}
      >
        <Ionicons name="chatbubbles" size={20} color={open ? Colors.bgPrimary : Colors.textPrimary} />
        <Text style={[styles.launcherText, open && styles.launcherTextActive]}>Chat</Text>
        {threads.length > 0 && !open ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{threads.length > 9 ? '9+' : String(threads.length)}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    zIndex: 1000,
    alignItems: 'flex-end',
  },
  panel: {
    width: 760,
    height: 560,
    backgroundColor: '#12110f',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 16 },
  },
  panelHeader: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  panelSubtitle: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, flexDirection: 'row' },
  threadColumn: {
    width: 260,
    borderRightWidth: 1,
    borderRightColor: Colors.bgBorder,
    backgroundColor: '#151412',
  },
  threadList: { padding: 12, gap: 10 },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  threadItemActive: {
    backgroundColor: 'rgba(217,119,87,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(217,119,87,0.22)',
  },
  threadAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.accentAmber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadAvatarText: { color: Colors.accentAmber, fontSize: 15, fontWeight: '800' },
  threadMeta: { flex: 1, gap: 4 },
  threadTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  threadHandle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  threadTime: { color: Colors.textMuted, fontSize: 11 },
  threadPreview: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },
  conversationColumn: { flex: 1, backgroundColor: '#12110f' },
  conversationHeader: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgBorder,
  },
  conversationTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '800' },
  conversationSubtitle: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },
  messageScroll: { flex: 1 },
  messageList: { padding: 16, gap: 10 },
  messageRow: { alignItems: 'flex-start', gap: 4 },
  messageRowMine: { alignItems: 'flex-end' },
  messageBubble: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
  },
  messageBubbleMine: { backgroundColor: Colors.accentAmber },
  messageBubbleOther: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
  },
  messageText: { color: Colors.textPrimary, fontSize: 13, lineHeight: 20 },
  messageTextMine: { color: Colors.bgPrimary },
  messageTimeText: { color: Colors.textMuted, fontSize: 10, paddingHorizontal: 4 },
  messageTimeTextMine: { textAlign: 'right' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.bgBorder,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    color: Colors.textPrimary,
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.accentAmber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launcher: {
    minWidth: 122,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#171614',
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  launcherActive: {
    backgroundColor: Colors.accentAmber,
    borderColor: Colors.accentAmber,
  },
  launcherText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  launcherTextActive: { color: Colors.bgPrimary },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accentAmber,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: Colors.bgPrimary, fontSize: 11, fontWeight: '800' },
  emptyState: { padding: 12, gap: 8 },
  emptyTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  emptyBody: { color: Colors.textSecondary, fontSize: 12, lineHeight: 19 },
  noSelection: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
})
