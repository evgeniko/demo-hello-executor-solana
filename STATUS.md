# Project Status

## Objective
Replicate demo-hello-executor for Solana ↔ EVM cross-chain messaging using Wormhole Executor.

## Current State
- **Solana → Sepolia**: ✅ Working
- **Sepolia → Solana**: ⚠️ Blocked - Executor returns "unsupported" for custom Solana programs
- Program deployed: `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp`
- Sepolia contract: `0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c`
- Raw payload fix deployed (auto-detects EVM vs Solana message format)
- Peer registrations correct on both sides

## Next Steps
- [ ] Clarify with Wormhole team: does Executor support custom Solana programs?
- [ ] Alternative: Install worm CLI for manual VAA posting (`npm i -g @wormhole-foundation/wormhole-cli`)
- [ ] Alternative: Build custom relayer for EVM → Solana

## Recent Decisions
- 2026-02-11: Fixed Sepolia peer to use program ID (not emitter PDA)
- 2026-02-11: Raw payload fix - `PostedVaa<RawPayload>` for both EVM/Solana formats
- 2026-02-11: Manual relay requires posting VAA first (complex, needs worm CLI)

## Blockers
**Executor "unsupported"**: Returns "unsupported" for custom Solana programs. Likely only supports known protocols (NTT, Token Bridge). Options:
1. Ask Wormhole team for clarification/support
2. Use worm CLI for manual VAA posting + receive_greeting call
3. Build custom relayer

## Test VAA (Sequence 9)
```
AQAAAAABAHm4oBxraTHr/yZFBGvZ6Ubugz6O1hwTFY/hug8gOceUW4ETC+jaNcTzPhQbWDsIUsSjI6SvlHd5qYdWHcu0pBEAaYxClAAAAAAnEgAAAAAAAAAAAAAAAMg9yuOBEQGejvugt4zmugVeej8sAAAAAAAAAAnIRml4ZWQgcGVlciBhZGRyZXNzISDwn46J
```
Payload: "Fixed peer address! 🎉"
