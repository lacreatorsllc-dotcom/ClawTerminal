import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type SavedSkillSource = 'anthropic' | 'clawhub' | 'skillssh'

export interface SavedSkill {
  id: string           // skill id or slug
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
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)
