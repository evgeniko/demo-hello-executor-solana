/**
 * Cross-chain messaging functions for HelloExecutor
 */

import { PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import type { ChainConfig, SendGreetingResult } from './types.js';
import {
    getConnection,
    getProgram,
    deriveProgramAccounts,
    derivePeerPda,
    toUniversalAddress,
    toUniversalAddressHex,
    pollForVAA,
} from './utils.js';
import { getSignedQuotePayee, decodeSignedQuoteBytes } from './executor.js';
import { relayInstructionsToBytes } from './relay.js';

/**
 * Initialize the HelloExecutor program
 */
export async function initialize(
    chainCfg: ChainConfig & { wormholeCoreBridge: PublicKey }
): Promise<string> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Initializing HelloExecutor on ${chainCfg.chain}`);
    console.log(`${'='.repeat(60)}`);

    const program = getProgram(chainCfg);
    const accounts = deriveProgramAccounts(chainCfg.programId, chainCfg.wormholeCoreBridge);

    // Derive message account for initial sequence
    const [wormholeMessage] = PublicKey.findProgramAddressSync(
        [Buffer.from('sent'), Buffer.from([1, 0, 0, 0, 0, 0, 0, 0])], // sequence 1 in little-endian
        chainCfg.programId
    );

    console.log(`  Owner: ${chainCfg.keypair.publicKey.toBase58()}`);
    console.log(`  Config PDA: ${accounts.config.toBase58()}`);
    console.log(`  Emitter PDA: ${accounts.wormholeEmitter.toBase58()}`);

    const tx = await program.methods
        .initialize(chainCfg.wormholeChainId)
        .accounts({
            owner: chainCfg.keypair.publicKey,
            config: accounts.config,
            wormholeProgram: chainCfg.wormholeCoreBridge,
            wormholeBridge: accounts.wormholeBridge,
            wormholeFeeCollector: accounts.wormholeFeeCollector,
            wormholeEmitter: accounts.wormholeEmitter,
            wormholeSequence: accounts.wormholeSequence,
            wormholeMessage,
            clock: SYSVAR_CLOCK_PUBKEY,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
        })
        .rpc();

    console.log(`  Transaction: ${tx}`);
    return tx;
}

/**
 * Register a peer contract on another chain
 */
export async function registerPeer(
    chainCfg: ChainConfig & { wormholeCoreBridge: PublicKey },
    peerChainId: number,
    peerAddress: PublicKey
): Promise<string> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Registering peer on ${chainCfg.chain}`);
    console.log(`${'='.repeat(60)}`);

    const program = getProgram(chainCfg);
    const accounts = deriveProgramAccounts(chainCfg.programId, chainCfg.wormholeCoreBridge);
    const peerPda = derivePeerPda(chainCfg.programId, peerChainId);

    // Convert peer address to 32-byte array
    const peerAddressBytes = Array.from(toUniversalAddress(peerAddress));

    console.log(`  Peer chain: ${peerChainId}`);
    console.log(`  Peer address: ${peerAddress.toBase58()}`);
    console.log(`  Peer PDA: ${peerPda.toBase58()}`);

    const tx = await program.methods
        .registerPeer(peerChainId, peerAddressBytes)
        .accounts({
            owner: chainCfg.keypair.publicKey,
            config: accounts.config,
            peer: peerPda,
            systemProgram: SystemProgram.programId,
        })
        .rpc();

    console.log(`  Transaction: ${tx}`);
    return tx;
}

/**
 * Send a cross-chain greeting message
 */
