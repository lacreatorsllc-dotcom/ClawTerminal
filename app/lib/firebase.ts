// Firebase — single source of truth for all app data
// Auth + Firestore replacing Supabase

import { initializeApp, getApps } from 'firebase/app'
import { Platform } from 'react-native'
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  getDocs,
  collectionGroup,
  runTransaction,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore'

// ── Config ────────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: 'AIzaSyAZeMHmCG1fM8JnjZUBZp8-dHUVY_g9lmU',
  authDomain: 'slugs-run.firebaseapp.com',
  projectId: 'slugs-run',
  storageBucket: 'slugs-run.firebasestorage.app',
  messagingSenderId: '1094657124615',
  appId: '1:1094657124615:web:6d030b4fd11a4b33f13da2',
}

const isFirstInit = getApps().length === 0
const app = isFirstInit ? initializeApp(firebaseConfig) : getApps()[0]

// On web, let the Firebase web SDK initialize auth with its default browser-safe persistence.
// On native, initialize once with AsyncStorage-backed persistence.
export const auth = Platform.OS === 'web'
  ? getAuth(app)
  : (isFirstInit
      ? initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage),
        })
      : getAuth(app))

export const db = getFirestore(app)

/** Owner-only secrets: `agents/{agentId}/private/secrets` (see Firestore rules). */
export const AGENT_PRIVATE_COLLECTION = 'private'
export const AGENT_SECRETS_DOC_ID = 'secrets'

// ── Helpers ───────────────────────────────────────────────────────────────────

function tsToISO(ts: Timestamp | string | null | undefined): string | null {
  if (!ts) return null
  if (typeof ts === 'string') return ts
  return ts.toDate().toISOString()
}

function tsToMillis(ts: Timestamp | string | null | undefined): number {
  const iso = tsToISO(ts)
  return iso ? new Date(iso).getTime() : 0
}

/** Exposed for screens that map raw Firestore timestamps */
export const firestoreTsToIso = tsToISO

// ── Auth ──────────────────────────────────────────────────────────────────────

export { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, fbSignOut as signOut, sendPasswordResetEmail }
export type { User }

// ── Collections ───────────────────────────────────────────────────────────────

// /users/{uid}
export async function getProfile(uid: string) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? snap.data() : null
}

export async function setProfile(uid: string, data: Record<string, unknown>) {
  await setDoc(doc(db, 'users', uid), data, { merge: true })
}

function sanitizeUsernameSeed(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
  return (cleaned || 'user').slice(0, 20)
}

function usernameFromEmail(email?: string | null): string {
  const localPart = email?.split('@')[0]?.trim() || email?.trim() || 'user'
  return sanitizeUsernameSeed(localPart)
}

function usernameCandidate(base: string, attempt: number): string {
  if (attempt === 0) return base
  const suffix = String(attempt + 1)
  return `${base.slice(0, Math.max(3, 20 - suffix.length))}${suffix}`
}

async function reserveUsername(uid: string, preferred: string): Promise<string> {
  const base = sanitizeUsernameSeed(preferred)
  const userRef = doc(db, 'users', uid)

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = usernameCandidate(base, attempt)
    const usernameRef = doc(db, 'usernames', candidate)

    try {
      await runTransaction(db, async (tx) => {
        const [usernameSnap, userSnap] = await Promise.all([tx.get(usernameRef), tx.get(userRef)])
        const claimedBy = usernameSnap.exists() ? usernameSnap.data().uid : null
        if (typeof claimedBy === 'string' && claimedBy !== uid) {
          throw new Error('TAKEN')
        }

        tx.set(usernameRef, { uid })
        tx.set(userRef, {
          username: candidate,
          created_at: userSnap.exists() ? (userSnap.data().created_at ?? serverTimestamp()) : serverTimestamp(),
          updated_at: serverTimestamp(),
        }, { merge: true })
      })

      return candidate
    } catch (error) {
      if (error instanceof Error && error.message === 'TAKEN') continue
      throw error
    }
  }

  throw new Error('Could not reserve a username')
}

export async function ensureUserProfile(uid: string, email?: string | null) {
  const existing = await getProfile(uid)
  const normalizedEmail = email?.trim().toLowerCase() ?? null

  if (existing?.username) {
    const usernameRef = doc(db, 'usernames', String(existing.username).toLowerCase())
    const usernameSnap = await getDoc(usernameRef)
    if (!usernameSnap.exists() || usernameSnap.data().uid !== uid) {
      await setDoc(usernameRef, { uid })
    }
    if (normalizedEmail && existing.email !== normalizedEmail) {
      await setProfile(uid, { email: normalizedEmail, updated_at: serverTimestamp() })
    }
    return existing
  }

  const reserved = await reserveUsername(uid, usernameFromEmail(normalizedEmail))
  await setProfile(uid, {
    email: normalizedEmail,
    display_name: existing?.display_name ?? null,
    avatar_url: existing?.avatar_url ?? null,
    username: reserved,
    updated_at: serverTimestamp(),
  })

  return {
    ...(existing ?? {}),
    email: normalizedEmail,
    username: reserved,
  }
}

