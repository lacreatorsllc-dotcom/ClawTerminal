import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase, subscribeToAgent, sendMessage } from '../../lib/supabase'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import { Colors } from '../../constants/colors'
import type { Message, AgentStatus } from '../../lib/types'

type Tab = 'chat' | 'status' | 'vitals' | 'activity'

const STATUS_COLOR: Record<AgentStatus, string> = {
  connected: Colors.accentGreen,
  connecting: Colors.accentTeal,
  stale: Colors.accentAmber,
  error: Colors.accentRed,
  disconnected: Colors.textSecondary,
}

export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('chat')
  const [input, setInput] = useState('')
  const flatListRef = useRef<FlatList>(null)
  const channelRef = useRef<any>(null)

  const { agents, getConnectionStatus } = useAgentsStore()
  const { user } = useAuthStore()
  const { messagesByAgent, setMessages, addMessage } = useChatStore()

  const agent = agents.find((a) => a.id === id)
  const messages = messagesByAgent[id] ?? []
  const status = id ? getConnectionStatus(id) : 'disconnected'

  // Load message history
  useEffect(() => {
    if (!id) return
    supabase
      .from('messages')
      .select('*')
      .eq('agent_id', id)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => { if (data) setMessages(id, data) })
  }, [id])

  // Subscribe to realtime
  useEffect(() => {
    if (!id) return
    channelRef.current = subscribeToAgent(id, {
      onMessage: (payload) => {
        const msg: Message = {
          id: String(Date.now()),
          agent_id: id,
          user_id: user?.id ?? '',
          direction: payload.direction as 'inbound' | 'outbound',
          content: payload.content,
          created_at: new Date(payload.ts).toISOString(),
        }
        addMessage(id, msg)
      },
    })
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [id])

  async function handleSend() {
    if (!input.trim() || !user || !id) return
    const content = input.trim()
    setInput('')
    await sendMessage(null, id, user.id, content)
  }

  if (!agent) return (
    <View style={styles.container}>
      <Text style={{ color: Colors.textSecondary, textAlign: 'center', marginTop: 100 }}>Agent not found</Text>
    </View>
  )

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.agentName}>{agent.name}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] }]} />
            <Text style={[styles.statusText, { color: STATUS_COLOR[status] }]}>{status}</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['chat', 'status', 'vitals', 'activity'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chat Tab */}
      {tab === 'chat' && (
        <>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <View style={[styles.bubble, item.direction === 'inbound' && styles.bubbleOut]}>
                <Text style={[styles.bubbleText, item.direction === 'inbound' && styles.bubbleTextOut]}>
                  {item.content}
                </Text>
                <Text style={styles.bubbleTime}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            )}
            contentContainerStyle={styles.chatList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
          <View style={styles.inputRow}>
            <TextInput
              style={styles.chatInput}
              value={input}
              onChangeText={setInput}
              placeholder="Message agent…"
              placeholderTextColor={Colors.textMuted}
              multiline
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Status Tab */}
      {tab === 'status' && (
        <View style={styles.tabContent}>
          <View style={styles.statusCard}>
            <Row label="Status" value={status} valueColor={STATUS_COLOR[status]} />
            <Row label="Last seen" value={agent.last_seen ? new Date(agent.last_seen).toLocaleString() : '—'} />
            <Row label="Agent ID" value={agent.id.slice(0, 8) + '…'} mono />
          </View>
          {status === 'disconnected' || status === 'error' ? (
            <View style={styles.reconnectBox}>
              <Text style={styles.reconnectLabel}>Agent offline. Re-run to reconnect:</Text>
              <Text style={styles.reconnectCmd}>{`npx claw-connector connect --token ${user?.id}`}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Vitals Tab */}
      {tab === 'vitals' && (
        <View style={styles.tabContent}>
          <View style={styles.statusCard}>
            <Row label="Neural Load" value="—" />
            <Row label="Memory Usage" value="—" />
            <Row label="Uptime" value={agent.last_seen ? '—' : '—'} />
            <Row label="Tasks Completed" value="—" />
            <Row label="Streak" value="—" />
          </View>
          <Text style={styles.activityEmpty}>Agent vitals coming soon</Text>
        </View>
      )}

      {/* Activity Tab */}
      {tab === 'activity' && (
        <View style={styles.tabContent}>
          <Text style={styles.activityEmpty}>Activity feed coming soon</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

function Row({ label, value, valueColor, mono }: { label: string; value: string; valueColor?: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : {}, mono ? styles.mono : {}]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, gap: 12 },
  backBtn: { padding: 4 },
  backBtnText: { fontSize: 28, color: Colors.textSecondary, lineHeight: 28 },
  headerInfo: { flex: 1 },
  agentName: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12 },
  tabs: { flexDirection: 'row', borderBottomWidth: 0, marginHorizontal: 16 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accentCrimson },
  tabText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: Colors.accentCrimson },
  chatList: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  bubble: {
    maxWidth: '80%',
    backgroundColor: Colors.bgElevated,
    borderRadius: 16,
    padding: 12,
    alignSelf: 'flex-start',
  },
  bubbleOut: { alignSelf: 'flex-end', backgroundColor: '#1a0608' },
  bubbleText: { color: Colors.textPrimary, fontSize: 15, lineHeight: 20 },
  bubbleTextOut: { color: '#fff' },
  bubbleTime: { color: Colors.textSecondary, fontSize: 11, marginTop: 4, alignSelf: 'flex-end' },
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderBottomWidth: 2,
    borderBottomColor: Colors.accentCrimson,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.accentCrimson,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnText: { color: Colors.bgPrimary, fontSize: 20, fontWeight: '700' },
  tabContent: { flex: 1, padding: 16 },
  statusCard: { backgroundColor: '#0f0f0f', borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  rowLabel: { color: Colors.textSecondary, fontSize: 14 },
  rowValue: { color: Colors.textPrimary, fontSize: 14 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  reconnectBox: { marginTop: 16, backgroundColor: 'rgba(245, 158, 11, 0.08)', borderRadius: 12, padding: 16, gap: 8 },
  reconnectLabel: { color: Colors.accentAmber, fontSize: 13 },
  reconnectCmd: { color: Colors.accentTeal, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  activityEmpty: { color: Colors.textSecondary, textAlign: 'center', marginTop: 48 },
})
