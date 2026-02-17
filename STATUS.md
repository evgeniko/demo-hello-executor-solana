# Cross-VM Demo Status - Solana Side

**Last Updated:** 2026-02-17 13:15 UTC

## Quick State

```
WORKING:
  ✅ EVM → Solana (Sepolia → Solana Devnet)
  ✅ Solana → Fogo (Solana Devnet → Fogo Testnet)
  ✅ Solana → EVM (VAAs signed, relay in progress)
  
IN PROGRESS:
  ⏳ Fogo → Solana (send_greeting + request_relay work, needs more FOGO for relay cost)
```

## Recent Fixes (2026-02-17)

### 1. Fogo Program Config Fixed
- Deployed `update_wormhole_config` instruction
- Updated bridge and fee_collector to correct Fogo Wormhole addresses

### 2. Raw CPI for Wormhole (cross-chain compatible)
Changed `send_greeting` to use raw CPI instead of wormhole-anchor-sdk:
- Removed `Program<'info, Wormhole>` validation (hardcodes program ID)
- Use `UncheckedAccount` for wormhole accounts
- 1-byte instruction discriminator (not 8-byte Anchor)
- Manual fee reading from bridge account (offset 16-24)
- Proper sequence handling (current + 1)

### 3. Fixed request_relay
- Removed wormhole SDK dependency
- Use `UncheckedAccount` for wormhole_program
- Manual sequence reading

### 4. UTF-8 byte length fix in autoRelay.ts
- JS `message.length` ≠ UTF-8 byte length for emojis
- Now uses `Buffer.byteLength(message, 'utf-8')`

## Fogo → Solana Test Results

```
✅ send_greeting: SUCCESS
   - Wormhole post_message CPI works
   - Sequence: 4
   
✅ request_relay: Executor CPI works
   - But: insufficient lamports (11.4 vs 54 FOGO needed)
```

## Deployed Contracts

| Chain | Address | Status |
|-------|---------|--------|
| Solana Devnet | `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp` | ✅ Working |
| Fogo Testnet | `J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk` | ✅ Fixed |

## Wormhole Addresses

### Fogo Testnet
- Program: `BhnQyKoQQgpuRTRo6D8Emz93PvXCYfVgHhnrR4T3qhw4`
- Bridge: `fZxfHeZRMLU6paNA2QjqygNSu53Euvds3jaeD1Kakkg`
- Fee Collector: `28B5zG1V6L4SSi5CPjWMRPTVCmVMG89zk37maZqQpZnU`

### Solana Devnet
- Program: `3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5`

## Key Code Changes

### send_greeting.rs
```rust
// 1-byte Wormhole instruction discriminator
ix_data.push(0x01); // PostMessage

// Fee at offset 16-24 in bridge account
let fee = u64::from_le_bytes(bridge_data[16..24].try_into().unwrap());

// Use next sequence (current + 1)
let sequence = current_seq + 1;
```

### request_relay.rs
```rust
// Manual sequence reading
let sequence = u64::from_le_bytes(seq_data[0..8].try_into().unwrap());
```

### autoRelay.ts
```typescript
// Use byte length, not string length
const len = Buffer.byteLength(message, 'utf-8');
```

## Next Steps

1. ⏳ Fund wallet with ~50 more FOGO to complete Fogo→Solana test
2. 📝 Commit all fixes to repo
3. 📝 Update PR with final status