// Username uniqueness check via /usernames/{username} → { uid }
export async function isUsernameTaken(username: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'usernames', username.toLowerCase()))
  return snap.exists()
}

export async function claimUsername(uid: string, username: string) {
  const lower = username.toLowerCase()
  const userRef = doc(db, 'users', uid)
  const usernameRef = doc(db, 'usernames', lower)

  const previous = await getProfile(uid)
  const previousUsername = typeof previous?.username === 'string' ? previous.username.toLowerCase() : null
  if (previousUsername === lower) return

  await runTransaction(db, async (tx) => {
    const usernameSnap = await tx.get(usernameRef)
    const claimedBy = usernameSnap.exists() ? usernameSnap.data().uid : null
    if (typeof claimedBy === 'string' && claimedBy !== uid) {
      throw new Error('Username already taken')
    }

    tx.set(usernameRef, { uid })
    tx.set(userRef, { username: lower, updated_at: serverTimestamp() }, { merge: true })
  })

  if (previousUsername && previousUsername !== lower) {
    const oldRef = doc(db, 'usernames', previousUsername)
    const oldSnap = await getDoc(oldRef)
    if (oldSnap.exists() && oldSnap.data().uid === uid) {
      const { deleteDoc } = await import('firebase/firestore')
      await deleteDoc(oldRef)
    }
  }
}

// /agents — user's agents
export function subscribeToUserAgents(uid: string, cb: (agents: any[]) => void) {
  const q = query(collection(db, 'agents'), where('user_id', '==', uid))
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data(), last_seen: tsToISO(d.data().last_seen as any) })))
  }, _noop)
}

export async function createAgent(uid: string, name: string, metadata?: Record<string, unknown>) {
  const ref = await addDoc(collection(db, 'agents'), {
    user_id: uid,
    name,
    status: 'disconnected',
    last_seen: null,
    metadata: metadata ?? {},
    created_at: serverTimestamp(),
  })
  return ref.id
}

export async function createRangeFarmerAgent(uid: string, name: string, coin = 'BTC'): Promise<string> {
  const ref = await addDoc(collection(db, 'agents'), {
    user_id: uid,
    name,
    status: 'connected',
    last_seen: serverTimestamp(),
    agent_type: 'range_farmer',
    hosted: true,
    paper_mode: true,
    coin: coin.toUpperCase(),
    deployment_status: 'active',
    metadata: { agent_type: 'range_farmer', hosted: true, paper_mode: true, platform: 'grid', coin: coin.toUpperCase() },
    created_at: serverTimestamp(),
  })
  return ref.id
}

export async function createCabalAgent(uid: string, cabalChatId: string): Promise<string> {
  const ref = await addDoc(collection(db, 'agents'), {
    user_id: uid,
    name: 'Blue Chip',
    status: 'connected',
    last_seen: serverTimestamp(),
    agent_type: 'cabal_blue_chip',
    hosted: false,
    paper_mode: false,
    deployment_status: 'active',
    metadata: { agent_type: 'cabal_blue_chip', hosted: false, platform: 'cabal' },
    created_at: serverTimestamp(),
  })
  await setDoc(doc(db, 'agents', ref.id, AGENT_PRIVATE_COLLECTION, AGENT_SECRETS_DOC_ID), {
    cabal_chat_id: cabalChatId,
    updated_at: serverTimestamp(),
  })
  return ref.id
}

export function subscribeToRangeFarmerInstance(agentId: string, cb: (state: any) => void) {
  return onSnapshot(doc(db, 'agent_types', 'range_farmer', 'instances', agentId), (snap) => {
    if (snap.exists()) cb({ id: snap.id, ...snap.data() })
  })
}

export async function deleteAgent(agentId: string) {
  const { deleteDoc } = await import('firebase/firestore')
  await deleteDoc(doc(db, 'agents', agentId, AGENT_PRIVATE_COLLECTION, AGENT_SECRETS_DOC_ID))
  await deleteDoc(doc(db, 'agents', agentId))
}

export async function updateAgentStatus(agentId: string, status: string, metadata?: Record<string, unknown>) {
  const data: Record<string, unknown> = { status, last_seen: serverTimestamp() }
  if (metadata) data.metadata = metadata
  await updateDoc(doc(db, 'agents', agentId), data)
}

// /feed_events — activity feed
export function subscribeToMyFeed(uid: string, cb: (events: any[]) => void) {
  const q = query(
    collection(db, 'feed_events'),
    where('user_id', '==', uid),
    orderBy('created_at', 'desc'),
    limit(60)
  )
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({
      id: d.id, ...d.data(),
      created_at: tsToISO(d.data().created_at as any) ?? new Date().toISOString(),
    })))
  })
}

