# Wormhole Executor: EVM → Solana Implementation

## Summary

This document describes the implementation of the Wormhole Executor resolver for receiving cross-chain messages from EVM chains (Sepolia) to Solana.

## Status

- ✅ **Discriminator**: Correctly implemented (`94b8a9decf089a7f`)
- ✅ **Resolver**: Called successfully by Executor
- ⚠️ **Relay**: Returns "unsupported" status - may require Wormhole team confirmation

## Implementation Details

### Executor Resolver Interface

The Wormhole Executor calls Solana programs with a specific discriminator to resolve the instructions needed to execute a VAA.

**Discriminator**: `[148, 184, 169, 222, 207, 8, 154, 127]`
- Computed from: `SHA256("executor-account-resolver:execute-vaa-v1")[0..8]`
- Hex: `94b8a9decf089a7f`

**Reference**: https://github.com/wormholelabs-xyz/executor-account-resolver-svm

### Key Files

1. **`programs/hello-executor/src/resolver.rs`**
   - Defines Executor resolver types (manually, since crate requires Rust 2024)
   - `Resolver<InstructionGroups>` - return type
   - `SerializableInstruction` - instruction format
   - `RESOLVER_PUBKEY_PAYER` - placeholder for executor's payer

2. **`programs/hello-executor/src/lib.rs`**
   - `fallback` function catches Executor's discriminator
   - Routes to resolver handler

### How It Works

1. EVM contract sends message via Wormhole with Executor relay
2. Executor picks up the VAA request (ERV1 format)
3. Executor calls Solana program with resolver discriminator
4. Program returns `InstructionGroups` containing `receive_greeting` instruction
5. Executor executes the returned instructions

### Current Issue

The resolver is called and returns valid data, but Executor shows "unsupported" status:

```
Status: unsupported
FailureCause: None
```

**Possible causes**:
1. ERV1 to Solana for custom messaging may not be fully supported
2. Specific relay instruction format may be required
3. Program registration with Executor may be needed

### Test Transactions

**Sepolia → Solana (unsupported)**:
- TX: `0xd0e14285f0541d48032cf0eb7b41a993920052f63133aab3cfdbb07d628ee015`
- Wormholescan: https://wormholescan.io/#/tx/0xd0e14285f0541d48032cf0eb7b41a993920052f63133aab3cfdbb07d628ee015?network=Testnet

**Solana → Sepolia (working)**:
- Documented in `EXECUTOR_WALKTHROUGH.md`

## Questions for Wormhole Team

1. Is ERV1 to Solana destinations supported for custom messaging programs (not just NTT)?
2. We implemented `resolve_execute_vaa_v1` with discriminator `94b8a9decf089a7f`, resolver returns valid `InstructionGroups`, but status shows "unsupported" - what's missing?
3. Is there program registration required with the Executor service?
4. Are there any additional relay instruction formats or accounts needed?

## Code References

### Discriminator Handling (lib.rs)

```rust
pub fn fallback<'info>(
    program_id: &Pubkey,
    accounts: &'info [AccountInfo<'info>],
    data: &[u8],
) -> Result<()> {
    // Executor resolver discriminator
    const EXECUTOR_DISCRIMINATOR: [u8; 8] = [148, 184, 169, 222, 207, 8, 154, 127];

    if data.len() >= 8 && data[..8] == EXECUTOR_DISCRIMINATOR {
        msg!("Executor resolver call detected");
        return resolver::handle_resolve_raw(program_id, accounts, &data[8..]);
    }

    Err(anchor_lang::error::ErrorCode::InstructionFallbackNotFound.into())
}
```

### Resolver Return Format (resolver.rs)

```rust
Ok(Resolver::Resolved(InstructionGroups(vec![InstructionGroup {
    instructions: vec![instruction],
    address_lookup_tables: vec![],
}])))
```

## Next Steps

1. Get confirmation from Wormhole team on ERV1 → Solana support
2. If supported, identify missing configuration or format
3. If not supported, document limitation and use Solana → EVM direction
