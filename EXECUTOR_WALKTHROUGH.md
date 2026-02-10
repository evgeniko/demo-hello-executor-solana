# Wormhole Executor: Solana → Sepolia Walkthrough

This guide documents how to send cross-chain messages from Solana Devnet to Sepolia using the Wormhole Executor for automatic relay.

## Prerequisites

- Solana program deployed: `5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp`
- EVM contract deployed: `0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c`
- Funded wallets on both chains

## Key Concepts

### Wormhole Addresses
- **Program ID**: The Solana program address (`5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp`)
- **Emitter PDA**: The address that signs Wormhole messages, derived from the program
  - Seed: `["emitter"]`
  - Address: `DNmK1Red1aEtrkUhfniwpXzjxtnVjxeVeKUBtdM5vwkJ`
  - As bytes32: `0xb7df8ac821c5ff824eeb235f59153edf3f93b021d81150e1988884f9f450eeef`

### Important: Peer Registration
When registering peers, use the **emitter PDA** (not program ID) because:
- Wormhole messages are signed by the emitter PDA
- The receiving contract validates `emitterAddress` from the VAA against registered peers

## Setup Steps

### 1. Register Solana Emitter on EVM Contract

```bash
# The Solana emitter PDA (NOT program ID!)
SOLANA_EMITTER=0xb7df8ac821c5ff824eeb235f59153edf3f93b021d81150e1988884f9f450eeef

cast send $HELLO_WORMHOLE_SEPOLIA \
  "setPeer(uint16,bytes32)" \
  1 \  # Chain ID 1 = Solana
  $SOLANA_EMITTER \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY
```

### 2. Encode Relay Instructions Correctly

The executor expects relay instructions in a specific format. **Use the SDK's `serializeLayout`**:

```typescript
import { serializeLayout } from '@wormhole-foundation/sdk-connect';
import { relayInstructionsLayout } from '@wormhole-foundation/sdk-definitions';

function buildRelayInstructions(gasLimit: bigint, msgValue: bigint = 0n): Buffer {
    const encoded = serializeLayout(relayInstructionsLayout, {
        requests: [
            {
                request: {
                    type: "GasInstruction",
                    gasLimit,
                    msgValue,
                },
            },
        ],
    });
    return Buffer.from(encoded);
}

// Usage
const relayInstructions = buildRelayInstructions(300000n, 0n);
```

**DO NOT** manually encode like this (wrong format):
```typescript
// WRONG - don't do this!
const buf = Buffer.alloc(13);
buf.writeUInt8(0x01, 0);
buf.writeUInt32LE(gasLimit, 1);
buf.writeBigUInt64LE(msgValue, 5);
```

### 3. Send Message with Executor Relay

The Solana program needs two instructions in the same transaction:
1. `send_greeting` - Publishes the Wormhole message
2. `request_relay` - Requests executor to relay the message

```typescript
// Get quote from executor
const quote = await fetch('https://executor-testnet.labsapis.com/v0/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        srcChain: 1,      // Solana
        dstChain: 10002,  // Sepolia
        gasLimit: 300000,
    }),
}).then(r => r.json());

// Build relay instructions
const relayInstructions = buildRelayInstructions(300000n, 0n);

// Create transaction with both instructions
const transaction = new Transaction();
transaction.add(sendGreetingInstruction);
transaction.add(requestRelayInstruction);

// Send and confirm
const signature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
```

### 4. Monitor Relay Status

```typescript
const checkStatus = async (txHash: string) => {
    const response = await fetch('https://executor-testnet.labsapis.com/v0/status/tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chainId: 1,
            txHash,
        }),
    });
    return response.json();
};

// Poll until completed
let status;
do {
    await new Promise(r => setTimeout(r, 5000));
    const [result] = await checkStatus(signature);
    status = result?.status;
    console.log('Status:', status);
} while (status === 'pending' || status === 'submitted');
```

## Common Errors & Fixes

### Error: "Invalid argument type in ToBigInt operation"
**Cause**: Relay instructions encoded with wrong format (u32 instead of uint128)
**Fix**: Use SDK's `serializeLayout` instead of manual encoding

### Error: "receiveMessage reverted" (0x5bb2ebcc)
**Cause**: Wrong peer registered - using Program ID instead of Emitter PDA
**Fix**: Register the emitter PDA as peer on the EVM contract

### Error: "unsupported" status
**Cause**: Relay instructions completely wrong format
**Fix**: Ensure using SDK serialization with proper structure

## Useful Links

- Executor API: `https://executor-testnet.labsapis.com/v0`
- Wormholescan: `https://wormholescan.io`
- Executor Explorer: `https://wormholelabs-xyz.github.io/executor-explorer/`

## Verified Working Transaction

- Solana TX: `n3os7AF7TbTPM61UBu4K7doBzve3uLTPfzURVwTvVVRg8MSxJ4jgDSg938p2VrsHCvTg2C1V4srQVYSvA8hgFQX`
- Sepolia TX: `0xbc718df9dd92341afeea5bdff23d4ceb2171a4e578ba3d772c1d1048d329d85f`
- Message: "Peer fixed - should work now! 🚀"
