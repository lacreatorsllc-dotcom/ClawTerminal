import { Platform } from 'react-native'
import { Buffer } from 'buffer'
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
import { PublicKey } from '@solana/web3.js'

export interface NativeWalletConnectResult {
  walletPublicKey: string
  provider: 'seeker'
  authToken: string
  walletUriBase: string
}

const APP_IDENTITY = {
  name: 'SLUGS',
  uri: 'https://slugs.run',
  icon: '/favicon.ico',
}

export async function connectSeekerWallet(): Promise<NativeWalletConnectResult> {
  if (Platform.OS !== 'android') {
    throw new Error('Native Seeker wallet connection is only available on Android.')
  }

  return transact(async (wallet) => {
    const auth = await wallet.authorize({
      chain: 'solana:mainnet',
      identity: APP_IDENTITY,
    })

    const account = auth.accounts[0]
    if (!account?.address) {
      throw new Error('Wallet connected but did not return an account.')
    }

    const publicKey = new PublicKey(Buffer.from(account.address, 'base64')).toBase58()

    return {
      walletPublicKey: publicKey,
      provider: 'seeker' as const,
      authToken: auth.auth_token,
      walletUriBase: auth.wallet_uri_base,
    }
  })
}
