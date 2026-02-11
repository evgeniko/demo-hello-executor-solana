# Project Status

## Objective
Replicate demo-hello-executor for Solana ↔ EVM cross-chain messaging using Wormhole Executor.

## Current State (2026-02-11)

### ✅ Both Directions Work!

| Direction | Automatic (Executor) | Manual Relay |
|-----------|---------------------|--------------|
| Solana → Sepolia | ✅ Works | ✅ Works |
| Sepolia → Solana | ⚠️ Almost working! | ✅ Works |

### Executor Status (Sepolia → Solana)
The automatic relay is now **working up to the final step**:
1. ✅ Request submitted to Executor
2. ✅ Resolver called on Solana program
3. ✅ VAA posted to Wormhole Core Bridge
4. ⚠️ Final transaction fails due to Executor relayer low on funds

**Error:** `Transfer: insufficient lamports` - Executor testnet relayer needs ~0.001 more SOL.

This is an Executor infrastructure issue, not our code!

### Key Fixes Made
1. **Peer Registration:** Use program ID for Solana peer (not emitter PDA)
2. **Resolver:** Use `RESOLVER_PUBKEY_POSTED_VAA` placeholder so Executor posts VAA first
3. **Fallback Handler:** Route Executor discriminator (94b8a9decf089a7f) to resolver

### Deployed Contracts
- **Solana Program:** `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp`
- **Sepolia Contract:** `0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c`

## Peer Registration Notes

**IMPORTANT:** The peer address serves different purposes:
- **Receiving FROM Solana:** Peer must be emitter PDA (for VAA verification)
- **Sending TO Solana:** Peer must be program ID (for Executor to call resolver)

Current workaround: Use program ID. For bidirectional with different addresses, 
you'd need separate inbound/outbound peer mappings.

## Manual Relay Process (Working!)

### Sepolia → Solana
1. Send greeting from Sepolia
2. Fetch signed VAA from wormholescan
3. Post VAA to Solana: `npx tsx e2e/postVaaCertusone.ts`
4. Receive greeting: `npx tsx e2e/receiveGreeting.ts`

### Solana → Sepolia
1. Send greeting from Solana: `npx tsx e2e/sendToSepolia.ts`
2. Fetch signed VAA from wormholescan
3. Call `executeVAAv1(vaa)` on Sepolia HelloWormhole

## Scripts
- `e2e/postVaaCertusone.ts` - Posts VAA to Solana
- `e2e/receiveGreeting.ts` - Receives greeting on Solana
- `e2e/sendToSepolia.ts` - Sends from Solana with Executor relay

## Dependencies
- `@certusone/wormhole-sdk` - For VAA posting
- `executor-account-resolver-svm` - Resolver interface

## Next Steps
- [ ] Report Executor testnet relayer funding issue
- [ ] Consider reducing `Received` account size to minimize rent
- [ ] Add bidirectional peer support (separate inbound/outbound)
