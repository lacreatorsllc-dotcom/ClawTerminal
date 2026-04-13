# Slug #001 Chat Debug Handoff

## Status
- Trading loop: WORKING (BTC price via CoinGecko, fills, Firestore sync all good)
- Chat UI: WORKING (messages send/receive, scroll-to-bottom button added)
- Chat agent: BROKEN — Gemini replies not coming through

## Root Cause Investigation
The Firestore `onSnapshot` listener on `agents/slug-001/messages` is not firing for new messages. 
- The `[chat] ready` log line never appears, meaning the first snapshot never arrives
- This is either a Firestore index issue or a permissions issue on the subcollection

## Current Agent Code State
- `agent/src/chat.ts`: Uses `Timestamp.now()` + `where('created_at', '>=', startTimestamp)` filter to only get new messages. Added `[chat] snapshot:` log line to debug. Model: `gemini-2.0-flash-exp` (via GEMINI_MODEL env var).
- `agent/src/btc.ts`: CoinGecko API (Binance blocked on US IPs - 451 error)
- `agent/src/firebase.ts`: Uses ADC (no service account JSON) - IAM role `roles/datastore.user` granted to `1094657124615-compute@developer.gserviceaccount.com`
- `agent/src/index.ts`: Has `uncaughtException` + `unhandledRejection` handlers

## Cloud Run
- Service: `slug-001-agent` in `slugs-run` project, `us-central1`
- Image: `gcr.io/slugs-run/slug-001-agent`
- Env vars: `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-2.0-flash-exp`
- Deploy command: `gcloud run deploy slug-001-agent --image gcr.io/slugs-run/slug-001-agent --region us-central1 --env-vars-file /tmp/slug001-env.yaml`
- YAML file at `/tmp/slug001-env.yaml` (ephemeral - must recreate each session)

## YAML file recreation
```bash
printf "GEMINI_API_KEY: \"AIzaSyD6A9B0w927VkWGcj3WpGQjk-uhSnNPfVU\"\nGEMINI_MODEL: \"gemini-2.0-flash-exp\"\n" > /tmp/slug001-env.yaml
```

## Firestore Structure
- Agent state: `agents/slug-001` (document)
- Messages: `agents/slug-001/messages` (subcollection)
- Feed events: `feed_events` (top-level collection)

## App (React Native / Expo)
- Agent screen: `app/app/agent/[id].tsx` — `Slug001Screen` component (~line 660)
- Firebase client lib: `app/lib/firebase.ts` — `subscribeToMessages`, `addMessage`
- Scroll-to-bottom button added with `atBottom` state and `handleScroll` handler

## Next Steps
1. Rebuild and deploy the latest `chat.ts` with timestamp filter
2. Check logs for `[chat] snapshot:` line after sending a message
3. If snapshot never fires: Firestore composite index needed for `direction + created_at` on the messages subcollection — create it in Firebase Console
4. If snapshot fires but Gemini errors: check model name availability

## gcloud path
`/opt/homebrew/share/google-cloud-sdk/bin/gcloud`
