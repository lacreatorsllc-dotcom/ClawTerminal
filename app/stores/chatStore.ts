import { create } from 'zustand'
import type { Message } from '../lib/types'

interface ChatState {
  messagesByAgent: Record<string, Message[]>
  setMessages: (agentId: string, messages: Message[]) => void
  addMessage: (agentId: string, message: Message) => void
}

export const useChatStore = create<ChatState>((set) => ({
  messagesByAgent: {},
  setMessages: (agentId, messages) =>
    set((state) => ({ messagesByAgent: { ...state.messagesByAgent, [agentId]: messages } })),
  addMessage: (agentId, message) =>
    set((state) => {
      const existing = state.messagesByAgent[agentId] ?? []
      if (existing.some((m) => m.id === message.id)) return state
      return {
        messagesByAgent: {
          ...state.messagesByAgent,
          [agentId]: [...existing, message],
        },
      }
    }),
}))
