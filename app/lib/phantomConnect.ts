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

import 'react-native-get-random-values'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import * as Linking from 'expo-linking'

export type WalletProvider = 'phantom' | 'backpack' | 'solflare' | 'seeker'

const SCHEME: Record<WalletProvider, string> = {
  phantom: 'phantom',
  backpack: 'backpack',
  solflare: 'solflare',
  seeker: 'solana-wallet',
}

// Cluster — mainnet for production
const CLUSTER = 'mainnet-beta'
const APP_URL = 'https://slugs.app'
const REDIRECT_PATH = 'onConnect'
const INSTALL_URLS: Record<WalletProvider, string> = {
  phantom: 'https://phantom.com/download',
  backpack: 'https://backpack.app/download',
  solflare: 'https://solflare.com/download',
  seeker: 'https://docs.solanamobile.com/mobile-wallet-adapter/mobile-apps',
}

// ─── Session keypair (ephemeral per-connect attempt) ─────────────────────────

let _dappKeyPair: nacl.BoxKeyPair | null = null
let _pendingProvider: WalletProvider | null = null

export function getDappKeyPair(): nacl.BoxKeyPair {
  if (!_dappKeyPair) _dappKeyPair = nacl.box.keyPair()
  return _dappKeyPair
}

export function resetDappKeyPair() {
  _dappKeyPair = nacl.box.keyPair()
}

export function setPendingWalletProvider(provider: WalletProvider | null) {
  _pendingProvider = provider
}

export function getPendingWalletProvider(): WalletProvider | null {
  return _pendingProvider
}

export function clearPendingWalletProvider() {
  _pendingProvider = null
}

export function beginMobileWalletConnect(provider: WalletProvider): string {
  resetDappKeyPair()
  setPendingWalletProvider(provider)
  return buildConnectUrl(provider)
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

interface SolanaWebWallet {
  publicKey?: { toString(): string }
  connect: () => Promise<{ publicKey?: { toString(): string } } | void>
}

function getWindowObject(): any {
  if (typeof window === 'undefined') return null
  return window as any
}

export function getWalletInstallUrl(provider: WalletProvider): string {
  return INSTALL_URLS[provider]
}

export function inferProviderFromCallback(url: string): WalletProvider | null {
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.get('phantom_encryption_public_key')) return 'phantom'
    if (parsed.searchParams.get('backpack_encryption_public_key')) return 'backpack'
    if (parsed.searchParams.get('encryption_public_key')) return getPendingWalletProvider() ?? 'solflare'
    return getPendingWalletProvider()
  } catch {
    return getPendingWalletProvider()
  }
}

export function getInjectedWallet(provider: WalletProvider): SolanaWebWallet | null {
  const win = getWindowObject()
  if (!win) return null

  if (provider === 'phantom') {
    return win.phantom?.solana ?? (win.solana?.isPhantom ? win.solana : null)
  }

  if (provider === 'backpack') {
    return win.backpack?.solana ?? (win.solana?.isBackpack ? win.solana : null)
  }

  if (provider === 'seeker') {
    return null
  }

  return win.solflare ?? win.solflare?.solana ?? null
}

export async function connectInjectedWallet(provider: WalletProvider): Promise<ConnectResult | null> {
  const wallet = getInjectedWallet(provider)
  if (!wallet) return null

  const result = await wallet.connect()
  const publicKey = result && 'publicKey' in result
    ? result.publicKey?.toString?.()
    : wallet.publicKey?.toString?.()

  if (!publicKey) {
    throw new Error('Wallet connected but did not return a public key')
  }

  return {
    walletPublicKey: publicKey,
    session: `web:${provider}`,
    provider,
  }
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
