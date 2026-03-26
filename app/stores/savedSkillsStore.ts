import { create } from 'zustand'

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

export const useSavedSkillsStore = create<SavedSkillsState>((set, get) => ({
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
}))
