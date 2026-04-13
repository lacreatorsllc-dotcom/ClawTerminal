/**
 * Phantom (and Backpack) deep-link wallet connect
 * Spec: https://docs.phantom.app/phantom-deeplinks/deeplinks-ios-and-android
 *
 * Flow:
 *   1. App generates ephemeral X25519 keypair
 *   2. App opens phantom://v1/connect with dapp public key + redirect URI
 *   3. Phantom approves, redirects to slugs://onConnect with encrypted payload
 *   4. App decrypts to get wallet public key + session token
 */

import nacl from 'tweetnacl'
import bs58 from 'bs58'
import * as Linking from 'expo-linking'

export type WalletProvider = 'phantom' | 'backpack' | 'solflare'

const SCHEME: Record<WalletProvider, string> = {
  phantom: 'phantom',
  backpack: 'backpack',
  solflare: 'solflare',
}

// Cluster — mainnet for production
const CLUSTER = 'mainnet-beta'
const APP_URL = 'https://slugs.app'
const REDIRECT_PATH = 'onConnect'

// ─── Session keypair (ephemeral per-connect attempt) ─────────────────────────

let _dappKeyPair: nacl.BoxKeyPair | null = null

export function getDappKeyPair(): nacl.BoxKeyPair {
  if (!_dappKeyPair) _dappKeyPair = nacl.box.keyPair()
  return _dappKeyPair
}

export function resetDappKeyPair() {
  _dappKeyPair = nacl.box.keyPair()
}

// ─── Build connect URL ────────────────────────────────────────────────────────

export function buildConnectUrl(provider: WalletProvider): string {
  const kp = getDappKeyPair()
  const dappPubKeyB58 = bs58.encode(kp.publicKey)
  const redirectLink = Linking.createURL(REDIRECT_PATH)

  const params = new URLSearchParams({
    app_url: APP_URL,
    dapp_encryption_public_key: dappPubKeyB58,
    redirect_link: redirectLink,
    cluster: CLUSTER,
  })

  const scheme = SCHEME[provider]
  return `${scheme}://v1/connect?${params.toString()}`
}

// ─── Decrypt callback ─────────────────────────────────────────────────────────

export interface ConnectResult {
  walletPublicKey: string   // base58 Solana public key
  session: string           // opaque session token from wallet
  provider: WalletProvider
}

export function decryptConnectCallback(
  url: string,
  provider: WalletProvider
): ConnectResult | null {
  try {
    const parsed = new URL(url)
    const phantomPubKeyB58 = parsed.searchParams.get('phantom_encryption_public_key')
      ?? parsed.searchParams.get('backpack_encryption_public_key')
      ?? parsed.searchParams.get('encryption_public_key')
    const nonceB58 = parsed.searchParams.get('nonce')
    const dataB58 = parsed.searchParams.get('data')

    if (!phantomPubKeyB58 || !nonceB58 || !dataB58) return null

    const phantomPubKey = bs58.decode(phantomPubKeyB58)
    const nonce = bs58.decode(nonceB58)
    const data = bs58.decode(dataB58)
    const kp = getDappKeyPair()

    const decrypted = nacl.box.open(data, nonce, phantomPubKey, kp.secretKey)
    if (!decrypted) return null

    const payload = JSON.parse(new TextDecoder().decode(decrypted))

    return {
      walletPublicKey: payload.public_key as string,
      session: payload.session as string,
      provider,
    }
  } catch {
    return null
  }
}
