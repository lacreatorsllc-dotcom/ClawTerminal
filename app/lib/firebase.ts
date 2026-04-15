// Firebase — single source of truth for all app data
// Auth + Firestore replacing Supabase

import { initializeApp, getApps } from 'firebase/app'
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
  documentId,
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

// initializeAuth must only be called once per app instance; use getAuth on re-renders/hot reload
export const auth = isFirstInit
  ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
  : getAuth(app)

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

// Username uniqueness check via /usernames/{username} → { uid }
export async function isUsernameTaken(username: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'usernames', username.toLowerCase()))
  return snap.exists()
}

export async function claimUsername(uid: string, username: string) {
  const lower = username.toLowerCase()
  await setDoc(doc(db, 'usernames', lower), { uid })
  await setProfile(uid, { username: lower })
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
    where('is_public', '==', true),
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
  await setDoc(doc(db, 'users', myUid, 'following', targetUid), { followed_at: serverTimestamp() })
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
  const snap = await getDoc(doc(db, 'usernames', raw.toLowerCase()))
  if (!snap.exists()) return null
  const uid = snap.data().uid
  return typeof uid === 'string' ? uid : null
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
    where('is_public', '==', true),
    orderBy('created_at', 'desc'),
    limit(limitCount)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      type: String(data.type ?? ''),
      content: String(data.content ?? ''),
      created_at: tsToISO(data.created_at as Timestamp | null) ?? new Date().toISOString(),
      agent_id: String(data.agent_id ?? ''),
    }
  })
}

/** Users who follow targetUid (subcollection doc id = followee uid) */
export async function countFollowersOf(targetUid: string): Promise<number> {
  const q = query(collectionGroup(db, 'following'), where(documentId(), '==', targetUid))
  const snap = await getDocs(q)
  return snap.size
}

export async function countFollowingOf(uid: string): Promise<number> {
  const snap = await getDocs(collection(db, 'users', uid, 'following'))
  return snap.size
}

export async function isFollowingUser(myUid: string, targetUid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', myUid, 'following', targetUid))
  return snap.exists()
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
