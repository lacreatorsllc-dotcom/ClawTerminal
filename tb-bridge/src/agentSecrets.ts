import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore'
import { db } from './firebase'

export const AGENT_PRIVATE_COLLECTION = 'private'
export const AGENT_SECRETS_DOC_ID = 'secrets'

/** Fields that must never live on the public agent document (client-readable). */
const SECRET_FIELDS = ['gemini_api_key', 'tb_api_key', 'openai_api_key', 'cabal_chat_id'] as const

export async function fetchAgentSecrets(agentId: string): Promise<Record<string, unknown>> {
  const snap = await db
    .collection('agents')
    .doc(agentId)
    .collection(AGENT_PRIVATE_COLLECTION)
    .doc(AGENT_SECRETS_DOC_ID)
    .get()
  return snap.exists ? { ...(snap.data() as Record<string, unknown>) } : {}
}

/** Merge private secrets over public agent data; legacy top-level secrets still supported. */
export function mergeSecretsIntoAgentData(
  publicData: DocumentData,
  secrets: Record<string, unknown>,
): DocumentData {
  const out: DocumentData = { ...publicData }
  for (const k of SECRET_FIELDS) {
    const v = secrets[k] ?? publicData[k]
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  return out
}

export async function getAgentDataWithSecrets(snapshot: DocumentSnapshot): Promise<DocumentData> {
  const publicData = snapshot.data()
  if (!publicData) return {}
  const secrets = await fetchAgentSecrets(snapshot.id)
  return mergeSecretsIntoAgentData(publicData, secrets)
}
