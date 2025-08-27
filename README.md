# Sepolia Address Monitor

Monitors a Sepolia address for:
- **Existing history**: normal transactions + internal transactions (via Etherscan)
- **Live stream**: prints new normal transactions (from/to match) and internal transactions (via Etherscan per block)

## Prereqs

- Node.js 18+
- An Ethereum provider account (Infura/Alchemy/Ankr) with **Sepolia** endpoints
- An **Etherscan API key**
  - For Sepolia, use the `api-sepolia.etherscan.io` base; the key format is the same as mainnet Etherscan

## Quick start

```bash
npm install
cp .env.sample .env
# edit .env with your WS/HTTP RPC URLs, address, and Etherscan key
npm start
```

On start, the script will:
1. Fetch and print **existing** normal + internal transactions (last 5 of each).
2. Begin **live monitoring** of new Sepolia blocks:
   - Prints any **normal** transaction where `from` or `to` matches the address.
   - Queries Etherscan for that block to print any **internal** transactions involving the address.

## Notes

- **Rate limits:** If you hit Etherscan rate limits, consider adding a small delay, retry, or batching.
- **Internal transactions:** These are value transfers triggered inside contract execution; they are not surfaced by JSON-RPC as first-class transactions and require a tracer/indexer (Etherscan provides this via API).
- **Decoding events:** If your monitored address is a contract and you want to decode events (`Transfer`, etc.), extend the script with an ABI and `getLogs` filter.

## Scripts

- `npm start` — runs the monitor.

## License

MIT
