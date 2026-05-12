// SLUGS — TypeScript types matching Supabase schema
// Keep in sync with supabase/migrations/001_schema.sql

// ─────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────

export type AgentStatus = 'disconnected' | 'connecting' | 'connected' | 'stale' | 'error'
export type MessageDirection = 'inbound' | 'outbound'
export type AgentSkillStatus = 'active' | 'pending' | 'error'

export interface Agent {
  id: string
  user_id: string
  name: string
  status: AgentStatus
  last_seen: string | null
  metadata: Record<string, unknown>
  created_at: string
  // Optional wallet/mode fields added via Firestore
  wallet_address?: string | null
  wallet_mode?: string | null
  wallet_network?: string | null
  paper_mode?: boolean | null
}

export interface Message {
  id: string
  agent_id: string
  user_id: string
  direction: MessageDirection
  content: string
  created_at: string
  input_tokens?: number | null
  output_tokens?: number | null
  metadata?: { attachments?: string[]; video_url?: string | null } | null
}

export interface Skill {
  id: string
  name: string
  description: string
  category: string | null
  version: string
  config_schema: SkillConfigSchema
  created_at: string
}

export interface SkillConfigField {
  key: string
  label: string
  type: 'string' | 'secret' | 'number' | 'boolean' | 'select'
  required: boolean
  default?: unknown
  hint?: string
  options?: string[]  // for type: 'select'
}

export interface SkillConfigSchema {
  fields: SkillConfigField[]
}

export interface AgentSkill {
  id: string
  agent_id: string
  skill_id: string
  config: Record<string, unknown>
  status: AgentSkillStatus
  assigned_at: string
}

// ─────────────────────────────────────────────
// Supabase typed client (Database generic)
// ─────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      agents: {
        Row: Agent
        Insert: Omit<Agent, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Agent, 'id'>>
        Relationships: []
      }
      messages: {
        Row: Message
        Insert: Omit<Message, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Pick<Message, 'content'>>
        Relationships: []
      }
      skills: {
        Row: Skill
        Insert: Omit<Skill, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Skill, 'id'>>
        Relationships: []
      }
      agent_skills: {
        Row: AgentSkill
        Insert: Omit<AgentSkill, 'id' | 'assigned_at'> & { id?: string; assigned_at?: string; config?: Record<string, unknown> }
        Update: Partial<Pick<AgentSkill, 'config' | 'status'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}

// ─────────────────────────────────────────────
// Realtime payload types
// ─────────────────────────────────────────────

export interface BroadcastMessagePayload {
  direction: MessageDirection
  content: string
  ts: number
}

export interface ConnectorPresenceState {
  agent_id: string
  connector_version: string
  ts: number
}
