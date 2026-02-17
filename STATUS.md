# Cross-VM Demo Status - Solana Side

**Last Updated:** 2026-02-17 13:00 UTC

## Quick State (for context recovery)

```
WORKING:
  ✅ EVM → Solana (Sepolia → Solana Devnet)
  ✅ Solana → Fogo (Solana Devnet → Fogo Testnet)
  
TESTING:
  ⏳ Solana → EVM (VAAs signed, checking relay)
  
BLOCKED:
  ❌ Fogo → Solana (program config has wrong Wormhole addresses)
```

## Fogo Program Issue

The HelloExecutor on Fogo (`J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk`) was initialized with WRONG Wormhole addresses:

| Field | Config has (WRONG) | Should be |
|-------|-------------------|-----------|
| bridge | `4S5px5pc8WGq...` | `fZxfHeZRMLU6pa...` |
| fee_collector | `FPHWiBGkRmXD...` | `28B5zG1V6L4SSi...` |

**Fix needed:** Deploy program update with `update_wormhole_config` instruction.
**Blocker:** Need ~1.5 more FOGO (wallet has 1.45, need ~2.9 for deploy).

Wallet: `4VyQZpnMdUM59voCnCxsfNxkihPFFm57W3JWue8GHSzD`

## Key Findings - SVM↔SVM Messaging

### 1. Peer Registration (Asymmetric!)
- **Source chain:** Register destination **PROGRAM** (for routing)
- **Dest chain:** Register source **EMITTER** (for VAA verification)

Different from EVM↔EVM where same address on both sides.

### 2. msgValue for SVM Destinations
```typescript
const SVM_MSG_VALUE_LAMPORTS = 15_000_000n; // ~0.015 SOL for rent/fees
```

### 3. Cost Calculation
```typescript
const cost = quote.estimatedCost + msgValue;
```

### 4. Executor Program
Same address on both Solana Devnet and Fogo Testnet:
```
execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYuDRciV
```

## Deployed Contracts

| Chain | Address | Status |
|-------|---------|--------|
| Solana Devnet | `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp` | ✅ Working |
| Fogo Testnet | `J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk` | ❌ Bad config |

## Repos & PRs

| Repo | URL | Status |
|------|-----|--------|
| EVM | [wormhole-foundation/demo-hello-executor#2](https://github.com/wormhole-foundation/demo-hello-executor/pull/2) | PR open |
| Solana | [evgeniko/demo-hello-executor-solana](https://github.com/evgeniko/demo-hello-executor-solana) | Changes on main |

## Local Files

- `e2e/autoRelay.ts` - Combined script for both directions
- `e2e/fixFogoPeer*.ts` - Peer registration fix scripts
- `programs/hello-executor/src/instructions/update_config.rs` - NEW (not committed)

## Wormhole Addresses

### Solana Devnet
- Program: `3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5`
- Bridge PDA: `6bi4JGDoRwUs9TYBuvoA7dUVyikTJDrJsJU1ew6KVLiu`

### Fogo Testnet
- Program: `BhnQyKoQQgpuRTRo6D8Emz93PvXCYfVgHhnrR4T3qhw4`
- Bridge PDA: `fZxfHeZRMLU6paNA2QjqygNSu53Euvds3jaeD1Kakkg`
- Fee Collector: `28B5zG1V6L4SSi5CPjWMRPTVCmVMG89zk37maZqQpZnU`

## Next Steps

1. ⏳ Get FOGO tokens to deploy program fix
2. ⏳ Test Fogo → Solana after fix
3. 📝 Update PR #2 with findings
