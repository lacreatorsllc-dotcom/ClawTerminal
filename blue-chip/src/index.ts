import * as http from 'http'
import { db } from './firebase'
import { startChatListener } from './chat'

process.on('uncaughtException', (err) => console.error('[uncaughtException]', err))
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err))

const PORT = process.env.PORT ?? 8080

const server = http.createServer((req, res) => {
  res.writeHead(200).end('Blue Chip agent is running.')
})

server.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`)

  if (!process.env.OPENAI_API_KEY) {
    console.error('[blue-chip] OPENAI_API_KEY is not set. Exiting.')
    process.exit(1)
  }

  // Track which agent IDs we've already started listeners for
  const listening = new Set<string>()

  // Dynamically discover all cabal_blue_chip agents and start listeners
  db.collection('agents')
    .where('agent_type', '==', 'cabal_blue_chip')
    .onSnapshot(
      (snap) => {
        for (const change of snap.docChanges()) {
          if (change.type === 'added' && !listening.has(change.doc.id)) {
            listening.add(change.doc.id)
            startChatListener(change.doc.id)
          }
        }
      },
      (err) => console.error('[blue-chip] agents snapshot error:', err)
    )

  console.log('[blue-chip] agent started — watching for cabal_blue_chip agents')
})
