import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Platform } from 'react-native'

export interface OKXCredentials {
  api_key: string
  secret_key: string
  passphrase: string
  demo_mode: string
}

interface OKXCredentialsState {
  credentials: OKXCredentials | null
  save: (creds: OKXCredentials) => void
  clear: () => void
}

function makeStorage() {
  if (Platform.OS === 'web') {
    return createJSONStorage(() => localStorage)
  }
  const FileSystem = require('expo-file-system/legacy')
  const FILE_PATH = (FileSystem.documentDirectory ?? '') + 'slugs-okx-credentials.json'
  return createJSONStorage(() => ({
    getItem: async (_name: string): Promise<string | null> => {
      try {
        const info = await FileSystem.getInfoAsync(FILE_PATH)
        if (!info.exists) return null
        return await FileSystem.readAsStringAsync(FILE_PATH)
      } catch { return null }
    },
    setItem: async (_name: string, value: string): Promise<void> => {
      try { await FileSystem.writeAsStringAsync(FILE_PATH, value) } catch {}
    },
    removeItem: async (_name: string): Promise<void> => {
      try {
        const info = await FileSystem.getInfoAsync(FILE_PATH)
        if (info.exists) await FileSystem.deleteAsync(FILE_PATH)
      } catch {}
    },
  }))
}

export const useOKXCredentialsStore = create<OKXCredentialsState>()(
  persist(
    (set) => ({
      credentials: null,
      save: (creds) => set({ credentials: creds }),
      clear: () => set({ credentials: null }),
    }),
    { name: 'slugs-okx-credentials', storage: makeStorage() }
  )
)