export function subscribeToPublicFeed(uids: string[], cb: (events: any[]) => void) {
  if (uids.length === 0) { cb([]); return () => {} }
  // Firestore 'in' supports max 30 items
  const q = query(
    collection(db, 'feed_events'),
    where('user_id', 'in', uids.slice(0, 30)),
    orderBy('created_at', 'desc'),
    limit(120)
  )
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      created_at: tsToISO(d.data().created_at as any) ?? new Date().toISOString(),
    }))
    cb(rows.filter((row: any) => row.is_public === true).slice(0, 60))
  })
}

// Individual trades subcollection — fine-grained per-fill data
export function subscribeToSlug001Trades(cb: (trades: any[]) => void) {
  const q = query(
    collection(db, 'agents', 'slug-001', 'trades'),
    orderBy('created_at', 'desc'),
    limit(100)
  )
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({
      id: d.id, ...d.data(),
      created_at: tsToISO(d.data().created_at as any) ?? new Date().toISOString(),
    })))
  }, _noop)
}

// Only daily summaries in the feed — filter client-side to avoid composite index requirement
export function subscribeToSlug001Feed(cb: (events: any[]) => void) {
  const q = query(
    collection(db, 'feed_events'),
    where('agent_id', '==', 'slug-001'),
    orderBy('created_at', 'desc'),
    limit(90)
  )
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map((d) => ({
      id: d.id, ...d.data(),
      created_at: tsToISO(d.data().created_at as any) ?? new Date().toISOString(),
    }))
    // Only surface daily summaries — micro fills now live in agents/slug-001/trades subcollection
    cb(all.filter((e: any) => e.type === 'daily_pnl'))
  })
}

// All trade/pnl events across all agents — for global trades view
export function subscribeToAllTrades(cb: (events: any[]) => void) {
  const q = query(
    collection(db, 'feed_events'),
    where('type', 'in', ['pnl', 'trade']),
    orderBy('created_at', 'desc'),
    limit(100)
  )
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({
      id: d.id, ...d.data(),
      created_at: tsToISO(d.data().created_at as any) ?? new Date().toISOString(),
    })))
  })
}

export async function addFeedEvent(data: {
  agent_id: string
  user_id: string
  type: string
  content: string
  payload?: Record<string, unknown>
  is_public?: boolean
}) {
  if (data.is_public && data.agent_id) {
    const agentSnap = await getDoc(doc(db, 'agents', data.agent_id))
    if (agentSnap.exists() && agentSnap.data().broadcast_enabled === false) {
      return null
    }
  }
  await addDoc(collection(db, 'feed_events'), {
    ...data,
    payload: data.payload ?? {},
    is_public: data.is_public ?? false,
    created_at: serverTimestamp(),
  })
}

// /users/{uid}/following — social graph
export function subscribeToFollowing(uid: string, cb: (followingIds: string[]) => void) {
  return onSnapshot(collection(db, 'users', uid, 'following'), (snap) => {
    cb(snap.docs.map((d) => d.id))
  })
}

export async function followUser(myUid: string, targetUid: string) {
  await setDoc(doc(db, 'users', myUid, 'following', targetUid), {
    followed_at: serverTimestamp(),
    target_uid: targetUid,
  })
}

export async function unfollowUser(myUid: string, targetUid: string) {
  const { deleteDoc } = await import('firebase/firestore')
  await deleteDoc(doc(db, 'users', myUid, 'following', targetUid))
}

// /agents/{agentId}/messages — chat
export function subscribeToMessages(agentId: string, cb: (msgs: any[]) => void) {
  const q = query(
    collection(db, 'agents', agentId, 'messages'),
    orderBy('created_at', 'desc'),
    limit(200)
  )
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        created_at: tsToISO(d.data().created_at as any) ?? new Date().toISOString(),
      }))
      cb(rows.reverse())
    },
    (err) => console.warn('[subscribeToMessages]', agentId, err?.message ?? err),
  )
}

export async function addMessage(agentId: string, data: {
  agent_id: string
  user_id: string
  direction: 'inbound' | 'outbound'
  content: string
  metadata?: Record<string, unknown>
}): Promise<string> {
  const ref = await addDoc(collection(db, 'agents', agentId, 'messages'), {
    ...data,
    created_at: serverTimestamp(),
  })
  return ref.id
}

