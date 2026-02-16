# Executor Cross-VM: EVM → Solana Relay Issue

## Goal
Building a cross-VM HelloWorld using Executor to relay messages between Sepolia (EVM) and Solana Devnet.

## What Works ✅

**Solana → Sepolia (automatic relay):** Fully working!
- Solana TX: `n3os7AF7TbTPM61UBu4K7doBzve3uLTPfzURVwTvVVRg8MSxJ4jgDSg938p2VrsHCvTg2C1V4srQVYSvA8hgFQX`
- Sepolia TX: `0xbc718df9dd92341afeea5bdff23d4ceb2171a4e578ba3d772c1d1048d329d85f`
- [Wormholescan](https://wormholescan.io/#/tx/0xbc718df9dd92341afeea5bdff23d4ceb2171a4e578ba3d772c1d1048d329d85f?network=Testnet)

**Manual relay (Sepolia → Solana):** Also works!
- Post VAA via Certusone SDK + call `receive_greeting` directly → succeeds

**Resolver is working:** The Executor successfully calls our Solana resolver and receives valid instructions back. The failure occurs *after* the resolver returns.

## What Fails ❌

**Sepolia → Solana (automatic Executor relay):** Fails during Solana simulation.
- Sepolia TX: `0x6e1dc393dd8bfacc6216710eeb2687e714297a4ab66d94dfec96c818ae7d7950`
- [Etherscan](https://sepolia.etherscan.io/tx/0x6e1dc393dd8bfacc6216710eeb2687e714297a4ab66d94dfec96c818ae7d7950)
- Executor status: `aborted` / `svm_simulation_failed`

## Failure Analysis

### Execution Flow
1. ✅ Sepolia TX succeeds — message published, Executor payment made
2. ✅ Executor calls our Solana resolver — returns correct `receive_greeting` instruction
3. ✅ Executor posts VAA to Wormhole Core Bridge on Solana — succeeds
4. ❌ A System Program transfer for ~228 SOL fails with insufficient lamports

### Simulation Logs
```
Program 3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5 invoke [1]
Program 11111111111111111111111111111111 invoke [2]
Program 11111111111111111111111111111111 success
Program 11111111111111111111111111111111 invoke [2]
Program 11111111111111111111111111111111 success
Program 11111111111111111111111111111111 invoke [2]
Program 11111111111111111111111111111111 success
Program 3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5 consumed 12816 of 206000 compute units
Program 3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5 success    ← VAA posted
Program 11111111111111111111111111111111 invoke [1]              ← System Transfer
Transfer: insufficient lamports 228303295604, need 228304481844  ← Fails here
Program 11111111111111111111111111111111 failed: custom program error: 0x1
```

### Executor Status Response
```json
{
  "status": "aborted",
  "failureCause": "svm_simulation_failed",
  "signedQuote": {
    "quote": {
      "quoterAddress": "0x5241c9276698439fef2780dbab76fec90b633fbd",
      "payeeAddress": "0x0000000000000000000000004842781be7ba414c29029e6d7a70f6092e9d8beb",
      "srcChain": 10002,
      "dstChain": 1,
      "baseFee": "51043",
      "estimatedCost": "5104320716039"
    }
  }
}
```

### Observations
- The VAA posting succeeds (instruction 1)
- The failure is a System Transfer (instruction 2) trying to move 228.3 SOL
- The `payeeAddress` in the quote is an EVM-format address (20 bytes, zero-padded to 32)
- The transfer amount (228 SOL) doesn't match `baseFee` (51043 lamports) or `estimatedCost`

## Check Status
```bash
curl -s -X POST "https://executor-testnet.labsapis.com/v0/status/tx" \
  -H "Content-Type: application/json" \
  -d '{"chainId": 10002, "txHash": "0x6e1dc393dd8bfacc6216710eeb2687e714297a4ab66d94dfec96c818ae7d7950"}'
```

## Questions

1. Is EVM → Solana automatic relay supported on testnet?
2. What is the System Transfer in instruction 2 for, and why ~228 SOL?
3. Should the quoter/payee be different for Solana destinations?
4. Is there additional configuration needed for cross-VM (EVM → SVM) routes?

## Environment

| Component | Value |
|-----------|-------|
| Executor API | `https://executor-testnet.labsapis.com/v0` |
| Source Chain | Sepolia (10002) |
| Destination Chain | Solana Devnet (1) |
| Solana Program | `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp` |
| Sepolia Contract | `0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c` |
| Wormhole Core (Solana) | `3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5` |

## Code

**EVM Contract (sender):**
- PR: https://github.com/wormhole-foundation/demo-hello-executor/pull/2
- [`HelloWormhole.sol`](https://github.com/wormhole-foundation/demo-hello-executor/blob/main/src/HelloWormhole.sol) — uses `ExecutorSendReceiveQuoteOffChain`

**Solana Program (resolver + receiver):**
- Repo: https://github.com/evgeniko/demo-hello-executor-solana/tree/feat/executor-resolver-evm-to-solana
- [`resolver.rs`](https://github.com/evgeniko/demo-hello-executor-solana/blob/feat/executor-resolver-evm-to-solana/programs/hello-executor/src/resolver.rs) — Executor resolver implementation
- [`lib.rs`](https://github.com/evgeniko/demo-hello-executor-solana/blob/feat/executor-resolver-evm-to-solana/programs/hello-executor/src/lib.rs) — fallback handler for Executor discriminator
