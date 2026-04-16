import { useState, useCallback, useRef } from 'react'
import {
  View, Text, TextInput, SectionList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import {
  searchUsers,
  searchAgents,
  getRecentAgents,
  batchGetUsernames,
  firestoreTsToIso,
} from '../../lib/firebase'
import { Colors } from '../../constants/colors'
import type { AgentStatus } from '../../lib/types'
import { useAuthStore } from '../../stores/authStore'

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

type SearchRow = UserResult | AgentResult

type SearchSection = { title: string; data: SearchRow[]; type: 'user' | 'agent' }

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

function firestoreUserToResult(row: { id: string } & Record<string, unknown>): UserResult {
  return {
    id: row.id,
    username: String(row.username ?? ''),
    display_name: (row.display_name as string) ?? (row.displayName as string) ?? null,
    avatar_url: (row.avatar_url as string) ?? (row.avatarUrl as string) ?? null,
  }
}

function coerceAgentStatus(s: unknown): AgentStatus {
  const v = String(s || '')
  if (v === 'connected' || v === 'connecting' || v === 'stale' || v === 'error' || v === 'disconnected') {
    return v
  }
  return 'disconnected'
}

export default function SearchScreen() {
  const { user } = useAuthStore()
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<UserResult[]>([])
  const [agents, setAgents] = useState<AgentResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (raw: string) => {
    const { owner, term } = parseQuery(raw)

    if (!term && !owner) {
      setUsers([])
      setAgents([])
      setSearched(false)
      setError(null)
      return
    }

    setLoading(true)
    setSearched(true)
    setError(null)

    try {
      // Profiles and agents live in Firestore (Supabase users/agents are not synced from the app).
      let userResults: UserResult[] = []
      let agentDocs: Array<{ id: string; user_id?: string; name?: string; status?: string; last_seen?: unknown }> = []

      if (owner && !term) {
        try {
          agentDocs = await getRecentAgents(30)
        } catch {
          agentDocs = []
        }
      } else if (owner && term) {
        try {
          agentDocs = await searchAgents(term)
        } catch {
          agentDocs = []
        }
      } else if (!owner && term) {
        const [uRows, aRows] = await Promise.allSettled([
          searchUsers(term.toLowerCase()),
          searchAgents(term),
        ])
        userResults = (uRows.status === 'fulfilled' ? uRows.value : [])
          .map((r) => firestoreUserToResult(r as { id: string } & Record<string, unknown>))
          .filter((u) => u.username.length > 0)
        agentDocs = aRows.status === 'fulfilled' ? (aRows.value as typeof agentDocs) : []
      }

      const userIds = [...new Set(agentDocs.map((a) => a.user_id as string).filter(Boolean))]
      let usernameMap: Record<string, string> = {}
      try {
        usernameMap = await batchGetUsernames(userIds)
      } catch {
        usernameMap = {}
      }

      let mergedAgents: AgentResult[] = agentDocs.map((a) => ({
        id: a.id,
        name: String(a.name ?? ''),
        status: coerceAgentStatus(a.status),
        last_seen: firestoreTsToIso(a.last_seen as any),
        user_id: String(a.user_id ?? ''),
        ownerUsername: a.user_id ? usernameMap[a.user_id] ?? null : null,
      }))

      if (owner) {
        const o = owner.toLowerCase()
        mergedAgents = mergedAgents.filter((a) => a.ownerUsername?.toLowerCase().startsWith(o))
      }

      setUsers(owner ? [] : userResults)
      setAgents(mergedAgents)
    } catch (error) {
      console.warn('[search] failed', error)
      setUsers([])
      setAgents([])
      setError('Search failed. Try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  function onChangeText(text: string) {
    setQuery(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(text), 300)
  }

  const sections: SearchSection[] = [
    ...(users.length > 0 ? [{ title: 'PEOPLE', data: users as SearchRow[], type: 'user' as const }] : []),
    ...(agents.length > 0 ? [{ title: 'AGENTS', data: agents as SearchRow[], type: 'agent' as const }] : []),
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
      ) : loading ? null : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{error}</Text>
          <Text style={styles.emptyHint}>Try another search.</Text>
        </View>
      ) : isEmpty ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No results</Text>
          <Text style={styles.emptyHint}>Try a different name</Text>
        </View>
      ) : (
        <SectionList<SearchRow, SearchSection>
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item, section }) =>
            section.type === 'user'
              ? <UserRow user={item as UserResult} myUid={user?.uid ?? null} />
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

function UserRow({ user, myUid }: { user: UserResult; myUid: string | null }) {
  const safeUsername = user.username || 'user'
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => {
        if (myUid && user.id === myUid) {
          router.push('/(tabs)/profile')
          return
        }
        router.push({ pathname: '/profile/[username]', params: { username: user.username, uid: user.id } })
      }}
      activeOpacity={0.75}
    >
      <View style={[styles.avatar, { borderColor: Colors.accentAmber }]}>
        <View style={[styles.avatarInner, { backgroundColor: agentColor(safeUsername) + '22' }]}>
          <Text style={[styles.avatarInitial, { color: agentColor(safeUsername) }]}>
            {safeUsername[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.userHandle}>@{safeUsername}</Text>
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
  const safeName = agent.name || 'slug'

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => agent.ownerUsername && router.push(`/profile/${agent.ownerUsername}`)}
      activeOpacity={0.75}
    >
      <View style={[styles.avatar, { borderColor: statusColor }]}>
        <View style={[styles.avatarInner, { backgroundColor: agentColor(safeName) + '22' }]}>
          <Text style={[styles.avatarInitial, { color: agentColor(safeName) }]}>
            {safeName[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
      </View>
      <View style={styles.rowInfo}>
        <View style={styles.slugRow}>
          {agent.ownerUsername && (
            <Text style={styles.ownerPart}>@{agent.ownerUsername}/</Text>
          )}
          <Text style={styles.agentPart}>{safeName.toLowerCase().replace(/\s+/g, '-')}</Text>
        </View>
        <Text style={styles.agentFriendlyName}>{safeName}</Text>
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
