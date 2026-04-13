// Trading-boy API type definitions

export interface TbAgent {
  id: string
  traderId: string
  name: string
  autonomyLevel: string
  status: string
  watchlist: string[]
  tickCount: number
  errorCount: number
  lastTickAt: string
  nextScanAt: string
}

export interface TbAdminState {
  paused: boolean
  killed: boolean
  override: string | null
}

export interface TbStateInner {
  state: string
  openPositions: any[]
  dailyTradeCount: number
  dailyPnlUsd: number
  activeConditionalSetups: number
  currentAnalysis: any | null
  pendingDecision: any | null
}

export interface TbLiveState {
  admin: TbAdminState
  state: TbStateInner
}

export interface TbAgentResponse {
  agent: TbAgent
  live: TbLiveState
}

export interface TbDecision {
  id: string
  traderId: string
  eventTime: string
  decisionType: string
  actor: string
  tokenSymbol: string
  actionType: string
  details: string
  confidence: number
  direction: string | null
  entryPrice: number | null
  exitPrice: number | null
  emotionalTag: string
  thesisAccuracy: string
  hash: string
  previousHash: string
}

export interface TbDecisionsResponse {
  count: number
  limit: number
  offset: number
  decisions: TbDecision[]
}

export interface TbAgentsListResponse {
  agents: TbAgent[]
}
