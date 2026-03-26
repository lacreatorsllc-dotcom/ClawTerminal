import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as FileSystem from 'expo-file-system/legacy'

export type SavedSkillSource = 'anthropic' | 'clawhub' | 'skillssh'

export interface SavedSkill {
  id: string
  name: string
  source: SavedSkillSource
  category?: string
  savedAt: number
}

interface SavedSkillsState {
  saved: SavedSkill[]
  save: (skill: SavedSkill) => void
  unsave: (id: string) => void
  isSaved: (id: string) => boolean
}

const FILE_PATH = (FileSystem.documentDirectory ?? '') + 'slugs-saved-skills.json'

const fileStorage = {
  getItem: async (_name: string): Promise<string | null> => {
    try {
      const info = await FileSystem.getInfoAsync(FILE_PATH)
      if (!info.exists) return null
      return await FileSystem.readAsStringAsync(FILE_PATH)
    } catch { return null }
  },
  setItem: async (_name: string, value: string): Promise<void> => {
    try {
      await FileSystem.writeAsStringAsync(FILE_PATH, value)
    } catch {}
  },
  removeItem: async (_name: string): Promise<void> => {
    try {
      const info = await FileSystem.getInfoAsync(FILE_PATH)
      if (info.exists) await FileSystem.deleteAsync(FILE_PATH)
    } catch {}
  },
}

export const useSavedSkillsStore = create<SavedSkillsState>()(
  persist(
    (set, get) => ({
      saved: [],
      save: (skill) =>
        set((state) => ({
          saved: state.saved.some((s) => s.id === skill.id)
            ? state.saved
            : [{ ...skill, savedAt: Date.now() }, ...state.saved],
        })),
      unsave: (id) =>
        set((state) => ({ saved: state.saved.filter((s) => s.id !== id) })),
      isSaved: (id) => get().saved.some((s) => s.id === id),
    }),
    {
      name: 'slugs-saved-skills',
      storage: createJSONStorage(() => fileStorage),
    }
  )
)
