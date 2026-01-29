# SVM Cross-Chain Hello World with Wormhole Executor

A demonstration of cross-chain messaging between **Solana (Devnet)** and **Fogo (Testnet)** using Wormhole's Executor service for automatic relay.

## Overview

This project shows how to:
- Send cross-chain messages using Wormhole Core Bridge on SVM
- Use the Executor service for automatic message relay
- Handle VAA verification and replay protection
- Emit and track cross-chain events

## Architecture

```
Solana Devnet                          Fogo Testnet
┌────────────────┐                    ┌────────────────┐
│ HelloExecutor  │                    │ HelloExecutor  │
│    Program     │                    │    Program     │
└───────┬────────┘                    └───────▲────────┘
        │                                     │
        │ post_message()                      │ receive_greeting()
        ▼                                     │
┌────────────────┐                    ┌───────┴────────┐
│ Wormhole Core  │ ──── Guardians ──▶ │ Wormhole Core  │
│    Bridge      │     sign VAA       │    Bridge      │
└────────────────┘                    └────────────────┘
        │                                     ▲
        │ RequestForExecution                 │
        ▼                                     │
┌────────────────┐                            │
│   Executor     │ ─────── relay ─────────────┘
│    Service     │
└────────────────┘
```

## Project Structure

```
demo-hello-executor-solana/
├── programs/
│   └── hello-executor/
│       └── src/
│           ├── lib.rs                 # Program entry point
│           ├── instructions/          # Instruction handlers
│           │   ├── initialize.rs      # Initialize config
│           │   ├── register_peer.rs   # Register peer contracts
│           │   ├── send_greeting.rs   # Send cross-chain greeting
│           │   └── receive_greeting.rs # Receive greeting
│           ├── state/                 # Account structures
│           │   ├── config.rs          # Program config
│           │   ├── peer.rs            # Peer registration
│           │   ├── received.rs        # Replay protection
│           │   └── wormhole_emitter.rs
│           ├── message.rs             # Payload encoding
│           └── error.rs               # Custom errors
├── e2e/
│   ├── test.ts                        # Main E2E test
│   ├── config.ts                      # Configuration
│   ├── messaging.ts                   # Send/receive logic
│   ├── executor.ts                    # Executor API client
│   ├── relay.ts                       # Relay instructions
│   └── utils.ts                       # Utilities
├── tests/
│   └── hello-executor.ts              # Anchor tests
├── Anchor.toml                        # Anchor config
├── Cargo.toml                         # Workspace config
└── package.json                       # NPM dependencies
```

## Prerequisites

- Rust 1.75+ (managed by Solana toolchain)
- Solana CLI 1.18.26
- Anchor CLI 0.29.0 (program build) and @coral-xyz/anchor ^0.31.0 (JS client)
- Node.js 18+

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the program:**
   ```bash
   anchor build
   ```

3. **Configure environment:**
   ```bash
   cp e2e/.env.example e2e/.env
   # Edit .env with your configuration
   ```

## Deployment

### Deploy to Solana Devnet

```bash
# Set cluster
solana config set --url devnet

# Deploy
anchor deploy --provider.cluster devnet

# Note the program ID and update:
# - Anchor.toml
# - e2e/.env (HELLO_EXECUTOR_SOLANA)
```

### Deploy to Fogo Testnet

```bash
# Set RPC URL
solana config set --url https://rpc.testnet.fogo.io

# Deploy
anchor deploy --provider.cluster https://rpc.testnet.fogo.io

# Note the program ID and update e2e/.env (HELLO_EXECUTOR_FOGO)
```

## Usage

### Initialize the Program

After deployment, initialize the program on each chain:

```typescript
import { initialize } from './e2e/messaging.js';
import { config } from './e2e/config.js';

await initialize(config.solana);
await initialize(config.fogo);
```

### Register Peer Contracts

Register each chain's program as a peer on the other:

```typescript
import { registerPeer } from './e2e/messaging.js';
import { CHAIN_ID_SOLANA, CHAIN_ID_FOGO } from './e2e/config.js';

// On Solana: register Fogo program
await registerPeer(config.solana, CHAIN_ID_FOGO, config.fogo.programId);

// On Fogo: register Solana program
await registerPeer(config.fogo, CHAIN_ID_SOLANA, config.solana.programId);
```

