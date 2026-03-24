import { create } from 'zustand'

interface UIState {
  connectModalVisible: boolean
  toastMessage: string | null
  setConnectModalVisible: (visible: boolean) => void
  showToast: (message: string) => void
  clearToast: () => void
}

export const useUIStore = create<UIState>((set) => ({
  connectModalVisible: false,
  toastMessage: null,
  setConnectModalVisible: (connectModalVisible) => set({ connectModalVisible }),
  showToast: (toastMessage) => {
    set({ toastMessage })
    setTimeout(() => set({ toastMessage: null }), 3000)
  },
  clearToast: () => set({ toastMessage: null }),
}))
