/**
 * Type definitions for Wormhole Executor SVM integration
 */

import type { Network, Chain } from '@wormhole-foundation/sdk-base';
import type { Keypair, PublicKey } from '@solana/web3.js';

export interface ChainConfig {
    chain: Chain;
    network: Network;
    rpcUrl: string;
    keypair: Keypair;
    programId: PublicKey;
    wormholeChainId: number;
}

export interface ExecutorQuoteParams {
    srcChain: number;
    dstChain: number;
    relayInstructions?: string;
}

export interface ExecutorQuote {
    signedQuote: string;
    estimatedCost?: string;
}

export interface ExecutorCapabilities {
    requestPrefixes: string[];
    gasDropOffLimit?: string;
    maxGasLimit?: string;
    maxMsgValue?: string;
}

export interface SendGreetingResult {
    signature: string;
    sequence: bigint;
}

export interface VAAData {
    vaa: string;
    timestamp: string;
}

export interface ProgramAccounts {
    config: PublicKey;
    wormholeEmitter: PublicKey;
    wormholeBridge: PublicKey;
    wormholeFeeCollector: PublicKey;
    wormholeSequence: PublicKey;
}
