// In-memory cache shared between poller and chat listener
// Avoids Firestore reads in the chat handler for data the poller just fetched

interface AgentSnapshot {
  name: string
  liveState: any
  liveAdmin: any
  watchlist: string[]
  openaiApiKey?: string
  updatedAt: number
}

const cache = new Map<string, AgentSnapshot>()

export function setCached(firestoreId: string, snap: Omit<AgentSnapshot, 'updatedAt'>): void {
  cache.set(firestoreId, { ...snap, updatedAt: Date.now() })
}

export function getCached(firestoreId: string): AgentSnapshot | null {
  return cache.get(firestoreId) ?? null
}
