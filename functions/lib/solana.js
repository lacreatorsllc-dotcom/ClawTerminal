"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLiveTradingEnabled = isLiveTradingEnabled;
exports.isLiveTradingArmed = isLiveTradingArmed;
exports.armAgentLiveTrading = armAgentLiveTrading;
exports.getWalletFundingSnapshot = getWalletFundingSnapshot;
exports.syncAgentFundingState = syncAgentFundingState;
exports.executeLiveTrade = executeLiveTrade;
const bs58_1 = __importDefault(require("bs58"));
const core_1 = require("@goat-sdk/core");
const plugin_jupiter_1 = require("@goat-sdk/plugin-jupiter");
const wallet_solana_1 = require("@goat-sdk/wallet-solana");
const web3_js_1 = require("@solana/web3.js");
const firebase_1 = require("./firebase");
const RPC_URL = process.env.SOLANA_RPC_URL || (0, web3_js_1.clusterApiUrl)('mainnet-beta');
const connection = new web3_js_1.Connection(RPC_URL, 'confirmed');
const TOKEN_PROGRAM_ID = new web3_js_1.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKENS = {
    USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
    SOL: { mint: 'So11111111111111111111111111111111111111112', decimals: 9 },
    BTC: { mint: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E', decimals: 6 },
    BONK: { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
    JUP: { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 },
};
function getToken(symbol) {
    return TOKENS[String(symbol).toUpperCase()] ?? null;
}
function isLiveTradingEnabled(agent) {
    const data = agent ?? {};
    return (data.wallet_funding_state === 'funded' ||
        data.paper_mode === false ||
        data.live_trading_enabled === true ||
        data.funding_mode === 'agent_wallet_live');
}
function isLiveTradingArmed(agent) {
    const data = agent ?? {};
    return (isLiveTradingEnabled(data) ||
        data.live_trading_preference === 'agent_wallet_live' ||
        Boolean(data.live_trading_requested_at));
}
async function armAgentLiveTrading(agentId, currentAgent) {
    const existingAgent = currentAgent ?? (await firebase_1.db.doc(`agents/${agentId}`).get()).data() ?? {};
    const metadata = {
        ...(existingAgent.metadata ?? {}),
        live_trading_preference: 'agent_wallet_live',
        wallet_mode: 'agent_custody',
        wallet_network: 'solana',
    };
    const updates = {
        live_trading_preference: 'agent_wallet_live',
        wallet_mode: 'agent_custody',
        wallet_network: 'solana',
        deployment_status: 'active',
        updated_at: firebase_1.FieldValue.serverTimestamp(),
        metadata,
    };
    if (!existingAgent.live_trading_requested_at) {
        updates.live_trading_requested_at = firebase_1.FieldValue.serverTimestamp();
    }
    await firebase_1.db.doc(`agents/${agentId}`).set(updates, { merge: true });
    return {
        ...existingAgent,
        ...updates,
        metadata,
    };
}
async function getWalletFundingSnapshot(walletAddress) {
    const owner = new web3_js_1.PublicKey(walletAddress);
    const lamports = await connection.getBalance(owner, 'confirmed');
    const solBalance = lamports / 1000000000;
    const mintToSymbol = new Map(Object.entries(TOKENS).map(([symbol, config]) => [config.mint, { symbol, decimals: config.decimals }]));
    const parsedAccounts = await connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, 'confirmed');
    const tokenBalances = parsedAccounts.value
        .map((account) => {
        const parsed = account.account.data.parsed?.info;
        const mint = String(parsed?.mint ?? '');
        const tokenInfo = mintToSymbol.get(mint);
        const amount = Number(parsed?.tokenAmount?.uiAmount ?? 0);
        if (!tokenInfo || !Number.isFinite(amount) || amount <= 0) {
            return null;
        }
        return {
            symbol: tokenInfo.symbol,
            mint,
            amount,
            decimals: tokenInfo.decimals,
        };
    })
        .filter((entry) => entry != null)
        .sort((a, b) => b.amount - a.amount);
    return {
        solBalance,
        tokenBalances,
        hasFunding: solBalance > 0 || tokenBalances.length > 0,
    };
}
async function syncAgentFundingState(agentId, currentAgent) {
    const existingAgent = currentAgent ?? (await firebase_1.db.doc(`agents/${agentId}`).get()).data() ?? {};
    const walletAddress = String(existingAgent.wallet_address ?? '').trim();
    if (!walletAddress) {
        return existingAgent;
    }
    const funding = await getWalletFundingSnapshot(walletAddress);
    const liveTradingEnabled = funding.hasFunding;
    const walletFundingState = liveTradingEnabled ? 'funded' : 'empty';
    const metadata = {
        ...(existingAgent.metadata ?? {}),
        paper_mode: !liveTradingEnabled,
        live_trading_enabled: liveTradingEnabled,
        funding_mode: liveTradingEnabled ? 'agent_wallet_live' : 'paper',
        live_trading_preference: existingAgent.live_trading_preference ?? null,
        wallet_mode: 'agent_custody',
        wallet_network: 'solana',
        wallet_funding_state: walletFundingState,
    };
    const updates = {
        paper_mode: !liveTradingEnabled,
        live_trading_enabled: liveTradingEnabled,
        funding_mode: liveTradingEnabled ? 'agent_wallet_live' : 'paper',
        live_trading_preference: existingAgent.live_trading_preference ?? null,
        wallet_mode: 'agent_custody',
        wallet_network: 'solana',
        wallet_funding_state: walletFundingState,
        wallet_sol_balance: funding.solBalance,
        wallet_token_balances: funding.tokenBalances,
        wallet_last_checked_at: firebase_1.FieldValue.serverTimestamp(),
        metadata,
    };
    const wasFunded = String(existingAgent.wallet_funding_state ?? '') === 'funded';
    if (liveTradingEnabled && !wasFunded) {
        updates.wallet_funded_at = firebase_1.FieldValue.serverTimestamp();
    }
    if (!liveTradingEnabled && wasFunded) {
        updates.wallet_unfunded_at = firebase_1.FieldValue.serverTimestamp();
    }
    await firebase_1.db.doc(`agents/${agentId}`).set(updates, { merge: true });
    return {
        ...existingAgent,
        ...updates,
        metadata,
    };
}
async function getUsdPrice(symbol) {
    try {
        const res = await fetch(`https://min-api.cryptocompare.com/data/price?fsym=${encodeURIComponent(symbol)}&tsyms=USD`);
        const data = await res.json();
        const price = Number(data?.USD);
        return Number.isFinite(price) && price > 0 ? price : null;
    }
    catch {
        return null;
    }
}
async function getAgentWallet(agentId) {
    const snap = await firebase_1.db.doc(`agents/${agentId}/${firebase_1.AGENT_PRIVATE_COLLECTION}/${firebase_1.AGENT_SECRETS_DOC_ID}`).get();
    const encodedSecret = snap.data()?.solana_wallet_secret_key;
    if (!encodedSecret)
        throw new Error('Agent custody wallet is not provisioned.');
    const secret = bs58_1.default.decode(encodedSecret);
    return web3_js_1.Keypair.fromSecretKey(secret);
}
async function getGoatToolMap(agentId) {
    const keypair = await getAgentWallet(agentId);
    const wallet = (0, wallet_solana_1.solana)({
        keypair,
        connection,
    });
    const tools = await (0, core_1.getTools)({
        wallet,
        plugins: [(0, plugin_jupiter_1.jupiter)()],
    });
    return new Map(tools.map((tool) => [tool.name, tool]));
}
function toSafeNumber(value) {
    const result = Number(value);
    if (!Number.isSafeInteger(result)) {
        throw new Error('Trade amount is too large for GOAT Jupiter execution.');
    }
    return result;
}
async function executeGoatJupiterTrade(params) {
    const { agentId, side, symbol, qty } = params;
    const normalizedSymbol = String(symbol).toUpperCase();
    const targetToken = getToken(normalizedSymbol);
    const usdcToken = getToken('USDC');
    if (!targetToken || !usdcToken) {
        throw new Error(`Unsupported GOAT live trading token: ${normalizedSymbol}`);
    }
    const usdPrice = normalizedSymbol === 'USDC' ? 1 : await getUsdPrice(normalizedSymbol);
    const inputMint = side === 'buy' ? usdcToken.mint : targetToken.mint;
    const outputMint = side === 'buy' ? targetToken.mint : usdcToken.mint;
    let amountAtomic;
    if (side === 'buy') {
        if (!usdPrice)
            throw new Error(`Could not price ${normalizedSymbol} for GOAT live execution.`);
        const usdNotional = Number(qty) * usdPrice;
        amountAtomic = BigInt(Math.max(1, Math.round(usdNotional * 10 ** usdcToken.decimals)));
    }
    else {
        amountAtomic = BigInt(Math.max(1, Math.round(Number(qty) * 10 ** targetToken.decimals)));
    }
    const tools = await getGoatToolMap(agentId);
    const swapTool = tools.get('swap_tokens');
    if (!swapTool) {
        throw new Error('GOAT Jupiter swap tool is unavailable.');
    }
    const swapResult = await swapTool.execute({
        inputMint,
        outputMint,
        amount: toSafeNumber(amountAtomic),
        slippageBps: 100,
    });
    const signature = String(swapResult?.hash ?? swapResult?.signature ?? '').trim();
    if (!signature) {
        throw new Error('GOAT Jupiter swap did not return a transaction signature.');
    }
    return {
        signature,
        fillPrice: usdPrice,
        usdNotional: usdPrice != null ? Number(qty) * usdPrice : null,
    };
}
async function executeLiveTrade(params) {
    try {
        return await executeGoatJupiterTrade(params);
    }
    catch (error) {
        console.warn('[solana] GOAT Jupiter execution failed, falling back to direct Jupiter API:', error);
    }
    const { agentId, side, symbol, qty } = params;
    const normalizedSymbol = String(symbol).toUpperCase();
    const targetToken = getToken(normalizedSymbol);
    const usdcToken = getToken('USDC');
    if (!targetToken || !usdcToken) {
        throw new Error(`Unsupported live trading token: ${normalizedSymbol}`);
    }
    const wallet = await getAgentWallet(agentId);
    const userPublicKey = wallet.publicKey.toBase58();
    const usdPrice = normalizedSymbol === 'USDC' ? 1 : await getUsdPrice(normalizedSymbol);
    const inputMint = side === 'buy' ? usdcToken.mint : targetToken.mint;
    const outputMint = side === 'buy' ? targetToken.mint : usdcToken.mint;
    let amountAtomic;
    if (side === 'buy') {
        if (!usdPrice)
            throw new Error(`Could not price ${normalizedSymbol} for live execution.`);
        const usdNotional = Number(qty) * usdPrice;
        amountAtomic = BigInt(Math.max(1, Math.round(usdNotional * 10 ** usdcToken.decimals)));
    }
    else {
        amountAtomic = BigInt(Math.max(1, Math.round(Number(qty) * 10 ** targetToken.decimals)));
    }
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${encodeURIComponent(inputMint)}` +
        `&outputMint=${encodeURIComponent(outputMint)}` +
        `&amount=${amountAtomic.toString()}` +
        `&slippageBps=100`;
    const quoteRes = await fetch(quoteUrl);
    if (!quoteRes.ok) {
        throw new Error(`Jupiter quote failed (${quoteRes.status})`);
    }
    const quote = await quoteRes.json();
    if (!quote?.outAmount) {
        throw new Error(`No live route available for ${normalizedSymbol}`);
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
    });
    if (!swapRes.ok) {
        throw new Error(`Jupiter swap build failed (${swapRes.status})`);
    }
    const swap = await swapRes.json();
    if (!swap?.swapTransaction) {
        throw new Error('No swap transaction returned.');
    }
    const txBuffer = Buffer.from(swap.swapTransaction, 'base64');
    const tx = web3_js_1.VersionedTransaction.deserialize(txBuffer);
    tx.sign([wallet]);
    const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
    });
    await connection.confirmTransaction(signature, 'confirmed');
    return {
        signature,
        fillPrice: usdPrice,
        usdNotional: usdPrice != null ? Number(qty) * usdPrice : null,
    };
}
//# sourceMappingURL=solana.js.map