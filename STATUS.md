# Project Status - Solana ↔ EVM Cross-Chain Messaging

## TL;DR
**Automatic relay from Sepolia → Solana is 90% working!** The Executor calls our resolver, posts the VAA, but fails on a mysterious payment transfer. Needs fresh eyes on the Executor's behavior.

## Current State (2026-02-11)

### What Works
| Direction | Automatic (Executor) | Manual Relay |
|-----------|---------------------|--------------|
| Solana → Sepolia | ✅ Works | ✅ Works |
| Sepolia → Solana | ⚠️ 90% working | ✅ Works |

### The Problem
Executor relay fails with `svm_simulation_failed`:
```
Simulation logs:
  Program 3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5 invoke [1]  ← Wormhole
  ... (system program calls)
  Program 3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5 success    ← VAA posted!
  Program 11111111111111111111111111111111 invoke [1]              ← System transfer
  Transfer: insufficient lamports 228303295604, need 228304481844  ← FAILS HERE
```

**Key observation:** The Wormhole VAA posting succeeds, but then a System Program Transfer (instruction index 2) fails. This transfer is NOT from our resolver - it's added by the Executor (probably payment to quoter/payee).

The ~0.001 SOL shortfall on a 228 SOL account is suspicious. Why is the Executor trying to transfer 228+ SOL?

## Deployed Contracts
- **Solana Program:** `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp`
- **Sepolia Contract:** `0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c`

## What We Fixed
1. **Peer registration:** Set to program ID (not emitter PDA) so Executor calls resolver
2. **Resolver:** Use `RESOLVER_PUBKEY_POSTED_VAA` placeholder so Executor posts VAA first
3. **Fallback handler:** Routes Executor discriminator (94b8a9decf089a7f) to resolver

## Executor Debug Info
Last failed relay (TX: `0x6e1dc393dd8bfacc6216710eeb2687e714297a4ab66d94dfec96c818ae7d7950`):
```
Status: aborted
Failure: svm_simulation_failed
Quote baseFee: 51043
Payee: 0x4842781be7ba414c29029e6d7a70f6092e9d8beb
```

Check status: 
```bash
curl -s -X POST "https://executor-testnet.labsapis.com/v0/status/tx" \
  -H "Content-Type: application/json" \
  -d '{"chainId": 10002, "txHash": "<TX_HASH>"}'
```

## Files
- `programs/hello-executor/src/resolver.rs` - Executor resolver implementation
- `e2e/postVaaCertusone.ts` - Manual VAA posting to Solana
- `e2e/receiveGreeting.ts` - Manual receive_greeting call
- `e2e/sendToSepolia.ts` - Send from Solana with Executor

## Questions for Fresh Investigation
1. Why is the Executor's payment transfer trying to move 228+ SOL?
2. Is the quoter/payee address correctly configured on testnet?
3. Is there a Solana testnet Executor config issue?

## Repo
https://github.com/evgeniko/demo-hello-executor-solana
Branch: `feat/executor-resolver-evm-to-solana`