### Send a Greeting

```typescript
import { sendGreeting, requestRelay, waitForVAA, waitForReceipt } from './e2e/messaging.js';
import { getExecutorQuote } from './e2e/executor.js';
import { createRelayInstructions, DEFAULT_COMPUTE_UNITS, DEFAULT_LAMPORTS } from './e2e/relay.js';

// Send from Solana to Fogo
const result = await sendGreeting(config.solana, config.fogo, "Hello from Solana!");

// Request Executor relay (recommended)
const relayInstructions = createRelayInstructions(DEFAULT_COMPUTE_UNITS, DEFAULT_LAMPORTS);
const quote = await getExecutorQuote({
  srcChain: config.solana.wormholeChainId,
  dstChain: config.fogo.wormholeChainId,
  relayInstructions,
});
await requestRelay(config.solana, config.fogo, quote.signedQuote, BigInt(quote.estimatedCost || "0"), relayInstructions);

// Wait for VAA to be signed
const vaa = await waitForVAA(config.solana, result.sequence);

// Wait for receipt on target chain
const received = await waitForReceipt(config.fogo, CHAIN_ID_SOLANA, result.sequence);
```

### Run E2E Test

```bash
npm run e2e:test
```

## Program Instructions

### `initialize(chain_id: u16)`
Initializes the program configuration and creates the Wormhole emitter PDA.

### `register_peer(chain: u16, address: [u8; 32])`
Registers a peer contract on another chain. Only callable by the owner.

### `send_greeting(greeting: String)`
Sends a cross-chain greeting message through Wormhole Core Bridge.

### `receive_greeting(vaa_hash: [u8; 32])`
Receives and verifies a cross-chain greeting. Creates a Received account for replay protection.

### `request_relay(dst_chain: u16, exec_amount: u64, signed_quote_bytes: Vec<u8>, relay_instructions: Vec<u8>)`
Requests Executor relay for the most recently posted message. This submits a request to the Executor program using an off-chain signed quote.

### `execute_vaa_v1(vaa_body: Vec<u8>) -> Ix`
Returns the instruction for the Executor relayer to execute a VAA on this program.

## Events

### `GreetingSent`
```rust
pub struct GreetingSent {
    pub greeting: String,
    pub sequence: u64,
    pub timestamp: i64,
}
```

### `GreetingReceived`
```rust
pub struct GreetingReceived {
    pub greeting: String,
    pub sender_chain: u16,
    pub sender: [u8; 32],
    pub sequence: u64,
}
```

## Wormhole Chain IDs

| Chain | Wormhole ID |
|-------|-------------|
| Solana | 1 |
| Fogo | 51 |

## Program Addresses (Testnet)

| Program | Solana Devnet | Fogo Testnet |
|---------|---------------|--------------|
| Wormhole Core | `3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5` | `worm2mrQkG1B1KTz37erMfWN8anHkSK24nzca7UD8BB` |
| Executor | `execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYyuDRciV` | `execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYyuDRciV` |

## Executor Integration

The Executor service provides automatic relay of cross-chain messages. Key components:

1. **Relay Instructions**: Specifies compute units and lamports for execution
2. **Signed Quote**: Obtained from Executor API for pricing
3. **Automatic Relay**: Executor monitors for VAAs and relays to target chain

### Executor API

- Testnet (SDK base): `https://executor-testnet.labsapis.com/v0`
- `/v0/quote` - Get quote for relay
- `/v0/status/tx` - Check relay status

## Development

### Run Tests

```bash
# Unit tests (requires local validator with Wormhole)
anchor test

# E2E tests (requires deployed programs)
npm run e2e:test
```

### Build

```bash
anchor build
```

## Troubleshooting

### "constant_time_eq v0.4.2 requires edition2024"
Use the Cargo.lock from this project or copy from NTT. The project is configured for Solana 1.18.26.

### "Program already initialized"
This is expected on re-runs. The initialize instruction can only be called once per deployment.

### VAA not signing
On testnet, guardians may be slow. Wait a few minutes or check [Wormhole Scan](https://wormholescan.io).

## License

MIT
