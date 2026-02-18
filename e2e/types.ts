/**
 * Type definitions for cross-chain E2E tests
 */

import { Keypair, PublicKey } from '@solana/web3.js';

export interface ChainConfig {
    chain: string;
    network: 'Testnet' | 'Mainnet';
    rpcUrl: string;
    keypair: Keypair;
    programId: PublicKey;
    wormholeChainId: number;
}

export interface ExecutorQuote {
    signedQuote: string;
    estimatedCost: string;
    parsedQuote?: {
        baseFee: bigint;
        dstGasPrice: bigint;
        srcPrice: bigint;
        dstPrice: bigint;
    };
}

export interface ExecutorStatus {
    status: 'pending' | 'submitted' | 'completed' | 'aborted' | 'underpaid';
    txHash?: string;
    failureCause?: string;
    txs?: Array<{ txHash: string }>;
}
