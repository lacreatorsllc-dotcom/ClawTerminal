import OpenAI from 'openai'
import { Timestamp } from 'firebase-admin/firestore'
import { db, FieldValue } from './firebase'
import { pauseAgent, resumeAgent } from './api'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

async function writeReply(firestoreAgentId: string, content: string): Promise<void> {
  await db.collection('agents').doc(firestoreAgentId).collection('messages').add({
    direction: 'outbound',
    content,
    agent_id: firestoreAgentId,
    user_id: firestoreAgentId,
    created_at: FieldValue.serverTimestamp(),
  })
}

export function startChatListener(
  firestoreAgentId: string,
  apiKey: string,
  tbAgentId: string,
  agentName: string,
): void {
  const startTime = Timestamp.now()

  const messagesRef = db.collection('agents').doc(firestoreAgentId).collection('messages')
  const q = messagesRef
    .where('direction', '==', 'inbound')
    .where('created_at', '>=', startTime)
    .orderBy('created_at', 'asc')

  q.onSnapshot(
    async (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type !== 'added') continue

        const msgData = change.doc.data()
        const text: string = (msgData.content ?? '').trim()
        if (!text) continue

        try {
          // Control commands
          if (text === '/pause') {
            await pauseAgent(apiKey, tbAgentId)
            await writeReply(firestoreAgentId, 'Agent paused.')
            continue
          }
          if (text === '/resume') {
            await resumeAgent(apiKey, tbAgentId)
            await writeReply(firestoreAgentId, 'Agent resumed.')
            continue
          }

          // Fetch live context
          const agentDoc = await db.collection('agents').doc(firestoreAgentId).get()
          const agentData = agentDoc.data() ?? {}
          const liveState = agentData.live_state ?? {}

          const decisionsSnap = await db
            .collection('agents')
            .doc(firestoreAgentId)
            .collection('decisions')
            .orderBy('eventTime', 'desc')
            .limit(10)
            .get()

          const decisions = decisionsSnap.docs.map((d) => d.data())

          const systemPrompt = `You are ${agentName}, a fully autonomous crypto trading agent on the Cabal Ventures platform.

CURRENT STATE:
${JSON.stringify(liveState, null, 2)}

RECENT DECISIONS (last 10):
${decisions.map((d) => `[${d.eventTime}] ${d.tokenSymbol} ${d.actionType} (${d.confidence}%): ${d.details}`).join('\n')}

Behavior:
- Answer questions about your state, decisions, and reasoning
- Be concise and data-driven
- For /pause and /resume commands, confirm execution
- Never fabricate trade data not in your context`

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text },
            ],
          })

          const reply = completion.choices[0]?.message?.content ?? 'No response.'
          await writeReply(firestoreAgentId, reply)
        } catch (err: any) {
          console.error(`[chat:${firestoreAgentId}] error processing message:`, err?.message ?? err)
          await writeReply(firestoreAgentId, 'Error processing your message. Please try again.').catch(() => {})
        }
      }
    },
    (err) => {
      console.error(`[chat:${firestoreAgentId}] snapshot error:`, err?.message ?? err)
    },
  )
}
