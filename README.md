# Cross-VM Hello World with Wormhole Executor

Cross-chain messaging demo using Wormhole Executor for automatic relay between **Solana**, **Fogo**, and **EVM chains**.

## Status

| Route | Status | Notes |
|-------|--------|-------|
| EVM → Solana | ✅ **Working** | msgValue + API cost fixed |
| Solana → Fogo | ✅ **Working** | Peer registration + msgValue fixed |
| Solana → EVM | ⏳ Testing | VAAs signed, checking relay |
| Fogo → Solana | ⏳ **Code ready** | Needs ~50 FOGO for relay test |

## Call to Action

### To complete Fogo → Solana testing:
```bash
# 1. Fund wallet with ~50 FOGO
#    Address: 4VyQZpnMdUM59voCnCxsfNxkihPFFm57W3JWue8GHSzD

# 2. Run the test
npx tsx e2e/autoRelay.ts fogo-to-solana "Hello from Fogo!"
```

### To test other routes:
```bash
# Solana → Fogo
npx tsx e2e/autoRelay.ts solana-to-fogo "Hello from Solana!"

# Solana → EVM (Sepolia)
npx tsx e2e/sendToSepolia.ts "Hello from Solana!"
```

## Key Findings

### 1. SVM↔SVM Peer Registration (Asymmetric!)
- **Source chain:** Register destination **PROGRAM** ID (for routing)
- **Dest chain:** Register source **EMITTER** PDA (for VAA verification)

This differs from EVM↔EVM where the same address is registered on both sides.

### 2. msgValue for SVM Destinations
```typescript
const SVM_MSG_VALUE_LAMPORTS = 15_000_000n; // ~0.015 SOL for rent/fees
```

### 3. wormhole-anchor-sdk Limitation
The SDK hardcodes Wormhole program IDs. For cross-chain SVM support, we use raw CPI instead of SDK helpers. See `send_greeting.rs` for the pattern.

## Architecture

```
Solana Devnet                           Fogo Testnet
┌────────────────┐                    ┌────────────────┐
│ HelloExecutor  │                    │ HelloExecutor  │
│    (Anchor)    │                    │   (Anchor)     │
└───────┬────────┘                    └───────▲────────┘
        │                                     │
        │ send_greeting()                     │ receive_greeting()
        ▼                                     │
┌────────────────┐                    ┌───────┴────────┐
│ Wormhole Core  │ ──── Guardians ──▶ │ Wormhole Core  │
│ (3u8h...)      │     sign VAA       │ (BhnQ...)      │
└────────────────┘                    └────────────────┘
        │                                     ▲
        │ request_relay()                     │
        ▼                                     │
┌────────────────┐                            │
│   Executor     │ ─────── relay ─────────────┘
│ (execXUr...)   │
└────────────────┘
```

## Deployed Contracts

| Chain | Address | Status |
|-------|---------|--------|
| Solana Devnet | `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp` | ✅ |
| Fogo Testnet | `J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk` | ✅ |
| Sepolia | `0x978d3cF51e9358C58a9538933FC3E277C29915C5` | ✅ |

## Quick Start

```bash
# Install
npm install

# Test Solana → Fogo
npx tsx e2e/autoRelay.ts solana-to-fogo "Hello!"

# Test Fogo → Solana (needs FOGO funding)
npx tsx e2e/autoRelay.ts fogo-to-solana "Hello!"
```

## Key Files

```
programs/hello-executor/src/
├── lib.rs                    # Entry point
├── instructions/
│   ├── send_greeting.rs      # Raw CPI to Wormhole (cross-chain compatible)
│   ├── request_relay.rs      # Request Executor relay
│   └── update_config.rs      # Update Wormhole addresses

e2e/
├── autoRelay.ts              # Combined test script (both directions)
├── sendToSepolia.ts          # Solana → EVM test
└── config.ts                 # Chain configuration
```

## Related

- **EVM Contract**: [wormhole-foundation/demo-hello-executor#2](https://github.com/wormhole-foundation/demo-hello-executor/pull/2)
- **Wormhole Executor Docs**: [docs.wormhole.com](https://docs.wormhole.com)

## License

MIT
