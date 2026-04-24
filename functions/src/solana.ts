import bs58 from 'bs58'
import { getTools, type ToolBase } from '@goat-sdk/core'
import { jupiter } from '@goat-sdk/plugin-jupiter'
import { solana as goatSolana } from '@goat-sdk/wallet-solana'
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  clusterApiUrl,
} from '@solana/web3.js'
import { AGENT_PRIVATE_COLLECTION, AGENT_SECRETS_DOC_ID, FieldValue, db } from './firebase'

const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl('mainnet-beta')
const connection = new Connection(RPC_URL, 'confirmed')
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')

type TokenConfig = {
  mint: string
  decimals: number
}

const TOKENS: Record<string, TokenConfig> = {
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  SOL: { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
  BTC: { mint: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E', decimals: 6 },
  BONK: { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
  JUP: { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 },
}

type FundingBalance = {
  symbol: string
  mint: string
  amount: number
  decimals: number
}

type FundingSnapshot = {
  solBalance: number
  tokenBalances: FundingBalance[]
  hasFunding: boolean
}

function getToken(symbol: string): TokenConfig | null {
  return TOKENS[String(symbol).toUpperCase()] ?? null
}

export function isLiveTradingEnabled(agent: Record<string, any> | null | undefined): boolean {
  const data = agent ?? {}
  return (
    data.wallet_funding_state === 'funded' ||
    data.paper_mode === false ||
    data.live_trading_enabled === true ||
    data.funding_mode === 'agent_wallet_live'
  )
}

export function isLiveTradingArmed(agent: Record<string, any> | null | undefined): boolean {
  const data = agent ?? {}
  return (
    isLiveTradingEnabled(data) ||
    data.live_trading_preference === 'agent_wallet_live' ||
    Boolean(data.live_trading_requested_at)
  )
}

export async function armAgentLiveTrading(
  agentId: string,
  currentAgent?: Record<string, any> | null,
): Promise<Record<string, any>> {
  const existingAgent = currentAgent ?? (await db.doc(`agents/${agentId}`).get()).data() ?? {}
  const metadata = {
    ...(existingAgent.metadata ?? {}),
    live_trading_preference: 'agent_wallet_live',
    wallet_mode: 'agent_custody',
    wallet_network: 'solana',
  }

  const updates: Record<string, any> = {
    live_trading_preference: 'agent_wallet_live',
    wallet_mode: 'agent_custody',
    wallet_network: 'solana',
    deployment_status: 'active',
    updated_at: FieldValue.serverTimestamp(),
    metadata,
  }

  if (!existingAgent.live_trading_requested_at) {
    updates.live_trading_requested_at = FieldValue.serverTimestamp()
  }

  await db.doc(`agents/${agentId}`).set(updates, { merge: true })

  return {
    ...existingAgent,
    ...updates,
    metadata,
  }
}

export async function getWalletFundingSnapshot(walletAddress: string): Promise<FundingSnapshot> {
  const owner = new PublicKey(walletAddress)
  const lamports = await connection.getBalance(owner, 'confirmed')
  const solBalance = lamports / 1_000_000_000
  const mintToSymbol = new Map(
    Object.entries(TOKENS).map(([symbol, config]) => [config.mint, { symbol, decimals: config.decimals }]),
  )

  const parsedAccounts = await connection.getParsedTokenAccountsByOwner(
    owner,
    { programId: TOKEN_PROGRAM_ID },
    'confirmed',
  )

  const tokenBalances = parsedAccounts.value
    .map((account) => {
      const parsed = account.account.data.parsed?.info
      const mint = String(parsed?.mint ?? '')
      const tokenInfo = mintToSymbol.get(mint)
      const amount = Number(parsed?.tokenAmount?.uiAmount ?? 0)

      if (!tokenInfo || !Number.isFinite(amount) || amount <= 0) {
        return null
      }

      return {
        symbol: tokenInfo.symbol,
        mint,
        amount,
        decimals: tokenInfo.decimals,
      } satisfies FundingBalance
    })
    .filter((entry): entry is FundingBalance => entry != null)
    .sort((a, b) => b.amount - a.amount)

  return {
    solBalance,
    tokenBalances,
    hasFunding: solBalance > 0 || tokenBalances.length > 0,
  }
}

export async function syncAgentFundingState(
  agentId: string,
  currentAgent?: Record<string, any> | null,
): Promise<Record<string, any>> {
  const existingAgent = currentAgent ?? (await db.doc(`agents/${agentId}`).get()).data() ?? {}
  const walletAddress = String(existingAgent.wallet_address ?? '').trim()

  if (!walletAddress) {
    return existingAgent
  }

  const funding = await getWalletFundingSnapshot(walletAddress)
  const liveTradingEnabled = funding.hasFunding
  const walletFundingState = liveTradingEnabled ? 'funded' : 'empty'
  const metadata = {
    ...(existingAgent.metadata ?? {}),
    paper_mode: !liveTradingEnabled,
    live_trading_enabled: liveTradingEnabled,
    funding_mode: liveTradingEnabled ? 'agent_wallet_live' : 'paper',
    live_trading_preference: existingAgent.live_trading_preference ?? null,
    wallet_mode: 'agent_custody',
    wallet_network: 'solana',
    wallet_funding_state: walletFundingState,
  }

  const updates: Record<string, any> = {
    paper_mode: !liveTradingEnabled,
    live_trading_enabled: liveTradingEnabled,
    funding_mode: liveTradingEnabled ? 'agent_wallet_live' : 'paper',
    live_trading_preference: existingAgent.live_trading_preference ?? null,
    wallet_mode: 'agent_custody',
    wallet_network: 'solana',
    wallet_funding_state: walletFundingState,
    wallet_sol_balance: funding.solBalance,
    wallet_token_balances: funding.tokenBalances,
    wallet_last_checked_at: FieldValue.serverTimestamp(),
    metadata,
  }

  const wasFunded = String(existingAgent.wallet_funding_state ?? '') === 'funded'
  if (liveTradingEnabled && !wasFunded) {
    updates.wallet_funded_at = FieldValue.serverTimestamp()
  }

  if (!liveTradingEnabled && wasFunded) {
    updates.wallet_unfunded_at = FieldValue.serverTimestamp()
  }

  await db.doc(`agents/${agentId}`).set(updates, { merge: true })

  return {
    ...existingAgent,
    ...updates,
    metadata,
  }
}

async function getUsdPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`https://min-api.cryptocompare.com/data/price?fsym=${encodeURIComponent(symbol)}&tsyms=USD`)
    const data = await res.json() as any
    const price = Number(data?.USD)
    return Number.isFinite(price) && price > 0 ? price : null
  } catch {
    return null
  }
}

