import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { createOrGetDirectThread, markDirectThreadRead, sendDirectMessage, subscribeToDirectMessages } from '../../lib/firebase'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'

function formatTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function BackMark() {
  return (
    <View style={styles.backMark}>
      <View style={[styles.backStroke, styles.backStrokeTop]} />
      <View style={[styles.backStroke, styles.backStrokeBottom]} />
    </View>
  )
}

export default function DirectThreadScreen() {
  const { threadId, username, otherUid } = useLocalSearchParams<{ threadId: string; username?: string; otherUid?: string }>()
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<any[]>([])
  const [pendingMessages, setPendingMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const thread = Array.isArray(threadId) ? threadId[0] : threadId
  const otherUsername = Array.isArray(username) ? username[0] : username
  const otherUserId = Array.isArray(otherUid) ? otherUid[0] : otherUid

  const visibleMessages = useMemo(() => {
    const optimistic = pendingMessages.filter((message) => {
      const content = String(message.content ?? '').trim()
      return !messages.some((confirmed) =>
        confirmed.sender_uid === message.sender_uid &&
        String(confirmed.content ?? '').trim() === content
      )
    })

    return [...messages, ...optimistic].sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
    )
  }, [messages, pendingMessages])

  useEffect(() => {
    if (!thread) return
    return subscribeToDirectMessages(thread, setMessages)
  }, [thread])

  useEffect(() => {
    if (!thread || !user?.uid) return
    void markDirectThreadRead(thread, user.uid)
  }, [thread, user?.uid])

  useEffect(() => {
    if (!thread) {
      setPendingMessages([])
      return
    }
    setPendingMessages((current) => current.filter((message) => message.thread_id === thread))
  }, [thread])

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
    if (!user?.uid || !otherUserId) return
    void createOrGetDirectThread(user.uid, otherUserId)
  }, [otherUserId, user?.uid])

  async function handleSend() {
    if (!user?.uid || !thread || !text.trim()) return
    const body = text
    const optimisticMessage = {
      id: `pending-${Date.now()}`,
      thread_id: thread,
      sender_uid: user.uid,
      content: body,
      created_at: new Date().toISOString(),
      pending: true,
    }
    setText('')
    setPendingMessages((current) => [...current, optimisticMessage])
    if (otherUserId) {
      await createOrGetDirectThread(user.uid, otherUserId)
    }
    try {
      await sendDirectMessage(thread, user.uid, body)
    } catch (error) {
      setText(body)
      setPendingMessages((current) => current.filter((message) => message.id !== optimisticMessage.id))
      throw error
    }
  }

  const title = useMemo(() => `@${otherUsername ?? 'chat'}`, [otherUsername])

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          {Platform.OS === 'web' ? <BackMark /> : <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />}
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {visibleMessages.length === 0 ? (
          <Text style={styles.emptyText}>No messages yet. Start the conversation.</Text>
        ) : (
          visibleMessages.map((message) => {
            const mine = message.sender_uid === user?.uid
            return (
              <View key={message.id} style={[styles.messageRow, mine && styles.messageRowMine]}>
                <View style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
                  <Text style={styles.messageText}>{message.content}</Text>
                </View>
                <Text style={[styles.messageTime, mine && styles.messageTimeMine, message.pending && styles.messagePendingTime]}>
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
          placeholder={`Message ${title}...`}
          placeholderTextColor={Colors.textMuted}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend} activeOpacity={0.85}>
          <Ionicons name="arrow-up" size={16} color={Colors.bgPrimary} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.bgBorder, alignItems: 'center', justifyContent: 'center' },
  backMark: { width: 10, height: 14, alignItems: 'center', justifyContent: 'center' },
  backStroke: {
    position: 'absolute',
    width: 8,
    height: 1.8,
    borderRadius: 2,
    backgroundColor: Colors.textPrimary,
    left: 1,
  },
  backStrokeTop: { top: 4, transform: [{ rotate: '-45deg' }] },
  backStrokeBottom: { bottom: 4, transform: [{ rotate: '45deg' }] },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  emptyText: { color: Colors.textMuted, fontSize: 14, marginTop: 12 },
  messageRow: { alignItems: 'flex-start', gap: 4 },
  messageRowMine: { alignItems: 'flex-end' },
  messageBubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12 },
  messageBubbleMine: { backgroundColor: Colors.accentAmber },
  messageBubbleOther: { backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.bgBorder },
  messageText: { color: Colors.textPrimary, fontSize: 14, lineHeight: 21 },
  messageTime: { color: Colors.textMuted, fontSize: 11, paddingHorizontal: 4 },
  messageTimeMine: { textAlign: 'right' },
  messagePendingTime: { color: Colors.accentAmber },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 16, borderTopWidth: 1, borderTopColor: Colors.bgBorder },
  input: { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: 18, borderWidth: 1, borderColor: Colors.bgBorder, color: Colors.textPrimary, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.accentAmber, alignItems: 'center', justifyContent: 'center' },
})
