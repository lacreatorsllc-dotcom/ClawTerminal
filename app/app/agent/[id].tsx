import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, Linking, Alert
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase, subscribeToAgent, sendMessage } from '../../lib/supabase'
import { useAgentsStore } from '../../stores/agentsStore'
import { useAuthStore } from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import { Colors } from '../../constants/colors'
import type { Message, AgentStatus } from '../../lib/types'

type Tab = 'chat' | 'status' | 'vitals' | 'activity' | 'skills'

interface InstalledSkill {
  id: string
  name: string
  description: string
  version: string
  category: string | null
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g

function MessageText({ content, outbound }: { content: string; outbound: boolean }) {
  const parts = content.split(URL_REGEX)
  return (
    <Text style={[styles.bubbleText, outbound && styles.bubbleTextOut]}>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <Text key={i} style={styles.bubbleLink} onPress={() => Linking.openURL(part)}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  )
}

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
  const [tokenStats, setTokenStats] = useState<{ input: number; output: number; messageCount: number } | null>(null)
  const [agentSkills, setAgentSkills] = useState<InstalledSkill[]>([])
  const [loadingSkills, setLoadingSkills] = useState(false)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<{ local: string; remote?: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const channelRef = useRef<any>(null)

  const { agents, getConnectionStatus } = useAgentsStore()
  const { user } = useAuthStore()
  const { messagesByAgent, setMessages, addMessage } = useChatStore()

  const agent = agents.find((a) => a.id === id)
  const messages = messagesByAgent[id] ?? []
  const status = id ? getConnectionStatus(id) : 'disconnected'

  useEffect(() => {
    if (!id || tab !== 'skills') return
    setLoadingSkills(true)
    supabase
      .from('agent_skills')
      .select('skill_slug, config, status')
      .eq('agent_id', id)
      .eq('status', 'active')
      .then(({ data }) => {
        setAgentSkills(
          (data ?? []).map((row: any) => ({
            id: row.skill_slug,
            name: row.config?.displayName ?? row.skill_slug,
            description: '',
            version: row.config?.version ?? '1.0.0',
            category: 'Registry',
          }))
        )
        setLoadingSkills(false)
      })
  }, [id, tab])

  useEffect(() => {
    if (!id || tab !== 'vitals') return
    supabase
      .from('messages')
      .select('input_tokens, output_tokens')
      .eq('agent_id', id)
      .then(({ data }) => {
        if (!data) return
        let input = 0, output = 0, messageCount = data.length
        for (const row of data) {
          input += row.input_tokens ?? 0
          output += row.output_tokens ?? 0
        }
        setTokenStats({ input, output, messageCount })
      })
  }, [id, tab])

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
        const msgId = (payload as any).id ?? String(payload.ts)
        const msg: Message = {
          id: msgId,
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

  async function handlePickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access to send images.'); return }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
    })
    if (result.canceled) return

    // Show local previews immediately
    const newItems = result.assets.map((a) => ({ local: a.uri }))
    setAttachments((prev) => [...prev, ...newItems])