async function getAgentWallet(agentId: string): Promise<Keypair> {
  const snap = await db.doc(`agents/${agentId}/${AGENT_PRIVATE_COLLECTION}/${AGENT_SECRETS_DOC_ID}`).get()
  const encodedSecret = snap.data()?.solana_wallet_secret_key as string | undefined
  if (!encodedSecret) throw new Error('Agent custody wallet is not provisioned.')
  const secret = bs58.decode(encodedSecret)
  return Keypair.fromSecretKey(secret)
}

async function getGoatToolMap(agentId: string): Promise<Map<string, ToolBase<any, any>>> {
  const keypair = await getAgentWallet(agentId)
  const wallet = goatSolana({
    keypair,
    connection,
  })
  const tools = await getTools({
    wallet,
    plugins: [jupiter()],
  })
  return new Map(tools.map((tool) => [tool.name, tool]))
}

function toSafeNumber(value: bigint): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result)) {
    throw new Error('Trade amount is too large for GOAT Jupiter execution.')
  }
  return result
}

async function executeGoatJupiterTrade(params: {
  agentId: string
  side: 'buy' | 'sell'
  symbol: string
  qty: number
}): Promise<{ signature: string; fillPrice: number | null; usdNotional: number | null }> {
  const { agentId, side, symbol, qty } = params
  const normalizedSymbol = String(symbol).toUpperCase()
  const targetToken = getToken(normalizedSymbol)
  const usdcToken = getToken('USDC')

  if (!targetToken || !usdcToken) {
    throw new Error(`Unsupported GOAT live trading token: ${normalizedSymbol}`)
  }

  const usdPrice = normalizedSymbol === 'USDC' ? 1 : await getUsdPrice(normalizedSymbol)
  const inputMint = side === 'buy' ? usdcToken.mint : targetToken.mint
  const outputMint = side === 'buy' ? targetToken.mint : usdcToken.mint

  let amountAtomic: bigint
  if (side === 'buy') {
    if (!usdPrice) throw new Error(`Could not price ${normalizedSymbol} for GOAT live execution.`)
    const usdNotional = Number(qty) * usdPrice
    amountAtomic = BigInt(Math.max(1, Math.round(usdNotional * 10 ** usdcToken.decimals)))
  } else {
    amountAtomic = BigInt(Math.max(1, Math.round(Number(qty) * 10 ** targetToken.decimals)))
  }

  const tools = await getGoatToolMap(agentId)
  const swapTool = tools.get('swap_tokens')
  if (!swapTool) {
    throw new Error('GOAT Jupiter swap tool is unavailable.')
  }

  const swapResult = await swapTool.execute({
    inputMint,
    outputMint,
    amount: toSafeNumber(amountAtomic),
    slippageBps: 100,
  }) as { hash?: string; signature?: string }

  const signature = String(swapResult?.hash ?? swapResult?.signature ?? '').trim()
  if (!signature) {
    throw new Error('GOAT Jupiter swap did not return a transaction signature.')
  }

  return {
    signature,
    fillPrice: usdPrice,
    usdNotional: usdPrice != null ? Number(qty) * usdPrice : null,
  }
}

