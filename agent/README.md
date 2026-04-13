# Slug #001 — Cloud Run Agent

BTC paper grid trading agent. Runs 24/7 on Google Cloud Run.

## What it does
- Fetches live BTC price from Binance every 30s
- Simulates grid fills, updates Firestore (`agents/slug-001`)
- Listens for chat messages → responds via Gemini Flash 2.0
- Tools: `get_state`, `place_paper_trade`, `pause_trading`, `resume_trading`

## Deploy

### 1. Set up gcloud
```bash
gcloud auth login
gcloud config set project slugs-run
```

### 2. Build & push image
```bash
gcloud builds submit --tag gcr.io/slugs-run/slug-001-agent
```

### 3. Deploy to Cloud Run
```bash
gcloud run deploy slug-001-agent \
  --image gcr.io/slugs-run/slug-001-agent \
  --region us-central1 \
  --min-instances 1 \
  --max-instances 1 \
  --memory 512Mi \
  --set-env-vars "GEMINI_API_KEY=YOUR_KEY_HERE" \
  --set-env-vars "FIREBASE_SERVICE_ACCOUNT_JSON=$(cat path/to/serviceAccount.json | jq -c)" \
  --no-allow-unauthenticated
```

### Environment variables
| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | From [aistudio.google.com](https://aistudio.google.com) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase service account JSON (stringified) |

### Get Firebase service account
1. Firebase Console → Project Settings → Service Accounts
2. Generate new private key → download JSON
3. Pass as env var (stringified)

## Local dev
```bash
export GEMINI_API_KEY=...
export GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json
npm install
npm run dev
```
