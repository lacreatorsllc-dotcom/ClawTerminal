import crypto from 'node:crypto'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

type StartTwitterAuthRequest = {
  callbackUrl?: string
}

type CompleteTwitterAuthRequest = {
  oauthToken?: string
  oauthVerifier?: string
  oauthTokenSecret?: string
}

const REQUEST_TOKEN_URL = 'https://api.twitter.com/oauth/request_token'
const ACCESS_TOKEN_URL = 'https://api.twitter.com/oauth/access_token'
const AUTHORIZE_URL = 'https://api.twitter.com/oauth/authenticate'

function requiredTwitterConfig() {
  const consumerKey =
    process.env.TWITTER_API_KEY ||
    process.env.TWITTER_CONSUMER_KEY ||
    process.env.X_API_KEY ||
    process.env.X_CONSUMER_KEY
  const consumerSecret =
    process.env.TWITTER_API_SECRET ||
    process.env.TWITTER_CONSUMER_SECRET ||
    process.env.X_API_SECRET ||
    process.env.X_CONSUMER_SECRET

  if (!consumerKey || !consumerSecret) {
    throw new HttpsError(
      'failed-precondition',
      'X sign-in is not configured yet. Add TWITTER_API_KEY and TWITTER_API_SECRET to Firebase Functions secrets.',
    )
  }

  return { consumerKey, consumerSecret }
}

function encode(value: string) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function nonce() {
  return crypto.randomBytes(16).toString('hex')
}

function parseOAuthResponse(body: string) {
  const params = new URLSearchParams(body)
  return Object.fromEntries(params.entries())
}

function oauthHeader({
  method,
  url,
  consumerKey,
  consumerSecret,
  tokenSecret = '',
  extraParams = {},
}: {
  method: 'POST'
  url: string
  consumerKey: string
  consumerSecret: string
  tokenSecret?: string
  extraParams?: Record<string, string>
}) {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
    ...extraParams,
  }

  const normalized = Object.entries(oauthParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join('&')
  const base = [method, encode(url), encode(normalized)].join('&')
  const signingKey = `${encode(consumerSecret)}&${encode(tokenSecret)}`
  const signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64')
  const signedParams = { ...oauthParams, oauth_signature: signature }

  return `OAuth ${Object.entries(signedParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encode(key)}="${encode(value)}"`)
    .join(', ')}`
}

async function postOAuth(url: string, authorization: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })
  const body = await response.text()

  if (!response.ok) {
    console.error('[twitter-auth] OAuth request failed', response.status, body)
    if (body.includes('Callback URL not approved') || body.includes('code="415"')) {
      throw new HttpsError(
        'failed-precondition',
        'X callback URL is not approved. Add slugs://auth/twitter to the X app callback URLs, then try again.',
      )
    }
    throw new HttpsError('unauthenticated', 'X sign-in failed. Please try again.')
  }

  return parseOAuthResponse(body)
}

export const startTwitterSignIn = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: ['TWITTER_API_KEY', 'TWITTER_API_SECRET'],
  },
  async (request) => {
    const { callbackUrl } = (request.data ?? {}) as StartTwitterAuthRequest
    const trimmedCallback = String(callbackUrl ?? '').trim()

    if (!trimmedCallback) {
      throw new HttpsError('invalid-argument', 'Missing X sign-in callback URL.')
    }

    const { consumerKey, consumerSecret } = requiredTwitterConfig()
    const authorization = oauthHeader({
      method: 'POST',
      url: REQUEST_TOKEN_URL,
      consumerKey,
      consumerSecret,
      extraParams: {
        oauth_callback: trimmedCallback,
      },
    })

    const response = await postOAuth(REQUEST_TOKEN_URL, authorization)
    const oauthToken = response.oauth_token
    const oauthTokenSecret = response.oauth_token_secret
    const callbackConfirmed = response.oauth_callback_confirmed === 'true'

    if (!oauthToken || !oauthTokenSecret || !callbackConfirmed) {
      throw new HttpsError('internal', 'X did not return a valid sign-in token.')
    }

    return {
      authUrl: `${AUTHORIZE_URL}?oauth_token=${encode(oauthToken)}`,
      oauthToken,
      oauthTokenSecret,
    }
  },
)

export const completeTwitterSignIn = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: ['TWITTER_API_KEY', 'TWITTER_API_SECRET'],
  },
  async (request) => {
    const { oauthToken, oauthVerifier, oauthTokenSecret } = (request.data ?? {}) as CompleteTwitterAuthRequest

    if (!oauthToken || !oauthVerifier || !oauthTokenSecret) {
      throw new HttpsError('invalid-argument', 'Missing X sign-in verification data.')
    }

    const { consumerKey, consumerSecret } = requiredTwitterConfig()
    const authorization = oauthHeader({
      method: 'POST',
      url: ACCESS_TOKEN_URL,
      consumerKey,
      consumerSecret,
      tokenSecret: oauthTokenSecret,
      extraParams: {
        oauth_token: oauthToken,
        oauth_verifier: oauthVerifier,
      },
    })

    const response = await postOAuth(ACCESS_TOKEN_URL, authorization)
    const accessToken = response.oauth_token
    const accessTokenSecret = response.oauth_token_secret
    const userId = response.user_id ?? null
    const screenName = response.screen_name ?? null

    if (!accessToken || !accessTokenSecret) {
      throw new HttpsError('internal', 'X did not return a valid access token.')
    }

    return {
      accessToken,
      accessTokenSecret,
      userId,
      screenName,
    }
  },
)
