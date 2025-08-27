import 'dotenv/config';
import axios from 'axios';
import { WebSocketProvider, JsonRpcProvider, formatEther } from 'ethers';

const WS_URL = process.env.WS_RPC_SEPOLIA;
const HTTP_URL = process.env.HTTP_RPC_SEPOLIA;
const WATCH = (process.env.ADDRESS || '').toLowerCase();
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY;

if (!WS_URL || !HTTP_URL || !WATCH || !ETHERSCAN_KEY) {
  console.error('Missing .env values. Need WS_RPC_SEPOLIA, HTTP_RPC_SEPOLIA, ADDRESS, ETHERSCAN_API_KEY');
  process.exit(1);
}

const ws = new WebSocketProvider(WS_URL);
const http = new JsonRpcProvider(HTTP_URL);
const ETHERSCAN_BASE = 'https://api-sepolia.etherscan.io/api';

// ---------- Helpers ----------
const fmtEth = (wei) => {
  try { return formatEther(wei ?? 0n); } catch { return '0'; }
};

// ---------- Etherscan history fetchers ----------
async function fetchNormalTxs(address, startBlock = 0, endBlock = 99999999, offset = 10000) {
  const params = new URLSearchParams({
    module: 'account', action: 'txlist', address,
    startblock: String(startBlock), endblock: String(endBlock),
    page: '1', offset: String(offset), sort: 'asc', apikey: ETHERSCAN_KEY,
  });
  const { data } = await axios.get(`${ETHERSCAN_BASE}?${params}`);
  if (data.status !== '1' && data.message !== 'No transactions found') {
    throw new Error(`Etherscan normal error: ${data.message}`);
  }
  return data.result || [];
}

async function fetchInternalTxs(address, startBlock = 0, endBlock = 99999999, offset = 10000) {
  const params = new URLSearchParams({
    module: 'account', action: 'txlistinternal', address,
    startblock: String(startBlock), endblock: String(endBlock),
    page: '1', offset: String(offset), sort: 'asc', apikey: ETHERSCAN_KEY,
  });
  const { data } = await axios.get(`${ETHERSCAN_BASE}?${params}`);
  if (data.status !== '1' && data.message !== 'No transactions found') {
    throw new Error(`Etherscan internal error: ${data.message}`);
  }
  return data.result || [];
}

// ---------- Print history ----------
async function printHistory(address) {
  console.log(`⬇️  Fetching existing NORMAL txs for ${address}…`);
  const normal = await fetchNormalTxs(address);
  console.log(`Found ${normal.length} normal tx(s). Showing last 5:`);
  normal.slice(-5).forEach(t => {
    console.log(`\n📜 [NORMAL] ${t.hash}`);
    console.log(`   Block: ${t.blockNumber}  Time: ${new Date(Number(t.timeStamp)*1000).toISOString()}`);
    console.log(`   From:  ${t.from}`);
    console.log(`   To:    ${t.to}`);
    console.log(`   Value: ${fmtEth(BigInt(t.value))} ETH`);
    if (t.input && t.input !== '0x') console.log(`   Input: ${t.input.slice(0, 18)}…`);
  });

  console.log(`\n⬇️  Fetching existing INTERNAL txs for ${address}…`);
  const internal = await fetchInternalTxs(address);
  console.log(`Found ${internal.length} internal tx(s). Showing last 5:`);
  internal.slice(-5).forEach(t => {
    console.log(`\n🧩 [INTERNAL] ParentTx: ${t.hash}`);
    console.log(`   Block: ${t.blockNumber}  Time: ${new Date(Number(t.timeStamp)*1000).toISOString()}`);
    console.log(`   From:  ${t.from}`);
    console.log(`   To:    ${t.to}`);
    console.log(`   Value: ${fmtEth(BigInt(t.value))} ETH`);
    console.log(`   Type:  ${t.type || 'call'}`);
  });
}

// ---------- Live monitor ----------
async function handleBlock(blockNumber) {
  const block = await http.getBlock(blockNumber, true); // include full txs

  // 1) Normal txs (from/to match)
  if (block?.transactions) {
    for (const tx of block.transactions) {
      const from = (tx.from || '').toLowerCase();
      const to = (tx.to || '').toLowerCase();
      if (from === WATCH || to === WATCH) {
        console.log('\n📦 New NORMAL tx on Sepolia');
        console.log(`• Block:       ${blockNumber}`);
        console.log(`• Hash:        ${tx.hash}`);
        console.log(`• From:        ${tx.from}`);
        console.log(`• To:          ${tx.to}`);
        console.log(`• Value (ETH): ${fmtEth(tx.value || 0n)}`);
      }
    }
  }

  // 2) Internal txs (query Etherscan just for this block)
  try {
    const ints = await fetchInternalTxs(WATCH, blockNumber, blockNumber, 1000);
    for (const t of ints) {
      console.log('\n🧩 New INTERNAL tx on Sepolia');
      console.log(`• Block:       ${t.blockNumber}`);
      console.log(`• Parent Tx:   ${t.hash}`);
      console.log(`• From:        ${t.from}`);
      console.log(`• To:          ${t.to}`);
      console.log(`• Value (ETH): ${fmtEth(BigInt(t.value))}`);
      console.log(`• Type:        ${t.type || 'call'}`);
      if (t.traceId) console.log(`• Trace ID:    ${t.traceId}`);
    }
  } catch (e) {
    // Don’t kill the stream if Etherscan rate-limits; just log and continue.
    console.error('Internal fetch error:', e.message);
  }
}

async function liveMonitor(address) {
  console.log(`\n🚀 Live monitoring for ${address} (Ctrl+C to stop)…`);
  // Optional: start from the next block after current, to avoid re-printing history.
  ws.on('block', async (bn) => {
    try {
      await handleBlock(bn);
    } catch (e) {
      console.error('Block error:', e.message);
    }
  });

  ws._websocket?.on('close', () => {
    console.log('WebSocket closed. Restart the script to reconnect.');
  });
}

(async () => {
  try {
    await printHistory(WATCH);    // historical normal + internal
    await liveMonitor(WATCH);     // live stream for both
  } catch (e) {
    console.error('Fatal:', e);
    process.exit(1);
  }
})();