    // Upload in background
    setUploading(true)
    for (const asset of result.assets) {
      try {
        const ext = asset.uri.split('.').pop() ?? 'jpg'
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const response = await fetch(asset.uri)
        const blob = await response.blob()
        const { data, error } = await supabase.storage
          .from('message-attachments')
          .upload(fileName, blob, { contentType: asset.mimeType ?? 'image/jpeg' })
        if (!error && data) {
          const { data: { publicUrl } } = supabase.storage.from('message-attachments').getPublicUrl(data.path)
          setAttachments((prev) => prev.map((a) => a.local === asset.uri ? { local: a.local, remote: publicUrl } : a))
        }
      } catch {}
    }
    setUploading(false)
  }

  async function handleSend() {
    if ((!input.trim() && attachments.length === 0) || !user || !id) return
    const content = input.trim() || (attachments.length > 0 ? '[image]' : '')
    setInput('')
    const urls = attachments.map((a) => a.remote ?? a.local)
    const meta = urls.length > 0 ? { attachments: urls } : undefined
    setAttachments([])
    await sendMessage(channelRef.current, id, user.id, content, meta)

    // If this is a Telegram agent, forward the message via Edge Function
    if (agent?.metadata?.type === 'telegram') {
      fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/telegram-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id, userId: user.id, text: content }),
      }).catch(() => {}) // fire-and-forget
    }
  }

  if (!agent) return (
    <View style={styles.container}>
      <Text style={{ color: Colors.textSecondary, textAlign: 'center', marginTop: 100 }}>Agent not found</Text>
    </View>
  )

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
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
        {(['chat', 'status', 'vitals', 'activity', 'skills'] as Tab[]).map((t) => (
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
                {item.metadata?.attachments?.map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={styles.bubbleImage} resizeMode="cover" />
                ))}
                {item.content && item.content !== '[image]' && (
                  <MessageText content={item.content} outbound={item.direction === 'inbound'} />
                )}
                <Text style={styles.bubbleTime}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            )}
            contentContainerStyle={styles.chatList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
          {attachments.length > 0 && (
            <View style={styles.attachmentPreview}>
              {attachments.map((att, i) => (
                <View key={i} style={styles.attachmentThumbWrap}>
                  <Image source={{ uri: att.local }} style={styles.attachmentThumb} />
                  <TouchableOpacity style={styles.attachmentRemove} onPress={() => setAttachments((p) => p.filter((_, j) => j !== i))}>
                    <Text style={styles.attachmentRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.attachBtn} onPress={handlePickImage} disabled={uploading}>
              {uploading
                ? <ActivityIndicator size="small" color={Colors.textMuted} />
                : <Text style={styles.attachBtnText}>⊕</Text>
              }
            </TouchableOpacity>
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
            <TouchableOpacity style={[styles.sendBtn, (!input.trim() && attachments.length === 0) && styles.sendBtnDisabled]} onPress={handleSend}>
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
          {tokenStats ? (
            <>
              <View style={styles.statusCard}>
                <Row label="Messages" value={String(tokenStats.messageCount)} />
                <Row label="Input tokens" value={tokenStats.input.toLocaleString()} />
                <Row label="Output tokens" value={tokenStats.output.toLocaleString()} />
                <Row label="Total tokens" value={(tokenStats.input + tokenStats.output).toLocaleString()} />
                <Row
                  label="Est. cost"
                  value={`$${((tokenStats.input / 1_000_000) * 0.80 + (tokenStats.output / 1_000_000) * 4.00).toFixed(4)}`}
                  valueColor={Colors.accentTeal}
                />
              </View>
              <Text style={styles.vitalsNote}>Cost based on Claude Haiku pricing ($0.80/M input · $4.00/M output)</Text>
            </>
          ) : (
            <View style={styles.statusCard}>
              <Row label="Messages" value="—" />
              <Row label="Input tokens" value="—" />
              <Row label="Output tokens" value="—" />
              <Row label="Total tokens" value="—" />
              <Row label="Est. cost" value="—" />
            </View>
          )}
          <View style={[styles.statusCard, { marginTop: 12 }]}>
            <Row label="Status" value={status} valueColor={STATUS_COLOR[status]} />
            <Row label="Connected since" value={agent.created_at ? new Date(agent.created_at).toLocaleDateString() : '—'} />
            {agent.metadata?.bot_username ? (
              <Row label="Bot username" value={`@${agent.metadata.bot_username as string}`} mono />
            ) : null}
            {agent.metadata?.powered_by ? (
              <Row label="Powered by" value={String(agent.metadata.powered_by)} />
            ) : null}
          </View>
        </View>
      )}

      {/* Activity Tab */}
      {tab === 'activity' && (
        <View style={{ flex: 1 }}>
          {messages.length === 0 ? (
            <View style={styles.tabContent}>
              <Text style={styles.activityEmpty}>No activity yet — send a message to get started</Text>
            </View>
          ) : (
            <FlatList
              data={[...messages].reverse()}
              keyExtractor={(m) => m.id + '-activity'}
              contentContainerStyle={styles.activityList}
              renderItem={({ item }) => (
                <View style={styles.activityRow}>
                  <View style={[styles.activityDot, { backgroundColor: item.direction === 'inbound' ? Colors.accentCrimson : Colors.accentTeal }]} />
                  <View style={styles.activityContent}>
                    <Text style={styles.activityLabel}>{item.direction === 'inbound' ? 'You' : agent.name}</Text>
                    <Text style={styles.activityText} numberOfLines={2}>{item.content}</Text>
                  </View>
                  <Text style={styles.activityTime}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      )}
      {/* Skills Tab */}
      {tab === 'skills' && (
        <View style={{ flex: 1 }}>
          {loadingSkills ? (
            <View style={styles.tabContent}>
              <ActivityIndicator color={Colors.accentTeal} />
            </View>
          ) : agentSkills.length === 0 ? (
            <View style={styles.tabContent}>
              <Text style={styles.activityEmpty}>No skills installed — browse the Skills tab to add some</Text>
            </View>
          ) : (
            <FlatList
              data={agentSkills}
              keyExtractor={(s) => s.id}
              contentContainerStyle={styles.activityList}
              renderItem={({ item }) => (
                <View style={styles.skillRow}>
                  <View style={styles.skillRowContent}>
                    <Text style={styles.skillRowName}>{item.name}</Text>
                    {item.description ? (
                      <Text style={styles.skillRowDesc} numberOfLines={2}>{item.description}</Text>
                    ) : null}
                  </View>
                  <View style={styles.skillRowMeta}>
                    {item.category ? <Text style={styles.skillRowCategory}>{item.category}</Text> : null}
                    <Text style={styles.skillRowVersion}>v{item.version}</Text>
                  </View>
                </View>
              )}
            />
          )}
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
  bubbleImage: { width: '100%', height: 180, borderRadius: 10, marginBottom: 6 },
  bubbleText: { color: Colors.textPrimary, fontSize: 15, lineHeight: 20 },
  bubbleTextOut: { color: '#fff' },
  bubbleLink: { color: Colors.accentTeal, textDecorationLine: 'underline' },
  bubbleTime: { color: Colors.textSecondary, fontSize: 11, marginTop: 4, alignSelf: 'flex-end' },
  sendBtnDisabled: { opacity: 0.4 },
  attachmentPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  attachmentThumbWrap: { position: 'relative' },
  attachmentThumb: { width: 64, height: 64, borderRadius: 8 },
  attachmentRemove: {
    position: 'absolute', top: -6, right: -6,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.accentCrimson,
    justifyContent: 'center', alignItems: 'center',
  },
  attachmentRemoveText: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 14 },
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  attachBtn: {
    width: 44, height: 44,
    justifyContent: 'center', alignItems: 'center',
    borderRadius: 12,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
  },
  attachBtnText: { color: Colors.textSecondary, fontSize: 22 },
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
  vitalsNote: { color: Colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 10 },
  activityList: { padding: 16, gap: 2 },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgBorder,
  },
  activityDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  activityContent: { flex: 1, gap: 2 },
  activityLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  activityText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 19 },
  activityTime: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgBorder,
    gap: 12,
  },
  skillRowContent: { flex: 1, gap: 3 },
  skillRowName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  skillRowDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  skillRowMeta: { alignItems: 'flex-end', gap: 4 },
  skillRowCategory: { fontSize: 10, fontWeight: '700', color: Colors.accentTeal, textTransform: 'uppercase', letterSpacing: 0.5 },
  skillRowVersion: { fontSize: 11, color: Colors.textMuted },
})
