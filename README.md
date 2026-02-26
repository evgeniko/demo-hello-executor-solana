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

### Solana → EVM (two transactions required)

> ⚠️ **Important:** Sending from Solana to EVM is a **two-step** process.
> Both transactions must succeed for the message to arrive.
> Calling `send_greeting` without `request_relay` publishes to Wormhole but
> the message is never delivered.

```
Solana Devnet                              Sepolia
┌────────────────┐                    ┌────────────────┐
│ HelloExecutor  │                    │ HelloWormhole  │
│    (Anchor)    │                    │  (Solidity)    │
└───────┬────────┘                    └───────▲────────┘
        │                                     │
        │ TX 1: send_greeting()               │ executeVAAv1()
        ▼                                     │
┌────────────────┐                    ┌───────┴────────┐
│ Wormhole Core  │ ──── Guardians ──▶ │ Wormhole Core  │
│ (3u8h...)      │     sign VAA       │                │
└────────────────┘                    └────────────────┘
        │                                     ▲
        │ TX 2: request_relay()               │
        ▼                                     │
┌────────────────┐                            │
│   Executor     │ ─────── relay ─────────────┘
└────────────────┘
```

### EVM → Solana (single transaction)

```
Sepolia                                Solana Devnet
┌────────────────┐                    ┌────────────────┐
│ HelloWormhole  │                    │ HelloExecutor  │
│  (Solidity)    │                    │    (Anchor)    │
└───────┬────────┘                    └───────▲────────┘
        │                                     │
        │ sendGreetingWithMsgValue()           │ receive_greeting()
        ▼                                     │
┌────────────────┐     Executor        ┌──────┴─────────┐
│ Wormhole Core  │ ── posts VAA ──────▶│ Wormhole Core  │
└────────────────┘                    └────────────────┘
```

## Deployed Contracts

| Chain | Address |
|-------|---------|
| Solana Devnet | `7eiTqf1b1dNwpzn27qEr4eGSWnuon2fJTbnTuWcFifZG` |
| Sepolia (EVM peer) | `0x15cEeB2C089D19E754463e1697d69Ad11A6e8841` |

## Key Concepts

### 1. Cross-VM Peer Registration

For SVM ↔ EVM messaging, peer registration uses **different addresses for different purposes**:

| Side | What to register | Used for |
|------|-----------------|----------|
| **Solana** | EVM contract address (bytes32, left-padded) | Verify incoming Sepolia VAAs |
| **EVM** `setPeer` | Solana **program ID** (32 bytes, no padding) | Executor relay routing |
| **EVM** `setVaaEmitter` | Solana **emitter PDA** (32 bytes) | Verify incoming Solana VAAs |

The split on the EVM side is necessary because the Wormhole Executor uses
`peers[chainId]` as the destination address to call the resolver program
(must be executable), while incoming VAAs from Solana carry the emitter PDA
as their source (a different, non-executable account).

```typescript
// Derive both Solana addresses
const programId = new PublicKey('7eiTqf1b1dNwpzn27qEr4eGSWnuon2fJTbnTuWcFifZG');
const [emitterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('emitter')],
    programId
);
const programIdBytes32  = '0x' + Buffer.from(programId.toBytes()).toString('hex');
const emitterPdaBytes32 = '0x' + Buffer.from(emitterPda.toBytes()).toString('hex');
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
