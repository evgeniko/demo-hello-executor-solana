# Cross-VM Hello World with Wormhole Executor

Cross-chain messaging demo using Wormhole Executor for automatic relay between **Solana ↔ EVM** (Sepolia).

## Status

| Route | Status |
|-------|--------|
| Solana → Sepolia | ✅ Working |
| Sepolia → Solana | ✅ Working |

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp e2e/.env.example e2e/.env
# Edit .env with your private keys

# Register peers (run once, both directions)
npx tsx e2e/setupPeers.ts

# Send from Solana to Sepolia
npx tsx e2e/sendToSepolia.ts "Hello from Solana!"
```

> For Sepolia → Solana, see the [EVM demo repo](https://github.com/wormhole-foundation/demo-hello-executor/pull/2).

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

> **Note:** `declare_id!` in `lib.rs` and `Anchor.toml` use `J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk` for local development. The devnet deployment above was done with a different keypair. When deploying your own instance, update `declare_id!` to match your deploy keypair.

## Key Concepts

### 1. Cross-VM Peer Registration

For SVM ↔ EVM messaging, peer registration is **asymmetric**:

- **Solana side:** Register the EVM contract address (as bytes32, left-padded)
- **EVM side:** Register the Solana program's **emitter PDA** (not the program ID!)

```typescript
// Solana emitter PDA derivation
const [emitterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('emitter')],
    programId
);
```

### 2. msgValue for SVM Destinations

When sending **TO** Solana/SVM chains, include `msgValue` for rent and fees:

```typescript
const SOLANA_MSG_VALUE_LAMPORTS = 15_000_000n; // ~0.015 SOL
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
├── sendToSepolia.ts          # Solana → Sepolia demo
├── setupPeers.ts             # Register peers (both directions)
├── config.ts                 # Chain configuration
├── relay.ts                  # Relay instruction encoding
└── types.ts                  # TypeScript types
```

## Environment Variables

Create `e2e/.env`:

```bash
# Solana keypair (JSON array or base58)
PRIVATE_KEY_SOLANA=[1,2,3,...] 
# Or use a file path:
# SOLANA_KEYPAIR_PATH=~/.config/solana/id.json

# Sepolia private key (for peer registration on EVM side)
PRIVATE_KEY_SEPOLIA=0x...
```

## Related

- **EVM Contract:** [wormhole-foundation/demo-hello-executor#2](https://github.com/wormhole-foundation/demo-hello-executor/pull/2)
- **Wormhole Docs:** [docs.wormhole.com](https://docs.wormhole.com)
- **Executor Explorer:** [wormholelabs-xyz.github.io/executor-explorer](https://wormholelabs-xyz.github.io/executor-explorer)

## License

MIT
