#!/usr/bin/env tsx
/**
 * Send a greeting from Solana Devnet → Sepolia via Wormhole Executor
 * 
 * Usage:
 *   npx tsx e2e/sendToSepolia.ts "Hello from Solana!"
 */

import { 
    Connection, 
    PublicKey, 
    SystemProgram,
    SYSVAR_CLOCK_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createHash } from 'crypto';

import {
    config,
    loadSolanaKeypair,
    CHAIN_ID_SOLANA,
    CHAIN_ID_SEPOLIA,
    EXECUTOR_API,
} from './config.js';

// ============================================================================
// PDA Derivations
// ============================================================================

function deriveConfigPda(programId: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
    return pda;
}

function deriveEmitterPda(programId: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('emitter')], programId);
    return pda;
}

function deriveWormholeBridge(wormholeProgram: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('Bridge')], wormholeProgram);
    return pda;
}

function deriveWormholeFeeCollector(wormholeProgram: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('fee_collector')], wormholeProgram);
    return pda;
}

function deriveWormholeSequence(wormholeProgram: PublicKey, emitter: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('Sequence'), emitter.toBuffer()],
        wormholeProgram
    );
    return pda;
}

function deriveMessagePda(programId: PublicKey, sequence: bigint): PublicKey {
    const sequenceBuffer = Buffer.alloc(8);
    sequenceBuffer.writeBigUInt64LE(sequence);
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('sent'), sequenceBuffer], programId);
    return pda;
}

// ============================================================================
// Helpers
// ============================================================================

function getSendGreetingDiscriminator(): Buffer {
    const hash = createHash('sha256');
    hash.update('global:send_greeting');
    return Buffer.from(hash.digest().slice(0, 8));
}

async function getCurrentSequence(connection: Connection, sequencePda: PublicKey): Promise<bigint> {
    const accountInfo = await connection.getAccountInfo(sequencePda);
    if (!accountInfo) return 1n;
    return BigInt(accountInfo.data.readBigUInt64LE(0)) + 1n;
}

async function pollForVAA(emitterChain: number, emitterAddress: string, sequence: number): Promise<any> {
    const baseUrl = 'https://api.testnet.wormholescan.io/api/v1/vaas';
    const paddedEmitter = emitterAddress.padStart(64, '0');
    const url = `${baseUrl}/${emitterChain}/${paddedEmitter}/${sequence}`;

    console.log(`\nPolling for VAA...`);

    for (let i = 0; i < 36; i++) { // 3 minutes max
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data: any = await response.json();
                if (data.data?.vaa) return data.data;
            }
        } catch {}
        await new Promise(r => setTimeout(r, 5000));
        process.stdout.write('.');
    }
    return null;
}

async function pollExecutorStatus(txHash: string): Promise<any> {
    const url = `${EXECUTOR_API}/status/tx?srcChain=Solana&txHash=${txHash}&env=Testnet`;

    console.log(`\nPolling executor status...`);

    for (let i = 0; i < 36; i++) { // 3 minutes max
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data: any = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    const status = data[0].status;
                    if (['completed', 'error', 'underpaid'].includes(status)) {
                        return data[0];
                    }
                }
            }
        } catch {}
        await new Promise(r => setTimeout(r, 5000));
        process.stdout.write('*');
    }
    return null;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    console.log('═'.repeat(60));
    console.log('  🌊 Solana Devnet → Sepolia');
    console.log('═'.repeat(60) + '\n');

    const greeting = process.argv[2] || 'Hello from Solana! 🌊';
    console.log(`Message: "${greeting}"`);

    // Load keypair
    const keypair = loadSolanaKeypair();
    console.log(`Wallet: ${keypair.publicKey.toBase58()}`);

    // Connect
    const connection = new Connection(config.solana.rpcUrl, 'confirmed');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Balance: ${balance / 1e9} SOL`);

    const programId = config.solana.programId;
    const wormholeProgram = config.solana.wormholeCoreBridge;

    // Derive PDAs
    const configPda = deriveConfigPda(programId);
    const emitterPda = deriveEmitterPda(programId);
    const wormholeBridge = deriveWormholeBridge(wormholeProgram);
    const wormholeFeeCollector = deriveWormholeFeeCollector(wormholeProgram);
    const wormholeSequence = deriveWormholeSequence(wormholeProgram, emitterPda);

    // Get current sequence
    const sequence = await getCurrentSequence(connection, wormholeSequence);
    const wormholeMessage = deriveMessagePda(programId, sequence);

    console.log(`\nSequence: ${sequence}`);

    // Build instruction
    const discriminator = getSendGreetingDiscriminator();
    const greetingBytes = Buffer.from(greeting, 'utf-8');
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(greetingBytes.length);
    
    const instructionData = Buffer.concat([discriminator, lengthBuffer, greetingBytes]);

    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: wormholeProgram, isSigner: false, isWritable: false },
            { pubkey: wormholeBridge, isSigner: false, isWritable: true },
            { pubkey: wormholeFeeCollector, isSigner: false, isWritable: true },
            { pubkey: emitterPda, isSigner: false, isWritable: true },
            { pubkey: wormholeSequence, isSigner: false, isWritable: true },
            { pubkey: wormholeMessage, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: programId,
        data: instructionData,
    });

    // Send
    console.log('\n📤 Sending transaction...');
    const signature = await sendAndConfirmTransaction(
        connection,
        new Transaction().add(instruction),
        [keypair],
        { commitment: 'confirmed' }
    );

    console.log(`\n✅ Transaction confirmed!`);
    console.log(`TX: ${signature}`);
    console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    // Wait for VAA
    const emitterHex = Buffer.from(emitterPda.toBytes()).toString('hex');
    const vaaData = await pollForVAA(CHAIN_ID_SOLANA, emitterHex, Number(sequence));

    if (vaaData) {
        console.log('\n\n✅ VAA signed!');
    } else {
        console.log('\n\n⚠️  VAA not signed within timeout');
    }

    // Poll executor status
    const status = await pollExecutorStatus(signature);

    if (status?.status === 'completed') {
        console.log('\n\n🎉 SUCCESS! Message delivered to Sepolia!');
        console.log(`Destination TX: ${status.txHash}`);
    } else if (status) {
        console.log(`\n\n⚠️  Executor status: ${status.status}`);
    }

    console.log('\n' + '─'.repeat(60));
    console.log('Links:');
    console.log(`  Wormhole: https://testnet.wormholescan.io/#/tx/${signature}`);
    console.log(`  Executor: https://wormholelabs-xyz.github.io/executor-explorer/#/tx/${signature}?endpoint=https%3A%2F%2Fexecutor-testnet.labsapis.com&env=Testnet`);
}

main().catch((error) => {
    console.error('\n❌ Error:', error.message || error);
    process.exit(1);
});