export async function sendGreeting(
    fromConfig: ChainConfig & { wormholeCoreBridge: PublicKey },
    toConfig: ChainConfig,
    greeting: string
): Promise<SendGreetingResult> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Sending greeting: ${fromConfig.chain} -> ${toConfig.chain}`);
    console.log(`${'='.repeat(60)}`);

    const program = getProgram(fromConfig);
    const connection = getConnection(fromConfig);
    const accounts = deriveProgramAccounts(fromConfig.programId, fromConfig.wormholeCoreBridge);

    console.log(`\nSender: ${fromConfig.keypair.publicKey.toBase58()}`);
    console.log(`Source program: ${fromConfig.programId.toBase58()}`);
    console.log(`Target program: ${toConfig.programId.toBase58()}`);
    console.log(`Message: "${greeting}"`);

    // Get current sequence
    const sequenceAccount = await connection.getAccountInfo(accounts.wormholeSequence);
    let currentSequence = 1n;
    if (sequenceAccount) {
        // Sequence is stored as u64 at the beginning of the account
        currentSequence = BigInt(sequenceAccount.data.readBigUInt64LE(0)) + 1n;
    }

    console.log(`\nCurrent sequence: ${currentSequence}`);

    // Derive message account for this sequence
    const sequenceBuffer = Buffer.alloc(8);
    sequenceBuffer.writeBigUInt64LE(currentSequence);
    const [wormholeMessage] = PublicKey.findProgramAddressSync(
        [Buffer.from('sent'), sequenceBuffer],
        fromConfig.programId
    );

    // Send greeting
    console.log('\nSending greeting transaction...');

    const tx = await program.methods
        .sendGreeting(greeting)
        .accounts({
            payer: fromConfig.keypair.publicKey,
            config: accounts.config,
            wormholeProgram: fromConfig.wormholeCoreBridge,
            wormholeBridge: accounts.wormholeBridge,
            wormholeFeeCollector: accounts.wormholeFeeCollector,
            wormholeEmitter: accounts.wormholeEmitter,
            wormholeSequence: accounts.wormholeSequence,
            wormholeMessage,
            systemProgram: SystemProgram.programId,
            clock: SYSVAR_CLOCK_PUBKEY,
            rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

    console.log(`\nTransaction sent: ${tx}`);
    console.log(`Sequence: ${currentSequence}`);

    return {
        signature: tx,
        sequence: currentSequence,
    };
}

/**
 * Request Executor relay for the most recent message
 */
export async function requestRelay(
    fromConfig: ChainConfig & { wormholeCoreBridge: PublicKey; executorProgram: PublicKey },
    toConfig: ChainConfig,
    signedQuote: string,
    execAmount: bigint,
    relayInstructions: string
): Promise<string> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Requesting Executor relay: ${fromConfig.chain} -> ${toConfig.chain}`);
    console.log(`${'='.repeat(60)}`);

    const program = getProgram(fromConfig);
    const accounts = deriveProgramAccounts(fromConfig.programId, fromConfig.wormholeCoreBridge);
    const peerPda = derivePeerPda(fromConfig.programId, toConfig.wormholeChainId);

    const signedQuoteBytes = decodeSignedQuoteBytes(signedQuote);
    const payee = getSignedQuotePayee(signedQuoteBytes);
    const relayInstructionBytes = relayInstructionsToBytes(relayInstructions);

    const tx = await program.methods
        .requestRelay({
            dstChain: toConfig.wormholeChainId,
            execAmount: new BN(execAmount.toString()),
            signedQuoteBytes: Buffer.from(signedQuoteBytes),
            relayInstructions: Buffer.from(relayInstructionBytes),
        })
        .accounts({
            payer: fromConfig.keypair.publicKey,
            payee,
            config: accounts.config,
            peer: peerPda,
            wormholeEmitter: accounts.wormholeEmitter,
            wormholeProgram: fromConfig.wormholeCoreBridge,
            wormholeSequence: accounts.wormholeSequence,
            executorProgram: fromConfig.executorProgram,
            systemProgram: SystemProgram.programId,
        })
        .rpc();

    console.log(`\nExecutor request sent: ${tx}`);
    return tx;
}

/**
 * Wait for VAA to be signed by guardians
 */
export async function waitForVAA(
    chainConfig: ChainConfig,
    sequence: bigint,
    timeoutMs: number = 120000
): Promise<{ vaa: string; timestamp: string } | null> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Waiting for VAA signing`);
    console.log(`${'='.repeat(60)}`);

    // Get emitter address (the program's emitter PDA)
    const [emitterPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('emitter')],
        chainConfig.programId
    );
    const emitterAddress = toUniversalAddressHex(emitterPda);

    console.log(`  Emitter chain: ${chainConfig.wormholeChainId}`);
    console.log(`  Emitter address: ${emitterAddress}`);
    console.log(`  Sequence: ${sequence}`);

    return pollForVAA(
        chainConfig.wormholeChainId,
        emitterAddress,
        Number(sequence),
        'Testnet',
        timeoutMs
    );
}

/**
 * Check if a greeting has been received
 */
export async function checkGreetingReceived(
    chainCfg: ChainConfig & { wormholeCoreBridge: PublicKey },
    emitterChain: number,
    sequence: bigint
): Promise<boolean> {
    const connection = getConnection(chainCfg);

    // Derive the Received PDA
    const chainBuffer = Buffer.alloc(2);
    chainBuffer.writeUInt16LE(emitterChain);
    const sequenceBuffer = Buffer.alloc(8);
    sequenceBuffer.writeBigUInt64LE(sequence);

    const [receivedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('received'), chainBuffer, sequenceBuffer],
        chainCfg.programId
    );

    const accountInfo = await connection.getAccountInfo(receivedPda);
    return accountInfo !== null;
}

/**
 * Poll for greeting receipt on target chain
 */
export async function waitForReceipt(
    chainCfg: ChainConfig & { wormholeCoreBridge: PublicKey },
    emitterChain: number,
    sequence: bigint,
    timeoutMs: number = 120000
): Promise<boolean> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Waiting for greeting on ${chainCfg.chain}`);
    console.log(`${'='.repeat(60)}`);

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        const received = await checkGreetingReceived(chainCfg, emitterChain, sequence);
        if (received) {
            console.log('\nGreeting received!');
            return true;
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
        process.stdout.write('.');
    }

    console.log('\nTimeout waiting for greeting receipt');
    return false;
}
