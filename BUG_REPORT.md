# Executor Cross-VM Relay: EVM → Solana Issue

## Summary

Building a cross-VM HelloWorld using Executor to relay messages between Sepolia and Solana Devnet. **Automatic relay fails during Solana simulation** with an unexpected 228 SOL transfer.

## What Works ✅

- **Solana → Sepolia (auto-relay)**: Fully working
- **Sepolia → Solana (manual relay)**: Works when posting VAA + calling receive directly

| Direction | TX | Status |
|-----------|-----|--------|
| Solana→Sepolia | [Wormholescan](https://wormholescan.io/#/tx/0xbc718df9dd92341afeea5bdff23d4ceb2171a4e578ba3d772c1d1048d329d85f?network=Testnet) | ✅ Auto-relay works |
| Sepolia→Solana | [Solana TX](https://explorer.solana.com/tx/4ywCzfGMWjN7rMigKvkTAceXvZDAbyuxyLdVQXvZEeZuHDMJG5R6V38BPtjRNHmsh48rcTtsDpPuG2GkG9g2Pqq8?cluster=devnet) | ✅ Manual relay works |

## What Fails ❌

**Sepolia → Solana (auto-relay)**: Executor simulation fails.

- Sepolia TX: [`0x6e1dc39...`](https://sepolia.etherscan.io/tx/0x6e1dc393dd8bfacc6216710eeb2687e714297a4ab66d94dfec96c818ae7d7950)
- Executor status: `aborted` / `svm_simulation_failed`

### Simulation Error

```
Program 3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5 success    ← VAA posted OK
Program 11111111111111111111111111111111 invoke [1]              ← System Transfer
Transfer: insufficient lamports 228303295604, need 228304481844  ← FAILS
```

The VAA posts successfully, but then a System Transfer for **~228 SOL** fails. This amount doesn't match the quote's `baseFee` (51043 lamports) or `estimatedCost`.

### Executor Status

```bash
curl -s "https://executor-testnet.labsapis.com/v0/status/tx" \
  -H "Content-Type: application/json" \
  -d '{"chainId": 10002, "txHash": "0x6e1dc393dd8bfacc6216710eeb2687e714297a4ab66d94dfec96c818ae7d7950"}'
```

Returns `status: "aborted"`, `failureCause: "svm_simulation_failed"`.

## Questions

1. What is the ~228 SOL System Transfer for? It's not in our program.
2. Is EVM → Solana auto-relay supported on testnet?
3. Is additional configuration needed for cross-VM routes?

## Environment

| Component | Value |
|-----------|-------|
| Executor API | `executor-testnet.labsapis.com/v0` |
| Source | Sepolia (10002) |
| Destination | Solana Devnet (1) |
| Solana Program | `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp` |
| Sepolia Contract | `0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c` |

## Code

- **EVM Contract**: [PR #2](https://github.com/wormhole-foundation/demo-hello-executor/pull/2)
- **Solana Program**: This repo, branch `feat/executor-resolver-evm-to-solana`

Key files:
- `programs/hello-executor/src/resolver.rs` — Executor resolver
- `programs/hello-executor/src/lib.rs` — Fallback handler for Executor

## Reproduction

```bash
# 1. Clone and setup
git clone https://github.com/evgeniko/demo-hello-executor-solana.git
cd demo-hello-executor-solana
git checkout feat/executor-resolver-evm-to-solana
npm install

# 2. Send from Sepolia (triggers auto-relay)
# Use the EVM contract at 0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c

# 3. Check status
curl -s "https://executor-testnet.labsapis.com/v0/status/tx" \
  -H "Content-Type: application/json" \
  -d '{"chainId": 10002, "txHash": "<your-sepolia-tx>"}'
```

---

**Note**: We also tested Solana ↔ Fogo Testnet (SVM↔SVM). Similar issue — transactions submit but Executor doesn't complete relay. Fogo VAAs aren't being signed by guardians yet, suggesting the infrastructure isn't fully ready for Fogo.
