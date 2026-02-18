# Cross-VM Hello World with Wormhole Executor

Cross-chain messaging demo using Wormhole Executor for automatic relay between **Solana** and **EVM chains** (Sepolia).

## Status

| Route | Status |
|-------|--------|
| Solana → Sepolia | ✅ Working |
| Sepolia → Solana | ✅ Working |

## Quick Start

```bash
# Install dependencies
npm install

# Send from Solana to Sepolia
npx tsx e2e/sendToSepolia.ts "Hello from Solana!"
```

## Architecture

```
Solana Devnet                              Sepolia
┌────────────────┐                    ┌────────────────┐
│ HelloExecutor  │                    │ HelloWormhole  │
│    (Anchor)    │                    │  (Solidity)    │
└───────┬────────┘                    └───────▲────────┘
        │                                     │
        │ send_greeting()                     │ receiveWormholeMessages()
        ▼                                     │
┌────────────────┐                    ┌───────┴────────┐
│ Wormhole Core  │ ──── Guardians ──▶ │ Wormhole Core  │
│ (3u8h...)      │     sign VAA       │                │
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

| Chain | Address |
|-------|---------|
| Solana Devnet | `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp` |
| Sepolia | `0x978d3cF51e9358C58a9538933FC3E277C29915C5` |

## Key Concepts

### 1. Cross-VM Peer Registration

For SVM ↔ EVM messaging, peer registration is **asymmetric**:

- **Solana side:** Register the EVM contract address (as bytes32)
- **EVM side:** Register the Solana program's **emitter PDA** (not the program ID)

```typescript
// Solana emitter PDA derivation
const [emitterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('emitter')],
    programId
);
```

### 2. msgValue for SVM Destinations

When sending TO Solana/SVM chains, include `msgValue` for rent and fees:

```typescript
const SVM_MSG_VALUE_LAMPORTS = 15_000_000n; // ~0.015 SOL
```

### 3. Wormhole Chain IDs

| Chain | ID |
|-------|-----|
| Solana | 1 |
| Sepolia | 10002 |

## Project Structure

```
programs/hello-executor/src/
├── lib.rs                    # Entry point & instructions
├── instructions/
│   ├── send_greeting.rs      # Send cross-chain message
│   ├── request_relay.rs      # Request Executor relay
│   └── receive_greeting.rs   # Receive cross-chain message
├── state/                    # Account structures
└── resolver.rs               # Executor resolver

e2e/
├── sendToSepolia.ts          # Solana → Sepolia test
├── autoRelay.ts              # Generic relay test script
├── config.ts                 # Chain configuration
├── executor.ts               # Executor API helpers
└── messaging.ts              # Messaging helpers
```

## Testing

### Prerequisites

1. Solana CLI configured for devnet
2. Funded wallet at `~/.config/solana/test-wallets/solana-devnet.json`
3. Node.js 18+

### Run Tests

```bash
# Solana → Sepolia
npx tsx e2e/sendToSepolia.ts "Hello from Solana!"

# Check relay status
# The script will poll the Executor API and report when complete
```

## Related

- **EVM Contract:** [wormhole-foundation/demo-hello-executor#2](https://github.com/wormhole-foundation/demo-hello-executor/pull/2)
- **Wormhole Docs:** [docs.wormhole.com](https://docs.wormhole.com)
- **Executor Explorer:** [wormholelabs-xyz.github.io/executor-explorer](https://wormholelabs-xyz.github.io/executor-explorer)

## License

MIT