// Search users by username prefix
export async function searchUsers(prefix: string) {
  const q = query(
    collection(db, 'users'),
    where('username', '>=', prefix),
    where('username', '<=', prefix + '\uf8ff'),
    limit(20)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// Publish a user's agent PnL snapshot as a public feed event
export async function publishAgentPnl(
  uid: string,
  agentId: string,
  agentName: string,
  unrealizedPnl: number,
  dailyPnl?: number | null,
) {
  const agentSnap = await getDoc(doc(db, 'agents', agentId))
  if (agentSnap.exists() && agentSnap.data().broadcast_enabled === false) {
    return false
  }
  await addDoc(collection(db, 'feed_events'), {
    user_id: uid,
    agent_id: agentId,
    agent_name: agentName,
    type: 'pnl',
    content: `${agentName} unrealized PnL: ${unrealizedPnl >= 0 ? '+' : ''}$${Math.abs(unrealizedPnl).toFixed(2)}`,
    payload: {
      pnl: unrealizedPnl,
      pct: 0,
      daily_pnl: dailyPnl ?? null,
    },
    is_public: true,
    created_at: serverTimestamp(),
  })
  return true
}

// Get/set pnl_sharing preference stored on the user profile
export async function getPnlSharingPref(uid: string): Promise<'auto' | 'manual' | 'private' | null> {
  const profile = await getProfile(uid)
  return (profile?.pnl_sharing as any) ?? null
}

export async function setPnlSharingPref(uid: string, pref: 'auto' | 'manual' | 'private') {
  await setProfile(uid, { pnl_sharing: pref })
}

// Subscribe to agents for a given user that have live_state data
export function subscribeToUserAgentsPnl(uid: string, cb: (agents: any[]) => void) {
  const q = query(collection(db, 'agents'), where('user_id', '==', uid))
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((a: any) => a.live_state?.unrealizedPnlUsd != null)
    )
  })
}

// Search agents by name prefix
export async function searchAgents(prefix: string) {
  const q = query(
    collection(db, 'agents'),
    where('name', '>=', prefix),
    where('name', '<=', prefix + '\uf8ff'),
    limit(20)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Recent agents (e.g. owner filter in search when agent name is empty) */
export async function getRecentAgents(max = 30) {
  const q = query(collection(db, 'agents'), orderBy('last_seen', 'desc'), limit(max))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function batchGetUsernames(userIds: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(userIds)].filter(Boolean)
  const out: Record<string, string> = {}
  await Promise.all(
    unique.map(async (uid) => {
      const snap = await getDoc(doc(db, 'users', uid))
      if (snap.exists()) {
        const u = snap.data().username
        if (typeof u === 'string' && u.length > 0) out[uid] = u
      }
    })
  )
  return out
}

export async function getUidForUsername(raw: string): Promise<string | null> {
  const lower = raw.toLowerCase()
  const mappingSnap = await getDoc(doc(db, 'usernames', lower))
  if (mappingSnap.exists()) {
    const uid = mappingSnap.data().uid
    return typeof uid === 'string' ? uid : null
  }

  // Fallback for older profiles that have `users/{uid}.username` but no `usernames/{slug}` doc yet.
  const q = query(collection(db, 'users'), where('username', '==', lower), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) return null

  return snap.docs[0].id
}

export async function getPublicProfileByUsername(raw: string): Promise<{
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
} | null> {
  const uid = await getUidForUsername(raw)
  if (!uid) return null
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    id: uid,
    username: (data.username as string) ?? raw.toLowerCase(),
    display_name: (data.display_name as string) ?? (data.displayName as string) ?? null,
    avatar_url: (data.avatar_url as string) ?? (data.avatarUrl as string) ?? null,
    created_at: tsToISO(data.created_at as Timestamp | null) ?? new Date(0).toISOString(),
  }
}

export async function getPublicProfileByUid(uid: string): Promise<{
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
} | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  const data = snap.data()
  const username = typeof data.username === 'string' ? data.username.toLowerCase() : null
  if (!username) return null

  return {
    id: uid,
    username,
    display_name: (data.display_name as string) ?? (data.displayName as string) ?? null,
    avatar_url: (data.avatar_url as string) ?? (data.avatarUrl as string) ?? null,
    created_at: tsToISO(data.created_at as Timestamp | null) ?? new Date(0).toISOString(),
  }
}

export async function listAgentsForUser(uid: string): Promise<Array<{
  id: string
  name: string
  status: string
  last_seen: string | null
  metadata: Record<string, unknown>
}>> {
  const q = query(collection(db, 'agents'), where('user_id', '==', uid))
  const snap = await getDocs(q)
  const rows = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name as string,
      status: (data.status as string) ?? 'disconnected',
      last_seen: tsToISO(data.last_seen as Timestamp | null),
      metadata: (data.metadata as Record<string, unknown>) ?? {},
    }
  })
  rows.sort((a, b) => {
    const ta = a.last_seen ? new Date(a.last_seen).getTime() : 0
    const tb = b.last_seen ? new Date(b.last_seen).getTime() : 0
    return tb - ta
  })
  return rows
}

