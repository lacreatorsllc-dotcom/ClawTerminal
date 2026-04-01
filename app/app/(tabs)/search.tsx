import { useState, useCallback, useRef } from 'react'
import {
  View, Text, TextInput, FlatList, SectionList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
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

interface UserResult {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

interface AgentResult {
  id: string
  name: string
  status: AgentStatus
  last_seen: string | null
  user_id: string
  ownerUsername: string | null
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

// Parse "username/agent" or just a name
function parseQuery(raw: string): { owner: string | null; term: string } {
  const clean = raw.replace(/^@/, '').trim()
  const slash = clean.indexOf('/')
  if (slash !== -1) {
    return { owner: clean.slice(0, slash) || null, term: clean.slice(slash + 1) }
  }
  return { owner: null, term: clean }
}

export default function SearchScreen() {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<UserResult[]>([])
  const [agents, setAgents] = useState<AgentResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (raw: string) => {
    const { owner, term } = parseQuery(raw)

    if (!term && !owner) {
      setUsers([])
      setAgents([])
      setSearched(false)
      return
    }

    setLoading(true)
    setSearched(true)

    const promises: [Promise<any>, Promise<any>] = [
      // Users by username
      owner
        ? Promise.resolve({ data: [] })
        : supabase
            .from('users')
            .select('id, username, display_name, avatar_url')
            .ilike('username', `%${term}%`)
            .limit(10),

      // Agents by name
      (() => {
        let q = supabase
          .from('agents')
          .select('id, name, status, last_seen, user_id')
          .order('last_seen', { ascending: false })
          .limit(20)
        if (term) q = q.ilike('name', `%${term}%`)
        return q
      })(),
    ]

    const [{ data: userRows }, { data: agentRows }] = await Promise.all(promises)

    // Resolve agent owners
    let mergedAgents: AgentResult[] = []
    if (agentRows && agentRows.length > 0) {
      const userIds = [...new Set(agentRows.map((a: any) => a.user_id as string))]
      const { data: ownerRows } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds)

      const usernameMap: Record<string, string> = Object.fromEntries(
        (ownerRows ?? []).map((u: any) => [u.id, u.username])
      )

      mergedAgents = agentRows.map((a: any) => ({
        ...a,
        ownerUsername: usernameMap[a.user_id] ?? null,
      }))

      if (owner) {
        mergedAgents = mergedAgents.filter(
          (a) => a.ownerUsername?.toLowerCase().startsWith(owner.toLowerCase())
        )
      }
    }

    setUsers((userRows as UserResult[]) ?? [])
    setAgents(mergedAgents)
    setLoading(false)
  }, [])

  function onChangeText(text: string) {
    setQuery(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(text), 300)
  }

  const sections = [
    ...(users.length > 0 ? [{ title: 'PEOPLE', data: users, type: 'user' as const }] : []),
    ...(agents.length > 0 ? [{ title: 'AGENTS', data: agents, type: 'agent' as const }] : []),
  ]

  const isEmpty = searched && !loading && users.length === 0 && agents.length === 0

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <Text style={styles.subtitle}>Find people and agents</Text>
      </View>

      <View style={styles.searchRow}>
        <Text style={styles.atSign}>@</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="username or agent-name"
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
            search(query)
          }}
        />
        {loading && <ActivityIndicator size="small" color={Colors.textMuted} style={styles.spinner} />}
      </View>

      {!searched ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Search people or agents</Text>
          <Text style={styles.emptyHint}>Try "@marketer" or "trader"</Text>
        </View>
      ) : loading ? null : isEmpty ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No results</Text>
          <Text style={styles.emptyHint}>Try a different name</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => (item as any).id}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item, section }) =>
            section.type === 'user'
              ? <UserRow user={item as UserResult} />
              : <AgentRow agent={item as AgentResult} />
          }
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  )
}

function UserRow({ user }: { user: UserResult }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/profile/${user.username}`)}
      activeOpacity={0.75}
    >
      <View style={[styles.avatar, { borderColor: Colors.accentAmber }]}>
        <View style={[styles.avatarInner, { backgroundColor: agentColor(user.username) + '22' }]}>
          <Text style={[styles.avatarInitial, { color: agentColor(user.username) }]}>
            {user.username[0].toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.userHandle}>@{user.username}</Text>
        {user.display_name ? (
          <Text style={styles.displayName}>{user.display_name}</Text>
        ) : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  )
}

function AgentRow({ agent }: { agent: AgentResult }) {
  const isOnline = agent.status === 'connected'
  const statusColor = STATUS_COLOR[agent.status]

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => agent.ownerUsername && router.push(`/profile/${agent.ownerUsername}`)}
      activeOpacity={0.75}
    >
      <View style={[styles.avatar, { borderColor: statusColor }]}>
        <View style={[styles.avatarInner, { backgroundColor: agentColor(agent.name) + '22' }]}>
          <Text style={[styles.avatarInitial, { color: agentColor(agent.name) }]}>
            {agent.name[0].toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={styles.rowInfo}>
        <View style={styles.slugRow}>
          {agent.ownerUsername && (
            <Text style={styles.ownerPart}>@{agent.ownerUsername}/</Text>
          )}
          <Text style={styles.agentPart}>{agent.name.toLowerCase().replace(/\s+/g, '-')}</Text>
        </View>
        <Text style={styles.agentFriendlyName}>{agent.name}</Text>
      </View>
      <View style={styles.statusCol}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusLabel, { color: isOnline ? Colors.accentGreen : Colors.textMuted }]}>
          {isOnline ? 'Online' : timeAgo(agent.last_seen)}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },

  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 12,
  },
  title: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#0f0f0f',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.bgBorder,
    paddingHorizontal: 14,
  },
  atSign: {
    fontSize: 15,
    color: Colors.accentAmber,
    fontWeight: '600',
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  spinner: { marginLeft: 8 },

  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 100 },

  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingTop: 16,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.bgBorder,
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  avatarInner: {
    width: 42, height: 42, borderRadius: 21,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarInitial: { fontSize: 18, fontWeight: '700' },

  rowInfo: { flex: 1, gap: 2 },
  userHandle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  displayName: { fontSize: 12, color: Colors.textMuted },
  chevron: { fontSize: 20, color: Colors.textMuted, lineHeight: 22 },

  slugRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  ownerPart: { fontSize: 14, fontWeight: '500', color: Colors.textMuted },
  agentPart: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  agentFriendlyName: { fontSize: 11, color: Colors.textMuted },

  statusCol: { alignItems: 'center', gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 10, fontWeight: '600' },

  empty: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  emptyHint: { fontSize: 13, color: Colors.textMuted },
})
