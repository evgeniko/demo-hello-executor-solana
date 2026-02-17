# Cross-VM Hello World with Wormhole Executor

Cross-chain messaging demo using Wormhole Executor for automatic relay between **Solana** and **EVM chains** (Sepolia).

## Status

| Route | Status | Notes |
|-------|--------|-------|
| EVM → Solana | ✅ Working | msgValue + API cost fixed |
| Solana → Fogo | ✅ Working | Peer registration + msgValue fixed |
| Solana → EVM | ⏳ Testing | VAAs signing, checking relay |
| Fogo → Solana | 🔧 Needs testing | SVM↔SVM route |

See [STATUS.md](./STATUS.md) for detailed findings on SVM↔SVM messaging.

## Quick Start

```bash
# Install
npm install

# Test Solana → Sepolia (works)
npx tsx e2e/sendWithRelay.ts "Hello from Solana!"
```

## Architecture

```
Solana Devnet                           Sepolia
┌────────────────┐                    ┌────────────────┐
│ HelloExecutor  │                    │ HelloWormhole  │
│    (Anchor)    │                    │   (Solidity)   │
└───────┬────────┘                    └───────▲────────┘
        │                                     │
        │ send_greeting()                     │ receiveMessage()
        ▼                                     │
┌────────────────┐                    ┌───────┴────────┐
│ Wormhole Core  │ ──── Guardians ──▶ │ Wormhole Core  │
└────────────────┘     sign VAA       └────────────────┘
        │                                     ▲
        │ request_relay()                     │
        ▼                                     │
┌────────────────┐                            │
│   Executor     │ ─────── relay ─────────────┘
└────────────────┘
```

## Deployed Contracts

| Chain | Address |
|-------|---------|
| Solana Devnet | `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp` |
| Sepolia | `0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c` |

## Key Files

```
programs/hello-executor/src/
├── lib.rs              # Entry point + Executor fallback handler
├── resolver.rs         # Executor resolver for EVM→Solana
└── instructions/
    ├── send_greeting.rs
    ├── receive_greeting.rs
    └── request_relay.rs

e2e/
├── sendWithRelay.ts    # Solana → Sepolia test
├── autoRelay.ts        # Solana ↔ Fogo test
└── config.ts           # Chain configuration
```

## Development

### Prerequisites

- Rust 1.75+, Solana CLI 1.18.26, Anchor 0.29.0
- Node.js 18+

### Build

```bash
anchor build
```

### Deploy

```bash
# Solana Devnet
solana config set --url devnet
anchor deploy --provider.cluster devnet
```

## Related

- **EVM Contract**: [demo-hello-executor PR #2](https://github.com/wormhole-foundation/demo-hello-executor/pull/2)
- **Bug Report**: [BUG_REPORT.md](./BUG_REPORT.md)
- **Wormhole Executor Docs**: [docs.wormhole.com](https://docs.wormhole.com)

## License

MIT