export async function listPublicFeedEventsForUser(
  uid: string,
  limitCount = 20,
): Promise<Array<{ id: string; type: string; content: string; created_at: string; agent_id: string }>> {
  const q = query(
    collection(db, 'feed_events'),
    where('user_id', '==', uid),
    orderBy('created_at', 'desc'),
    limit(Math.max(limitCount * 3, 60))
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => {
      const data = d.data()
      return {
        id: d.id,
        type: String(data.type ?? ''),
        content: String(data.content ?? ''),
        created_at: tsToISO(data.created_at as Timestamp | null) ?? new Date().toISOString(),
        agent_id: String(data.agent_id ?? ''),
        is_public: Boolean(data.is_public),
      }
    })
    .filter((row) => row.is_public)
    .slice(0, limitCount)
    .map(({ is_public: _isPublic, ...row }) => row)
}

/** Users who follow targetUid (subcollection doc id = followee uid) */
export async function countFollowersOf(targetUid: string): Promise<number> {
  // Avoid collectionGroup index requirements by scanning user docs and checking the
  // per-user following document directly. This is less efficient but reliable.
  const usersSnap = await getDocs(collection(db, 'users'))
  const followerChecks = await Promise.all(
    usersSnap.docs.map(async (userDoc) => {
      const followSnap = await getDoc(doc(db, 'users', userDoc.id, 'following', targetUid))
      return followSnap.exists()
    })
  )
  return followerChecks.filter(Boolean).length
}

export async function countFollowingOf(uid: string): Promise<number> {
  const snap = await getDocs(collection(db, 'users', uid, 'following'))
  return snap.size
}

export async function isFollowingUser(myUid: string, targetUid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', myUid, 'following', targetUid))
  return snap.exists()
}

export interface PublicUserListItem {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

async function getPublicUsersByIds(uids: string[]): Promise<PublicUserListItem[]> {
  const uniqueUids = [...new Set(uids.filter(Boolean))]
  const rows = await Promise.all(uniqueUids.map(async (uid) => {
    const profile = await getPublicProfileByUid(uid)
    if (!profile) return null
    return {
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    }
  }))
  return rows.filter((row): row is PublicUserListItem => row !== null)
}

export async function listFollowingUsers(uid: string): Promise<PublicUserListItem[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'following'))
  const orderedIds = snap.docs
    .sort((a, b) => {
      const ta = tsToISO(a.data().created_at as Timestamp | null)
      const tb = tsToISO(b.data().created_at as Timestamp | null)
      return new Date(tb ?? 0).getTime() - new Date(ta ?? 0).getTime()
    })
    .map((docSnap) => docSnap.id)
  return getPublicUsersByIds(orderedIds)
}

export async function listFollowersOf(targetUid: string): Promise<PublicUserListItem[]> {
  const usersSnap = await getDocs(collection(db, 'users'))
  const followerIds = await Promise.all(
    usersSnap.docs.map(async (userDoc) => {
      const followSnap = await getDoc(doc(db, 'users', userDoc.id, 'following', targetUid))
      if (!followSnap.exists()) return null
      return {
        uid: userDoc.id,
        created_at: tsToISO(followSnap.data().created_at as Timestamp | null),
      }
    })
  )

  const orderedIds = followerIds
    .filter((row): row is { uid: string; created_at: string | null } => row !== null)
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    .map((row) => row.uid)

  return getPublicUsersByIds(orderedIds)
}

function getAgentTypeLabel(agent: Record<string, any>): string {
  const type = String(agent.agent_type ?? agent.metadata?.agent_type ?? '').toLowerCase()
  if (type === 'range_farmer') return 'Range Farmer'
  if (type === 'market_advisor') return 'Market Advisor'
  if (type === 'cabal_trading_boy') return 'Trading Boy'
  if (type === 'cabal_blue_chip') return 'Blue Chip'
  if (type === 'claude_managed') return 'Claude Agent'
  return 'Slug'
}

function getAgentDescription(agent: Record<string, any>): string {
  const metadata = (agent.metadata as Record<string, any> | undefined) ?? {}
  const type = String(agent.agent_type ?? metadata.agent_type ?? '').toLowerCase()

  if (type === 'range_farmer') {
    const coin = String(agent.coin ?? metadata.coin ?? 'BTC').toUpperCase()
    return `Runs a dynamic paper grid on ${coin}, farming volatility with laddered buys and sells around a moving center.`
  }
  if (type === 'market_advisor') {
    return 'Reviews portfolio context, answers market questions, and gives chat-based guidance grounded in the user’s current positions.'
  }
  if (type === 'cabal_trading_boy') {
    return 'Monitors live setups, manages entries and exits, and publishes performance updates as market structure changes.'
  }
  if (type === 'cabal_blue_chip') {
    return 'Acts like a connected operator slug for commentary, signals, and shared agent updates inside the social feed.'
  }
  if (type === 'claude_managed') {
    const strategy = String(agent.strategy ?? metadata.strategy ?? 'Grid')
    const skills = (agent.skills ?? metadata.skills ?? []) as string[]
    const skillStr = skills.length > 0 ? ` Equipped with: ${skills.map((s: string) => s.replace('_', ' ')).join(', ')}.` : ''
    return `A Claude-powered ${strategy} trading agent running 24/7 with persistent memory.${skillStr}`
  }
  return 'A public slug profile with live status, recent updates, and trackable performance.'
}

