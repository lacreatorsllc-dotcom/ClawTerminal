import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (serviceAccount) {
    initializeApp({ credential: cert(JSON.parse(serviceAccount)) })
  } else {
    // Local dev: uses GOOGLE_APPLICATION_CREDENTIALS env var
    initializeApp({ projectId: 'slugs-run' })
  }
}

export const db = getFirestore()
export { FieldValue }

export const AGENT_DOC = db.doc('agents/slug-001')
export const MESSAGES_COL = db.collection('agents/slug-001/messages')
export const FEED_COL = db.collection('feed_events')
