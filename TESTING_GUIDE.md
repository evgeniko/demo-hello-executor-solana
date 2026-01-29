# Testing Guide (Delete After Testing)

> NOTE: This file is temporary and should be deleted after testing is complete.

This guide explains how to test the SVM Executor flow on Solana Devnet and Fogo Testnet.

## Prerequisites

- Solana CLI
- Anchor CLI
- Node.js + npm
- Two funded keypairs (Solana Devnet + Fogo Testnet)

## 1) Fund wallets

Solana Devnet (free):

```bash
solana airdrop 2
```

Fogo Testnet (via faucet):

- Use the faucet at `https://fogoacademy.tech/testnet/`

## 2) Configure RPCs

Solana Devnet:

```bash
solana config set --url devnet
```

Fogo Testnet:

```bash
solana config set --url https://testnet.fogo.io
```

## 3) Deploy program to both chains

```bash
# Solana Devnet
anchor deploy --provider.cluster devnet

# Fogo Testnet
anchor deploy --provider.cluster https://testnet.fogo.io
```

Record the program IDs for each deployment.

## 4) Configure environment

Create `e2e/.env` based on `e2e/.env.example` and set:

```bash
PRIVATE_KEY_SOLANA=...
PRIVATE_KEY_FOGO=...
SOLANA_DEVNET_RPC=https://api.devnet.solana.com
FOGO_TESTNET_RPC=https://testnet.fogo.io
HELLO_EXECUTOR_SOLANA=<devnet program id>
HELLO_EXECUTOR_FOGO=<fogo program id>
```

## 5) Run tests

```bash
npm run e2e:test
```

The script will:

1) initialize the program on Solana
2) register the Fogo peer
3) send a greeting
4) request Executor relay (on-chain)
5) wait for VAA signing
6) poll Executor status
7) check receipt on Fogo

## Troubleshooting

- If `anchor build` fails due to network resolution, retry on a machine with access to `index.crates.io`.
- If you get `QuotePayeeMismatch` or `QuoteExpired`, re-request a quote and ensure you submit the request promptly.

