import { create } from 'zustand'
import type { Skill, AgentSkill } from '../lib/types'

interface SkillsState {
  skills: Skill[]
  agentSkills: Record<string, AgentSkill[]>
  categoryFilter: string | null
  setSkills: (skills: Skill[]) => void
  setAgentSkills: (agentId: string, skills: AgentSkill[]) => void
  setCategoryFilter: (category: string | null) => void
}

export const useSkillsStore = create<SkillsState>((set) => ({
  skills: [],
  agentSkills: {},
  categoryFilter: null,
  setSkills: (skills) => set({ skills }),
  setAgentSkills: (agentId, skills) =>
    set((state) => ({ agentSkills: { ...state.agentSkills, [agentId]: skills } })),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
}))
