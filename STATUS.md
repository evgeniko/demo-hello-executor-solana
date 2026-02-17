# Project Status - Cross-VM Messaging with Wormhole Executor

## TL;DR
**EVM↔Solana and Solana↔Fogo routes working!** Key fixes: msgValue for SVM destinations, proper peer registration for SVM↔SVM.

## Current State (2026-02-17)

| Direction | Status | Notes |
|-----------|--------|-------|
| EVM → Solana | ✅ Working | msgValue + API cost fixed |
| Solana → Fogo | ✅ Working | Peer registration + msgValue fixed |
| Solana → EVM | ⏳ Testing | VAAs signing (13-16), checking relay |
| Fogo → Solana | 🔧 Needs testing | Next to validate |

## Key Fixes for SVM↔SVM

### 1. Peer Registration (Asymmetric!)
- **Source chain:** Register destination **PROGRAM** (for routing)
- **Dest chain:** Register source **EMITTER** (for VAA verification)

This is different from EVM↔EVM where you register the same address on both sides.

### 2. msgValue for SVM Destinations
Add ~15M lamports (~0.015 SOL) for rent/fees:
```typescript
const SOLANA_MSG_VALUE_LAMPORTS = 15_000_000n;
```

### 3. Cost Calculation
Use API's `estimatedCost` + `msgValue`:
```typescript
const cost = quote.estimatedCost + msgValue;
```

## Deployed Contracts

| Chain | Type | Address |
|-------|------|---------|
| Solana Devnet | Program | `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp` |
| Sepolia | Contract | `0x978d3cF51e9358C58a9538933FC3E277C29915C5` |
| Fogo Testnet | Program | TBD |

## Executor Program Addresses

Both Solana Devnet and Fogo Testnet use the same Executor program:
```
execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYuDRciV
```

This is expected - SVM program addresses are deterministic based on deployer + seed.

## Successful Transactions

### Solana → Fogo (2026-02-17)
- Status: `submitted`, 3 TXs completed
- Fogo blocks: 692607960, 692608021, 692608070

### EVM → Solana
- TX: `0xbf34754ffae3495c18018176a6ebb4417001695cb63b8a5fa70258d0a925c891`
- Status: `submitted`, 3 Solana TXs completed

## Testing Commands

```bash
# EVM → Solana
cd ~/demo-hello-executor-evm
npx tsx e2e/sendToSolana.ts "Hello from Sepolia!"

# Solana → Fogo
cd ~/demo-hello-executor-solana
npx tsx e2e/sendToFogo.ts "Hello from Solana!"

# Fogo → Solana (needs testing)
npx tsx e2e/sendFromFogo.ts "Hello from Fogo!"

# Check relay status
curl -s -X POST "https://executor-testnet.labsapis.com/v0/status/tx" \
  -H "Content-Type: application/json" \
  -d '{"chainId": <CHAIN_ID>, "txHash": "<TX_HASH>"}'
```

## Files

### Solana Repo
- `programs/hello-executor/src/resolver.rs` - Executor resolver
- `e2e/sendToFogo.ts` - Solana → Fogo test
- `e2e/sendToSepolia.ts` - Solana → Sepolia test

### EVM Repo
- `src/HelloWormhole.sol` - EVM contract with msgValue support
- `e2e/sendToSolana.ts` - Sepolia → Solana test

## Related PRs

- **EVM side:** [wormhole-foundation/demo-hello-executor#2](https://github.com/wormhole-foundation/demo-hello-executor/pull/2)
- **Solana side:** https://github.com/evgeniko/demo-hello-executor-solana

## Next Steps

1. ✅ ~~Fix EVM → Solana relay~~
2. ✅ ~~Fix Solana → Fogo relay~~
3. ⏳ Confirm Solana → EVM relay completes
4. 🔧 Test Fogo → Solana route
5. 📝 Document SVM↔SVM patterns for Wormhole docs
