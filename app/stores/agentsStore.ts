import { create } from 'zustand'
import type { Agent, AgentStatus } from '../lib/types'

interface AgentsState {
  agents: Agent[]
  activeAgentId: string | null
  loading: boolean
  setAgents: (agents: Agent[]) => void
  upsertAgent: (agent: Agent) => void
  setActiveAgent: (id: string | null) => void
  setLoading: (loading: boolean) => void
  getConnectionStatus: (agentId: string) => AgentStatus
}

function deriveStatus(status: string | null, lastSeen: string | null): AgentStatus {
  if (status && ['connected', 'connecting', 'stale', 'error', 'disconnected'].includes(status)) {
    return status as AgentStatus
  }
  if (!lastSeen) return 'disconnected'
  const delta = Date.now() - new Date(lastSeen).getTime()
  if (delta < 60_000) return 'connected'
  if (delta < 300_000) return 'stale'
  return 'disconnected'
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
  activeAgentId: null,
  loading: true,
  setAgents: (agents) => set({ agents }),
  upsertAgent: (agent) =>
    set((state) => {
      const idx = state.agents.findIndex((a) => a.id === agent.id)
      if (idx >= 0) {
        const updated = [...state.agents]
        updated[idx] = agent
        return { agents: updated }
      }
      return { agents: [...state.agents, agent] }
    }),
  setActiveAgent: (activeAgentId) => set({ activeAgentId }),
  setLoading: (loading) => set({ loading }),
  getConnectionStatus: (agentId) => {
    const agent = get().agents.find((a) => a.id === agentId)
    if (!agent) return 'disconnected'
    return deriveStatus(agent.status, agent.last_seen)
  },
}))
