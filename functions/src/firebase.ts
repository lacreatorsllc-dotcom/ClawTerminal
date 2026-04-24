import * as admin from 'firebase-admin'

if (!admin.apps.length) {
  admin.initializeApp()
}

export const db = admin.firestore()
export const FieldValue = admin.firestore.FieldValue

export const AGENTS_COL = db.collection('agents')
export const FEED_COL = db.collection('feed_events')
export const NEWS_COL = db.collection('market_news')
export const AGENT_PRIVATE_COLLECTION = 'private'
export const AGENT_SECRETS_DOC_ID = 'secrets'
