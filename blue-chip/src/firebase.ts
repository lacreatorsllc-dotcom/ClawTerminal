import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

if (getApps().length === 0) {
  initializeApp() // ADC — works automatically on Cloud Run
}

export const db = getFirestore()
export { FieldValue }
