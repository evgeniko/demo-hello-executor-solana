# Project Status

## Objective
Replicate demo-hello-executor for Solana ↔ EVM cross-chain messaging using Wormhole Executor.

## Current State (2026-02-11)

### ✅ Working

| Direction | Automatic (Executor) | Manual Relay |
|-----------|---------------------|--------------|
| Solana → Sepolia | ✅ Works | ✅ Works |
| Sepolia → Solana | ❌ "unsupported" | ✅ **Works!** |

### Deployed Contracts
- **Solana Program:** `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp`
- **Sepolia Contract:** `0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c`

### Key Findings

#### 1. Executor "unsupported" for Custom Solana Programs
The Wormhole Executor returns "unsupported" for EVM → Solana relay to custom programs. It likely only supports known protocols (NTT, Token Bridge). **Workaround: Manual relay works!**

#### 2. Peer Registration - Emitter PDA vs Program ID
- **Solana programs emit from the emitter PDA**, not the program ID
- Emitter PDA: `b7df8ac821c5ff824eeb235f59153edf3f93b021d81150e1988884f9f450eeef` (DNmK1Red1aEtrkUhfniwpXzjxtnVjxeVeKUBtdM5vwkJ)
- Program ID: `47c51f36dcb45b5bbdba739f0fa993b142f908f06095def3775428b46361b9d3` (5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp)
- **EVM side must register the emitter PDA as peer, not the program ID!**

#### 3. VAA Hash Calculation
- Use **keccak256** (certusone SDK), not SHA256
- The `@certusone/wormhole-sdk` `parseVaa()` function calculates the correct hash

## Manual Relay Process

### Solana → Sepolia
1. Send greeting from Solana (`sendToSepolia.ts`)
2. Wait for VAA signing (~1-2 min)
3. Fetch VAA from wormholescan API
4. Call `executeVAAv1(vaa)` on Sepolia HelloWormhole

### Sepolia → Solana (NEW!)
1. Send greeting from Sepolia (existing VAAs work too)
2. Fetch signed VAA from wormholescan:
   ```
   GET https://api.testnet.wormholescan.io/api/v1/vaas/10002/000000000000000000000000c83dcae38111019e8efba0b78ce6ba055e7a3f2c/{sequence}
   ```
3. Post VAA to Solana: `npx tsx e2e/postVaaCertusone.ts`
4. Receive greeting: `npx tsx e2e/receiveGreeting.ts`

## Scripts

### E2E Test Scripts
- `e2e/sendToSepolia.ts` - Send greeting Solana → Sepolia
- `e2e/postVaaCertusone.ts` - Post VAA to Solana Wormhole bridge (uses @certusone/wormhole-sdk)
- `e2e/receiveGreeting.ts` - Call receive_greeting on Solana program
- `e2e/sendWithRelay.ts` - Send with Executor automatic relay (Solana → Sepolia)

### Configuration
- `e2e/.env` - Environment variables (RPC URLs, program IDs)
- Solana keypair: `~/.config/solana/test-wallets/solana-devnet.json`

## Test VAAs

### Sepolia → Solana (Sequence 9)
```
AQAAAAABAHm4oBxraTHr/yZFBGvZ6Ubugz6O1hwTFY/hug8gOceUW4ETC+jaNcTzPhQbWDsIUsSjI6SvlHd5qYdWHcu0pBEAaYxClAAAAAAnEgAAAAAAAAAAAAAAAMg9yuOBEQGejvugt4zmugVeej8sAAAAAAAAAAnIRml4ZWQgcGVlciBhZGRyZXNzISDwn46J
```
- Payload: "Fixed peer address! 🎉"
- VAA Hash: `f7f4f62fd21ce81719c6fa670340c93a2e4e41303fce76497a1ae1353be75d4f`
- Posted VAA PDA: `F8sVfAYL18qiMKKwVj11faSKyQixy7FndvY23K5rkRqM`
- Receive TX: `3Qyn2Dpb924wUseuSikf7kuRxikt4qeXv9HhtTd9LQdQXdJVQZdE6A9PgWL8RmfNGHFfXJLcZrc22dwmite7HKht`

## Dependencies Added
- `@certusone/wormhole-sdk` - For posting VAAs to Solana (simpler than @wormhole-foundation SDK for this use case)

## Next Steps
- [ ] Build automated manual relayer service for EVM → Solana
- [ ] Investigate if Executor can be extended to support custom programs
- [ ] Add end-to-end test script that does full round trip

## Links
- [Wormhole Scan (Testnet)](https://testnet.wormholescan.io/)
- [Solana Explorer (Devnet)](https://explorer.solana.com/?cluster=devnet)
- [Sepolia Etherscan](https://sepolia.etherscan.io/)
