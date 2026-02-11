# Project Status

## Objective
Replicate demo-hello-executor for Solana ↔ EVM cross-chain messaging using Wormhole Executor.

## Current State
- **Solana → Sepolia**: ✅ Working (VAA created, relayed, received on Sepolia)
- **Sepolia → Solana**: ⚠️ Blocked by Executor "unsupported" for custom Solana programs
- Program deployed to devnet: `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp`
- Sepolia contract: `0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c`
- Raw payload fix deployed (auto-detects EVM vs Solana message format)
- Peer registrations correct on both sides

## Next Steps
- [ ] Test raw payload fix via manual VAA relay (bypass Executor)
- [ ] Clarify with Wormhole team: should Executor support custom Solana programs?
- [ ] If manual works, document alternative relay approaches
- [ ] Clean up and finalize documentation

## Recent Decisions
- 2026-02-11: Changed `PostedVaa<HelloExecutorMessage>` → `PostedVaa<RawPayload>` to accept both EVM raw bytes and Solana structured messages
- 2026-02-11: Fixed Sepolia peer to use program ID instead of emitter PDA

## Blockers
- **Executor "unsupported"**: The Wormhole Executor service returns "unsupported" when trying to relay to custom Solana programs. It may only support known protocols (NTT, Token Bridge). Need clarification from Wormhole team or alternative relay method.
