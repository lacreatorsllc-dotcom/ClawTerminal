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
import { createOrGetDirectThread, sendDirectMessage, subscribeToDirectMessages } from '../../lib/firebase'
import { useAuthStore } from '../../stores/authStore'
import { Colors } from '../../constants/colors'

function formatTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function DirectThreadScreen() {
  const { threadId, username, otherUid } = useLocalSearchParams<{ threadId: string; username?: string; otherUid?: string }>()
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const thread = Array.isArray(threadId) ? threadId[0] : threadId
  const otherUsername = Array.isArray(username) ? username[0] : username
  const otherUserId = Array.isArray(otherUid) ? otherUid[0] : otherUid

  useEffect(() => {
    if (!thread) return
    return subscribeToDirectMessages(thread, setMessages)
  }, [thread])

  useEffect(() => {
    if (!user?.uid || !otherUserId) return
    void createOrGetDirectThread(user.uid, otherUserId)
  }, [otherUserId, user?.uid])

  async function handleSend() {
    if (!user?.uid || !thread || !text.trim()) return
    const body = text
    setText('')
    if (otherUserId) {
      await createOrGetDirectThread(user.uid, otherUserId)
    }
    await sendDirectMessage(thread, user.uid, body)
  }

  const title = useMemo(() => `@${otherUsername ?? 'chat'}`, [otherUsername])

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={18} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {messages.length === 0 ? (
          <Text style={styles.emptyText}>No messages yet. Start the conversation.</Text>
        ) : (
          messages.map((message) => {
            const mine = message.sender_uid === user?.uid
            return (
              <View key={message.id} style={[styles.messageRow, mine && styles.messageRowMine]}>
                <View style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
                  <Text style={styles.messageText}>{message.content}</Text>
                </View>
                <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>{formatTime(message.created_at)}</Text>
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
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 16, borderTopWidth: 1, borderTopColor: Colors.bgBorder },
  input: { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: 18, borderWidth: 1, borderColor: Colors.bgBorder, color: Colors.textPrimary, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.accentAmber, alignItems: 'center', justifyContent: 'center' },
})
