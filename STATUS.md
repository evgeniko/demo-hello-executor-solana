# Cross-VM Demo Status - Solana Side

**Last Updated:** 2026-02-17 13:20 UTC

## Quick State (for context recovery)

```
WORKING:
  ✅ EVM → Solana (Sepolia → Solana Devnet)
  ✅ Solana → Fogo (Solana Devnet → Fogo Testnet)  
  ✅ Solana → EVM (VAAs signed, relay completing)
  
ALMOST DONE:
  ⏳ Fogo → Solana - Both instructions work! Need ~50 FOGO for relay cost
```

## Session Progress (2026-02-17)

### Completed Today
1. ✅ Fixed Fogo program config (wrong Wormhole addresses)
2. ✅ Added `update_wormhole_config` instruction
3. ✅ Converted `send_greeting` to raw CPI (cross-chain compatible)
4. ✅ Converted `request_relay` to use UncheckedAccount
5. ✅ Fixed UTF-8 byte length bug in autoRelay.ts
6. ✅ Fixed Wormhole instruction format (1-byte discriminator)
7. ✅ Fixed bridge fee offset (16-24)
8. ✅ Fixed sequence handling (current + 1)
9. ✅ Committed and pushed all changes

### Blocking Issue
- Fogo → Solana test needs ~50 FOGO (wallet has 11.4, needs 54)
- Wallet: `4VyQZpnMdUM59voCnCxsfNxkihPFFm57W3JWue8GHSzD`

## Fogo → Solana Test Output

```
✅ SendGreeting: SUCCESS
   - Wormhole post_message CPI works
   - Message posted with sequence 4
   
✅ RequestRelay: Executor CPI works  
   - But: Transfer failed - insufficient lamports
   - Has: 11,433,372,120 lamports
   - Needs: 53,946,464,281 lamports
```

## Key Technical Fixes

### 1. Wormhole SDK Workaround
The `wormhole-anchor-sdk` hardcodes program IDs. For cross-chain SVM support:
```rust
// Changed FROM (SDK validates program ID):
pub wormhole_program: Program<'info, Wormhole>,

// Changed TO (works on any chain):
pub wormhole_program: UncheckedAccount<'info>,
```

### 2. Raw CPI for Wormhole
```rust
// 1-byte instruction discriminator (not 8-byte Anchor)
ix_data.push(0x01); // PostMessage = 1

// Fee at offset 16-24 in bridge account
let fee = u64::from_le_bytes(bridge_data[16..24].try_into().unwrap());

// Sequence: current + 1 for next message
let sequence = current_seq + 1;
```

### 3. autoRelay.ts UTF-8 Fix
```typescript
// Wrong: message.length (JS string length)
// Right: Buffer.byteLength(message, 'utf-8')
```

## Deployed Contracts

| Chain | Address | Status |
|-------|---------|--------|
| Solana Devnet | `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp` | ✅ |
| Fogo Testnet | `J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk` | ✅ Fixed |

## Wormhole Addresses

| Chain | Program | Bridge PDA |
|-------|---------|------------|
| Solana Devnet | `3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5` | `6bi4JGDo...` |
| Fogo Testnet | `BhnQyKoQQgpuRTRo6D8Emz93PvXCYfVgHhnrR4T3qhw4` | `fZxfHeZR...` |

## Repos & Commits

| Repo | Latest Commit | Status |
|------|---------------|--------|
| evgeniko/demo-hello-executor-solana | `3642f52` | ✅ Pushed |
| evgeniko/demo-hello-executor | `36e2451` | ✅ Pushed (PR #2) |

## Next Steps

1. ⏳ Get ~50 FOGO to complete Fogo→Solana relay test
2. 📝 Verify full end-to-end flow
3. 📝 Update PR descriptions with final findings

## Notes for Future Sessions

- SDK workaround is intentional (not a bug to fix in demo)
- SDK fix would require wormhole-foundation discussion first
- All changes pushed to evgeniko repos only (per user request)