function getAgentStrategyLabel(agent: Record<string, any>): string {
  const metadata = (agent.metadata as Record<string, any> | undefined) ?? {}
  const type = String(agent.agent_type ?? metadata.agent_type ?? '').toLowerCase()
  if (type === 'range_farmer') return 'Dynamic Grid'
  if (type === 'market_advisor') return 'Portfolio Copilot'
  if (type === 'cabal_trading_boy') return 'Autonomous Momentum'
  if (type === 'cabal_blue_chip') return 'Social Signal'
  if (type === 'claude_managed') return String(agent.strategy ?? metadata.strategy ?? 'Claude Strategy')
  return 'General Slug'
}

export async function getPublicAgentProfile(agentId: string): Promise<{
  id: string
  user_id: string
  owner_username: string
  owner_display_name: string | null
  name: string
  status: string
  last_seen: string | null
  agent_type: string | null
  strategy_label: string
  description: string
  broadcast_enabled: boolean
  live_state: Record<string, any> | null
  metadata: Record<string, unknown>
} | null> {
  const snap = await getDoc(doc(db, 'agents', agentId))
  if (!snap.exists()) return null

  const data = snap.data()
  const userId = String(data.user_id ?? '')
  if (!userId) return null

  const owner = await getPublicProfileByUid(userId)
  if (!owner) return null

  return {
    id: snap.id,
    user_id: userId,
    owner_username: owner.username,
    owner_display_name: owner.display_name,
    name: String(data.name ?? 'Slug'),
    status: String(data.status ?? 'disconnected'),
    last_seen: tsToISO(data.last_seen as Timestamp | null),
    agent_type: (data.agent_type as string) ?? ((data.metadata as Record<string, any> | undefined)?.agent_type as string) ?? null,
    strategy_label: getAgentStrategyLabel(data),
    description: getAgentDescription(data),
    broadcast_enabled: data.broadcast_enabled !== false,
    live_state: (data.live_state as Record<string, any>) ?? null,
    metadata: (data.metadata as Record<string, unknown>) ?? {},
  }
}

export async function listPublicFeedEventsForAgent(
  agentId: string,
  limitCount = 20,
): Promise<Array<{ id: string; type: string; content: string; created_at: string; agent_id: string; agent_name: string; user_id: string }>> {
  const q = query(
    collection(db, 'feed_events'),
    orderBy('created_at', 'desc'),
    limit(Math.max(limitCount * 6, 90))
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => {
      const data = d.data()
      return {
        id: d.id,
        type: String(data.type ?? ''),
        content: String(data.content ?? ''),
        created_at: tsToISO(data.created_at as Timestamp | null) ?? new Date().toISOString(),
        agent_id: String(data.agent_id ?? ''),
        agent_name: String(data.agent_name ?? ''),
        user_id: String(data.user_id ?? ''),
        is_public: Boolean(data.is_public),
      }
    })
    .filter((row) => row.is_public && row.agent_id === agentId)
    .slice(0, limitCount)
    .map(({ is_public: _isPublic, ...row }) => row)
}

export async function setAgentBroadcastEnabled(agentId: string, enabled: boolean) {
  await updateDoc(doc(db, 'agents', agentId), {
    broadcast_enabled: enabled,
    updated_at: serverTimestamp(),
  })
}

export async function isTrackingAgent(uid: string, agentId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', uid, 'tracked_agents', agentId))
  return snap.exists()
}

export async function trackAgent(uid: string, agentId: string, ownerUid?: string | null) {
  await setDoc(doc(db, 'users', uid, 'tracked_agents', agentId), {
    agent_id: agentId,
    owner_uid: ownerUid ?? null,
    tracked_at: serverTimestamp(),
  })
}

export async function untrackAgent(uid: string, agentId: string) {
  const { deleteDoc } = await import('firebase/firestore')
  await deleteDoc(doc(db, 'users', uid, 'tracked_agents', agentId))
}

export function subscribeToTrackedAgents(uid: string, cb: (agentIds: string[]) => void) {
  return onSnapshot(collection(db, 'users', uid, 'tracked_agents'), (snap) => {
    cb(snap.docs.map((d) => d.id))
  })
}