export async function executeLiveTrade(params: {
  agentId: string
  side: 'buy' | 'sell'
  symbol: string
  qty: number
}): Promise<{ signature: string; fillPrice: number | null; usdNotional: number | null }> {
  try {
    return await executeGoatJupiterTrade(params)
  } catch (error) {
    console.warn('[solana] GOAT Jupiter execution failed, falling back to direct Jupiter API:', error)
  }

  const { agentId, side, symbol, qty } = params
  const normalizedSymbol = String(symbol).toUpperCase()
  const targetToken = getToken(normalizedSymbol)
  const usdcToken = getToken('USDC')

  if (!targetToken || !usdcToken) {
    throw new Error(`Unsupported live trading token: ${normalizedSymbol}`)
  }

  const wallet = await getAgentWallet(agentId)
  const userPublicKey = wallet.publicKey.toBase58()
  const usdPrice = normalizedSymbol === 'USDC' ? 1 : await getUsdPrice(normalizedSymbol)

  const inputMint = side === 'buy' ? usdcToken.mint : targetToken.mint
  const outputMint = side === 'buy' ? targetToken.mint : usdcToken.mint

  let amountAtomic: bigint
  if (side === 'buy') {
    if (!usdPrice) throw new Error(`Could not price ${normalizedSymbol} for live execution.`)
    const usdNotional = Number(qty) * usdPrice
    amountAtomic = BigInt(Math.max(1, Math.round(usdNotional * 10 ** usdcToken.decimals)))
  } else {
    amountAtomic = BigInt(Math.max(1, Math.round(Number(qty) * 10 ** targetToken.decimals)))
  }

  const quoteUrl =
    `https://quote-api.jup.ag/v6/quote?inputMint=${encodeURIComponent(inputMint)}` +
    `&outputMint=${encodeURIComponent(outputMint)}` +
    `&amount=${amountAtomic.toString()}` +
    `&slippageBps=100`

  const quoteRes = await fetch(quoteUrl)
  if (!quoteRes.ok) {
    throw new Error(`Jupiter quote failed (${quoteRes.status})`)
  }
  const quote = await quoteRes.json() as any
  if (!quote?.outAmount) {
    throw new Error(`No live route available for ${normalizedSymbol}`)
  }

  const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  })
  if (!swapRes.ok) {
    throw new Error(`Jupiter swap build failed (${swapRes.status})`)
  }
  const swap = await swapRes.json() as any
  if (!swap?.swapTransaction) {
    throw new Error('No swap transaction returned.')
  }

  const txBuffer = Buffer.from(swap.swapTransaction, 'base64')
  const tx = VersionedTransaction.deserialize(txBuffer)
  tx.sign([wallet])
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  })
  await connection.confirmTransaction(signature, 'confirmed')

  return {
    signature,
    fillPrice: usdPrice,
    usdNotional: usdPrice != null ? Number(qty) * usdPrice : null,
  }
}
