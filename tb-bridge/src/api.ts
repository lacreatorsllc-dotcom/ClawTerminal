import fetch from 'node-fetch'
import type { TbAgent, TbAgentResponse, TbDecision, TbDecisionsResponse, TbAgentsListResponse } from './types'

const BASE = 'https://api.cabal.ventures'

function headers(apiKey: string): Record<string, string> {
  return {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  }
}

async function checkResponse(res: Awaited<ReturnType<typeof fetch>>, label: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${label} failed: ${res.status} ${res.statusText} — ${body}`)
  }
}

export async function listAgents(apiKey: string): Promise<TbAgent[]> {
  const res = await fetch(`${BASE}/api/v1/agents`, { headers: headers(apiKey) })
  await checkResponse(res, 'listAgents')
  const data = await res.json() as TbAgentsListResponse
  return data.agents
}

export async function fetchAgentStatus(apiKey: string, agentId: string): Promise<TbAgentResponse> {
  const res = await fetch(`${BASE}/api/v1/agents/${agentId}`, { headers: headers(apiKey) })
  await checkResponse(res, 'fetchAgentStatus')
  return res.json() as Promise<TbAgentResponse>
}

export async function fetchDecisions(apiKey: string, traderId: string, limit = 20): Promise<TbDecision[]> {
  const url = `${BASE}/api/v1/decisions?traderId=${encodeURIComponent(traderId)}&limit=${limit}`
  const res = await fetch(url, { headers: headers(apiKey) })
  await checkResponse(res, 'fetchDecisions')
  const data = await res.json() as TbDecisionsResponse
  return data.decisions
}

export async function pauseAgent(apiKey: string, agentId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/agents/${agentId}/pause`, {
    method: 'POST',
    headers: headers(apiKey),
  })
  await checkResponse(res, 'pauseAgent')
}

export async function resumeAgent(apiKey: string, agentId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/agents/${agentId}/resume`, {
    method: 'POST',
    headers: headers(apiKey),
  })
  await checkResponse(res, 'resumeAgent')
}
