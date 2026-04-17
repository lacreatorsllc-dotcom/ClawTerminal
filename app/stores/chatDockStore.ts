import { create } from 'zustand'

interface ChatDockState {
  isOpen: boolean
  activeThreadId: string | null
  activeOtherUid: string | null
  activeUsername: string | null
  openConversation: (params: { threadId: string; otherUid?: string | null; username?: string | null }) => void
  closeDock: () => void
  toggleDock: () => void
  setActiveThread: (params: { threadId: string | null; otherUid?: string | null; username?: string | null }) => void
}

export const useChatDockStore = create<ChatDockState>((set) => ({
  isOpen: false,
  activeThreadId: null,
  activeOtherUid: null,
  activeUsername: null,
  openConversation: ({ threadId, otherUid, username }) => set({
    isOpen: true,
    activeThreadId: threadId,
    activeOtherUid: otherUid ?? null,
    activeUsername: username ?? null,
  }),
  closeDock: () => set({ isOpen: false }),
  toggleDock: () => set((state) => ({ isOpen: !state.isOpen })),
  setActiveThread: ({ threadId, otherUid, username }) => set({
    activeThreadId: threadId,
    activeOtherUid: otherUid ?? null,
    activeUsername: username ?? null,
  }),
}))