export function subscribeToTrackedAgentDocs(
  agentIds: string[],
  cb: (agents: Array<{ id: string; name: string; status: string; last_seen: string | null; owner_username: string | null; live_state: Record<string, any> | null }>) => void,
) {
  if (agentIds.length === 0) { cb([]); return () => {} }
  const results = new Map<string, any>()
  const unsubs = agentIds.slice(0, 20).map((agentId) =>
    onSnapshot(doc(db, 'agents', agentId), (snap) => {
      if (snap.exists()) {
        const d = snap.data()
        results.set(agentId, {
          id: snap.id,
          name: String(d.name ?? 'Agent'),
          status: String(d.status ?? 'disconnected'),
          last_seen: tsToISO(d.last_seen as Timestamp | null),
          owner_username: null, // resolved separately if needed
          live_state: (d.live_state as Record<string, any>) ?? null,
        })
      }
      cb(Array.from(results.values()))
    })
  )
  return () => unsubs.forEach((u) => u())
}

export function subscribeToTrackedAgentFeed(agentIds: string[], cb: (events: any[]) => void) {
  if (agentIds.length === 0) { cb([]); return () => {} }
  const tracked = new Set(agentIds.slice(0, 50))
  const q = query(collection(db, 'feed_events'), orderBy('created_at', 'desc'), limit(180))
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      created_at: tsToISO(d.data().created_at as any) ?? new Date().toISOString(),
    }))
    cb(rows.filter((row: any) => row.is_public === true && tracked.has(String(row.agent_id ?? ''))).slice(0, 60))
  })
}

export async function listTrackedAgentProfiles(uid: string): Promise<Array<{
  id: string
  name: string
  owner_username: string
  description: string
  status: string
  last_seen: string | null
}>> {
  const snap = await getDocs(collection(db, 'users', uid, 'tracked_agents'))
  const rows = await Promise.all(snap.docs.map(async (trackedDoc) => {
    const profile = await getPublicAgentProfile(trackedDoc.id)
    if (!profile) return null
    return {
      id: profile.id,
      name: profile.name,
      owner_username: profile.owner_username,
      description: profile.description,
      status: profile.status,
      last_seen: profile.last_seen,
    }
  }))
  return rows.filter((row): row is NonNullable<typeof row> => row !== null)
}

function directThreadId(a: string, b: string) {
  return [a, b].sort().join('__')
}

export function getDirectThreadId(uidA: string, uidB: string) {
  return directThreadId(uidA, uidB)
}

export async function createOrGetDirectThread(uidA: string, uidB: string): Promise<string> {
  if (!uidA || !uidB || uidA === uidB) {
    throw new Error('Cannot create a direct thread with yourself')
  }
  const threadId = directThreadId(uidA, uidB)
  await setDoc(doc(db, 'direct_threads', threadId), {
    members: [uidA, uidB].sort(),
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    last_message_text: '',
    last_message_at: null,
  }, { merge: true })
  return threadId
}

export async function markDirectThreadRead(threadId: string, uid: string) {
  if (!threadId || !uid) return
  await updateDoc(doc(db, 'direct_threads', threadId), {
    [`last_read_at_by_uid.${uid}`]: serverTimestamp(),
  })
}

export function subscribeToDirectThreads(uid: string, cb: (threads: any[]) => void) {
  const q = query(collection(db, 'direct_threads'), where('members', 'array-contains', uid))
  return onSnapshot(q, async (snap) => {
    const rows = await Promise.all(snap.docs.map(async (d) => {
      const data = d.data()
      const members = (data.members as string[] | undefined) ?? []
      const otherUid = members.find((member) => member && member !== uid) ?? null
      if (!otherUid || members.length < 2) return null
      const otherProfile = await getPublicProfileByUid(otherUid)
      if (!otherProfile?.id || otherProfile.id === uid) return null
      const lastReadMap = (data.last_read_at_by_uid as Record<string, Timestamp | string | null> | undefined) ?? {}
      const lastReadAt = tsToISO(lastReadMap[uid])
      const lastMessageAt = tsToISO(data.last_message_at as Timestamp | null)
      const lastMessageSenderUid = typeof data.last_message_sender_uid === 'string' ? data.last_message_sender_uid : null
      return {
        id: d.id,
        ...data,
        updated_at: tsToISO(data.updated_at as Timestamp | null),
        last_message_at: lastMessageAt,
        last_read_at: lastReadAt,
        unread: !!lastMessageAt &&
          lastMessageSenderUid !== uid &&
          tsToMillis(lastMessageAt) > tsToMillis(lastReadAt),
        other_user: otherProfile,
      }
    }))
    const filteredRows = rows.filter(Boolean) as any[]
    filteredRows.sort((a, b) => new Date(b.last_message_at ?? b.updated_at ?? 0).getTime() - new Date(a.last_message_at ?? a.updated_at ?? 0).getTime())
    cb(filteredRows)
  }, _noop)
}

