import { useEffect, useMemo, useState } from 'react'
import {
  Platform,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  useWindowDimensions,
} from 'react-native'
import {
  createOrGetDirectThread,
  markDirectThreadRead,
  sendDirectMessage,
  subscribeToDirectMessages,
  subscribeToDirectThreads,
} from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { useChatDockStore } from '../stores/chatDockStore'
import { Colors } from '../constants/colors'

function DockIcon({ kind, color }: { kind: 'chat' | 'close' | 'send' | 'clock'; color: string }) {
  if (kind === 'chat') {
    return (
      <View style={styles.iconChatWrap}>
        <View style={[styles.iconBubble, { borderColor: color }]}>
          <View style={[styles.iconDot, { backgroundColor: color }]} />
          <View style={[styles.iconDot, { backgroundColor: color }]} />
          <View style={[styles.iconDot, { backgroundColor: color }]} />
        </View>
      </View>
    )
  }

  if (kind === 'close') {
    return (
      <View style={styles.iconCloseWrap}>
        <View style={[styles.iconCloseLine, { backgroundColor: color, transform: [{ rotate: '45deg' }] }]} />
        <View style={[styles.iconCloseLine, { backgroundColor: color, transform: [{ rotate: '-45deg' }] }]} />
      </View>
    )
  }

  if (kind === 'clock') {
    return (
      <View style={[styles.iconClockRing, { borderColor: color }]}>
        <View style={[styles.iconClockHandShort, { backgroundColor: color }]} />
        <View style={[styles.iconClockHandLong, { backgroundColor: color }]} />
      </View>
    )
  }

  return (
    <View style={styles.iconSendWrap}>
      <View style={[styles.iconSendStem, { backgroundColor: color }]} />
      <View style={[styles.iconSendHeadOne, { borderLeftColor: color }]} />
      <View style={[styles.iconSendHeadTwo, { borderLeftColor: color }]} />
    </View>
  )
}

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
  const { width } = useWindowDimensions()
  const [threads, setThreads] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [pendingMessages, setPendingMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const {
    isOpen,
    activeThreadId,
    activeOtherUid,
    activeUsername,
    openConversation,
    closeDock,
    toggleDock,
    setActiveThread,
  } = useChatDockStore()

  useEffect(() => {
    if (!user?.uid) return
    return subscribeToDirectThreads(user.uid, setThreads)
  }, [user?.uid])

  const validThreads = useMemo(
    () => threads.filter((thread) => thread.other_user?.id && thread.other_user.id !== user?.uid),
    [threads, user?.uid]
  )
  const unreadCount = useMemo(
    () => validThreads.filter((thread) => thread.unread).length,
    [validThreads]
  )

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([])
      setPendingMessages([])
      return
    }
    return subscribeToDirectMessages(activeThreadId, setMessages)
  }, [activeThreadId])

  useEffect(() => {
    if (!activeThreadId) return
    setPendingMessages((current) => current.filter((message) => message.thread_id === activeThreadId))
  }, [activeThreadId])

  useEffect(() => {
    if (!activeThreadId || !user?.uid) return
    void markDirectThreadRead(activeThreadId, user.uid)
  }, [activeThreadId, user?.uid])

  useEffect(() => {
    if (messages.length === 0) return
    setPendingMessages((current) =>
      current.filter((pending) => !messages.some((confirmed) =>
        confirmed.sender_uid === pending.sender_uid &&
        String(confirmed.content ?? '').trim() === String(pending.content ?? '').trim()
      ))
    )
  }, [messages])

  useEffect(() => {
    if (activeOtherUid && user?.uid && activeOtherUid === user.uid) {
      setActiveThread({ threadId: null, otherUid: null, username: null })
      return
    }

    if (!activeThreadId && validThreads.length > 0) {
      const firstThread = validThreads[0]
      setActiveThread({
        threadId: firstThread.id,
        otherUid: firstThread.other_user?.id,
        username: firstThread.other_user?.username,
      })
    }
  }, [validThreads, activeThreadId, activeOtherUid, setActiveThread, user?.uid])

  useEffect(() => {
    if (!activeThreadId) return
    if (activeOtherUid && user?.uid && activeOtherUid === user.uid) {
      setActiveThread({ threadId: null, otherUid: null, username: null })
      return
    }
    if (validThreads.some((thread) => thread.id === activeThreadId)) return
    if (activeOtherUid && activeOtherUid !== user?.uid) return
    setActiveThread({
      threadId: validThreads[0]?.id ?? null,
      otherUid: validThreads[0]?.other_user?.id ?? null,
      username: validThreads[0]?.other_user?.username ?? null,
    })
  }, [activeThreadId, activeOtherUid, setActiveThread, user?.uid, validThreads])

  const activeThread = useMemo(
    () => validThreads.find((thread) => thread.id === activeThreadId) ?? (
      activeThreadId && activeOtherUid && activeOtherUid !== user?.uid
        ? {
            id: activeThreadId,
            other_user: {
              id: activeOtherUid,
              username: activeUsername ?? 'user',
            },
            last_message_text: '',
            last_message_at: null,
            updated_at: null,
          }
        : null
    ),
    [validThreads, activeThreadId, activeOtherUid, activeUsername, user?.uid]
  )

  const visibleMessages = useMemo(() => {
    const confirmedKeys = new Set(
      messages.map((message) => `${message.sender_uid}:${String(message.content ?? '').trim()}:${message.created_at ?? ''}`)
    )

    const optimistic = pendingMessages.filter((message) => {
      const content = String(message.content ?? '').trim()
      return !messages.some((confirmed) =>
        confirmed.sender_uid === message.sender_uid &&
        String(confirmed.content ?? '').trim() === content
      ) && !confirmedKeys.has(`${message.sender_uid}:${content}:${message.created_at ?? ''}`)
    })

    return [...messages, ...optimistic].sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
    )
  }, [messages, pendingMessages])

  async function handleSend() {
    if (!user?.uid || !activeThreadId || !text.trim()) return
    const body = text
    const optimisticMessage = {
      id: `pending-${Date.now()}`,
      thread_id: activeThreadId,
      sender_uid: user.uid,
      content: body,
      created_at: new Date().toISOString(),
      pending: true,
    }
    setSendError(null)
    setIsSending(true)
    try {
      setText('')
      setPendingMessages((current) => [...current, optimisticMessage])
      if (activeOtherUid) {
        await createOrGetDirectThread(user.uid, activeOtherUid)
      }
      await sendDirectMessage(activeThreadId, user.uid, body)
    } catch (error) {
      console.warn('[dm] send failed', error)
      setText(body)
      setPendingMessages((current) => current.filter((message) => message.id !== optimisticMessage.id))
      const errorMessage = error instanceof Error ? error.message : 'Unknown send error'
      setSendError(`Message failed to send: ${errorMessage}`)
    } finally {
      setIsSending(false)
    }
  }

  if (!user) return null
  if (Platform.OS !== 'web') return null

  const panelWidth = Math.max(320, Math.min(760, width - 24))
  const launcherOffset = width < 768 ? 14 : 24

  return (
    <View pointerEvents="box-none" style={[styles.root, { right: launcherOffset, bottom: launcherOffset }]}>
      {isOpen && (
        <View style={[styles.panel, { width: panelWidth, maxWidth: width - 12 }]}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelTitle}>Chats</Text>
              <Text style={styles.panelSubtitle}>Talk without leaving the page</Text>
            </View>
            <TouchableOpacity style={styles.headerBtn} onPress={closeDock} activeOpacity={0.8}>
              <DockIcon kind="close" color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.threadColumn}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.threadList}>
                {validThreads.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>No conversations yet</Text>
                    <Text style={styles.emptyBody}>Start one from a public profile or slug profile.</Text>
                  </View>
                ) : (
                  validThreads.map((thread) => {
                    const active = thread.id === activeThreadId
                    return (
                      <TouchableOpacity
                        key={thread.id}
                        style={[styles.threadItem, active && styles.threadItemActive]}
                        onPress={() => openConversation({
                          threadId: thread.id,
                          otherUid: thread.other_user?.id,
                          username: thread.other_user?.username,
                        })}
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
                    {visibleMessages.length === 0 ? (
                      <Text style={styles.emptyBody}>No messages yet. Start the conversation.</Text>
                    ) : (
                      visibleMessages.map((message) => {
                        const mine = message.sender_uid === user.uid
                        return (
                          <View key={message.id} style={[styles.messageRow, mine && styles.messageRowMine]}>
                            <View style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
                              <Text style={[styles.messageText, mine && styles.messageTextMine]}>{message.content}</Text>
                            </View>
                            <Text style={[styles.messageTimeText, mine && styles.messageTimeTextMine, message.pending && styles.messagePendingTime]}>
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
                    <TouchableOpacity style={styles.sendBtn} onPress={handleSend} activeOpacity={0.85} disabled={isSending}>
                      <DockIcon kind={isSending ? 'clock' : 'send'} color={Colors.bgPrimary} />
                    </TouchableOpacity>
                  </View>
                  {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}
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
        style={[styles.launcher, isOpen && styles.launcherActive]}
        onPress={toggleDock}
        activeOpacity={0.9}
      >
        <DockIcon kind="chat" color={isOpen ? Colors.bgPrimary : Colors.textPrimary} />
        <Text style={[styles.launcherText, isOpen && styles.launcherTextActive]}>Chat</Text>
        {unreadCount > 0 && !isOpen ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
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
  iconChatWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubble: {
    width: 18,
    height: 14,
    borderWidth: 1.6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 2,
  },
  iconCloseWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCloseLine: {
    position: 'absolute',
    width: 12,
    height: 1.8,
    borderRadius: 2,
  },
  iconSendWrap: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSendStem: {
    width: 2,
    height: 11,
    borderRadius: 2,
  },
  iconSendHeadOne: {
    position: 'absolute',
    top: 1,
    left: 7,
    width: 0,
    height: 0,
    borderTopWidth: 4,
    borderBottomWidth: 0,
    borderLeftWidth: 4,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  iconSendHeadTwo: {
    position: 'absolute',
    top: 1,
    left: 5,
    width: 0,
    height: 0,
    borderBottomWidth: 4,
    borderTopWidth: 0,
    borderLeftWidth: 4,
    borderBottomColor: 'transparent',
    borderTopColor: 'transparent',
  },
  iconClockRing: {
    width: 16,
    height: 16,
    borderWidth: 1.6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconClockHandShort: {
    position: 'absolute',
    width: 2,
    height: 4,
    borderRadius: 2,
    top: 4,
  },
  iconClockHandLong: {
    position: 'absolute',
    width: 4,
    height: 2,
    borderRadius: 2,
    right: 3,
    top: 7,
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
  threadMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  threadHandle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  threadTime: { color: Colors.textMuted, fontSize: 11 },
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
  readBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  readBadgeTextMuted: {
    color: Colors.textMuted,
  },
  unreadBadgeText: {
    color: Colors.accentAmber,
  },
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
  messagePendingTime: { color: Colors.accentAmber },
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
  sendError: {
    color: Colors.accentRed,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 14,
    paddingBottom: 12,
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
