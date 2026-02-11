# Bug Report: Executor Testnet - Sepolia → Solana Relay Failure

## Summary
Executor relay from Sepolia to Solana fails during simulation with a spurious System Transfer that shouldn't exist for destination chain execution.

## Environment
- **Executor API:** `https://executor-testnet.labsapis.com/v0`
- **Source Chain:** Sepolia (10002)
- **Destination Chain:** Solana Devnet (1)
- **Quoter Address:** `0x5241c9276698439fef2780dbab76fec90b633fbd`
- **Source TX:** `0x6e1dc393dd8bfacc6216710eeb2687e714297a4ab66d94dfec96c818ae7d7950`

## Problem Description

### Expected Behavior
For Sepolia → Solana relay:
1. Payment occurs on Sepolia (source chain) during `requestExecution`
2. Off-chain relayer posts VAA to Solana Wormhole Core
3. Relayer executes the resolved instruction (`receive_greeting`)

No payment should occur on Solana - the relayer was already paid on Sepolia.

### Actual Behavior
The Executor simulation fails with a System Transfer on Solana:

```
InstructionError: [2, {"Custom": 1}]

Simulation logs:
  Program 3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5 invoke [1]    ← VAA posting
  ... (system program calls for account creation)
  Program 3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5 success       ← VAA posted OK!
  Program 11111111111111111111111111111111 invoke [1]                 ← Unexpected System Transfer
  Transfer: insufficient lamports 228303295604, need 228304481844    ← Fails here
  Program 11111111111111111111111111111111 failed: custom program error: 0x1
```

The transaction has 3 instructions:
- Instruction 0: (likely compute budget)
- Instruction 1: Wormhole VAA posting ✅ succeeds
- Instruction 2: System Transfer ❌ fails - **This shouldn't exist**

### Key Issues

#### Issue 1: Payee Address Format
The signed quote contains an EVM-format payee address:
```
payeeAddress: 0x0000000000000000000000004842781be7ba414c29029e6d7a70f6092e9d8beb
```

This is a 20-byte EVM address left-padded with zeros to 32 bytes. When interpreted as a Solana pubkey, it becomes:
```
11111111111121PXvQHDsJqV9CcDmptPEV7stSYA (invalid/garbage address)
```

#### Issue 2: Unexpected Payment on Destination Chain
According to the Executor design doc, payments happen on the **source chain** during `requestExecution`. There should be no payment transfer on Solana for inbound execution.

#### Issue 3: Incorrect Transfer Amount
The transfer is trying to move 228.3 SOL (228,304,481,844 lamports), which appears to be nearly the entire payer balance. This doesn't match:
- `baseFee`: 51,043
- `estimatedCost`: 5,104,320,716,039

## Reproduction

### 1. Request Execution from Sepolia
```bash
# Example source TX
0x6e1dc393dd8bfacc6216710eeb2687e714297a4ab66d94dfec96c818ae7d7950
```

### 2. Check Executor Status
```bash
curl -s -X POST "https://executor-testnet.labsapis.com/v0/status/tx" \
  -H "Content-Type: application/json" \
  -d '{"chainId": 10002, "txHash": "0x6e1dc393dd8bfacc6216710eeb2687e714297a4ab66d94dfec96c818ae7d7950"}'
```

### 3. Observe Failed Simulation
Status shows `aborted` with `svm_simulation_failed`.

## Questions for Wormhole Team

1. Why is the Executor adding a System Transfer on the destination chain? Payments should only occur on the source chain.

2. Is the testnet quoter (`0x5241c9...`) intended to support Solana destinations? Its payee address is EVM-format.

3. Is there a way to use a different quoter with a proper Solana payee address for Solana destinations?

## Workaround
Manual relay works correctly:
1. Post VAA using Certusone SDK
2. Call `receive_greeting` directly

Only automatic relay via Executor fails.

## Additional Context
- Solana → Sepolia relay works correctly (Executor properly handles EVM destinations)
- The resolver implementation returns correct instructions
- The VAA posting phase succeeds - only the spurious payment transfer fails

## Contact
Repository: https://github.com/evgeniko/demo-hello-executor-solana
Branch: `feat/executor-resolver-evm-to-solana`