export function subscribeToDirectMessages(threadId: string, cb: (messages: any[]) => void) {
  const q = query(
    collection(db, 'direct_threads', threadId, 'messages'),
    orderBy('created_at', 'desc'),
    limit(200)
  )
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      created_at: tsToISO(d.data().created_at as any) ?? new Date().toISOString(),
    }))
    cb(rows.reverse())
  }, _noop)
}

export async function sendDirectMessage(threadId: string, senderUid: string, content: string) {
  const trimmed = content.trim()
  if (!trimmed) return
  const memberIds = threadId.split('__').filter(Boolean)
  if (memberIds.length === 2 && memberIds[0] === memberIds[1]) {
    throw new Error('Cannot send a direct message to yourself')
  }
  if (memberIds.length === 2) {
    const otherUid = memberIds.find((uid) => uid !== senderUid)
    if (otherUid) {
      await createOrGetDirectThread(senderUid, otherUid)
    }
  }
  await addDoc(collection(db, 'direct_threads', threadId, 'messages'), {
    sender_uid: senderUid,
    content: trimmed,
    created_at: serverTimestamp(),
  })
  await setDoc(doc(db, 'direct_threads', threadId), {
    updated_at: serverTimestamp(),
    last_message_text: trimmed,
    last_message_at: serverTimestamp(),
    last_message_sender_uid: senderUid,
    [`last_read_at_by_uid.${senderUid}`]: serverTimestamp(),
  }, { merge: true })
}

export async function createClaudeAgent(
  uid: string,
  name: string,
  claudeAgentId: string,
  claudeEnvId: string,
  strategy?: string,
): Promise<string> {
  const ref = await addDoc(collection(db, 'agents'), {
    user_id: uid,
    name,
    status: 'connected',
    last_seen: serverTimestamp(),
    agent_type: 'claude_managed',
    strategy: strategy ?? 'Grid Trader',
    // Pointers into Anthropic — all config/skills/sessions live there
    claude_agent_id: claudeAgentId,
    claude_env_id: claudeEnvId,
    created_at: serverTimestamp(),
  })
  return ref.id
}

export async function createMarketAdvisorAgent(uid: string, name: string, geminiApiKey: string): Promise<string> {
  const ref = await addDoc(collection(db, 'agents'), {
    user_id: uid,
    name,
    status: 'connected',
    last_seen: serverTimestamp(),
    agent_type: 'market_advisor',
    live_state: null,
    metadata: { agent_type: 'market_advisor' },
    created_at: serverTimestamp(),
  })
  await setDoc(doc(db, 'agents', ref.id, AGENT_PRIVATE_COLLECTION, AGENT_SECRETS_DOC_ID), {
    gemini_api_key: geminiApiKey,
    updated_at: serverTimestamp(),
  })
  return ref.id
}

export async function createTradingBoyAgent(
  uid: string,
  name: string,
  tbAgentId: string,
  tbTraderId: string,
  tbApiKey: string,
): Promise<string> {
  const ref = await addDoc(collection(db, 'agents'), {
    user_id: uid,
    name,
    status: 'connecting',
    last_seen: serverTimestamp(),
    agent_type: 'cabal_trading_boy',
    tb_agent_id: tbAgentId,
    tb_trader_id: tbTraderId,
    live_state: null,
    last_synced: null,
    created_at: serverTimestamp(),
  })
  await setDoc(doc(db, 'agents', ref.id, AGENT_PRIVATE_COLLECTION, AGENT_SECRETS_DOC_ID), {
    tb_api_key: tbApiKey,
    updated_at: serverTimestamp(),
  })
  return ref.id
}

export function subscribeToDecisions(agentId: string, cb: (decisions: any[]) => void) {
  const q = query(
    collection(db, 'agents', agentId, 'decisions'),
    orderBy('eventTime', 'desc'),
    limit(50)
  )
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }, _noop)
}

// ── Paper agent (Slug #001) ───────────────────────────────────────────────────

export const SLUG001_ID = 'slug-001'

export interface PaperAgentState {
  name: string
  strategy: string
  status: 'active' | 'paused' | 'cooldown' | 'no-trade'
  regime: string
  btc_price: number
  session_pnl: number
  total_fills: number
  grid_center: number
  grid_levels: number
  grid_spacing_pct: number
  high_24h: number
  low_24h: number
  price_change_24h_pct: number
  positions: PaperPosition[]
  pnl_history: number[]
  last_updated: string
  paper_mode: true
}

export interface PaperPosition {
  side: 'buy' | 'sell'
  fillPrice: number
  qty: number
  currentPrice: number
  openedAt: string
}

const _noop = () => {}

export function subscribeToSlug001(cb: (state: PaperAgentState | null) => void) {
  return onSnapshot(doc(db, 'agents', SLUG001_ID), (snap) => {
    cb(snap.exists() ? (snap.data() as PaperAgentState) : null)
  }, _noop)
}
