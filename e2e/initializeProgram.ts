#!/usr/bin/env tsx
/**
 * Initialize the HelloExecutor program on Solana
 */

import { 
    Connection, 
    Keypair, 
    PublicKey, 
    SystemProgram,
    SYSVAR_CLOCK_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const SOLANA_RPC = process.env.SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.HELLO_EXECUTOR_SOLANA || '5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp');
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || 
    path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');

// Wormhole chain ID for Solana
const CHAIN_ID_SOLANA = 1;

// Wormhole Core Bridge (Solana Devnet)
const WORMHOLE_PROGRAM = new PublicKey('3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5');

function loadKeypair(): Keypair {
    if (!fs.existsSync(KEYPAIR_PATH)) {
        throw new Error(`Keypair not found at ${KEYPAIR_PATH}`);
    }
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function deriveConfigPda(programId: PublicKey): PublicKey {
    const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        programId
    );
    return configPda;
}

function deriveEmitterPda(programId: PublicKey): PublicKey {
    const [emitterPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('emitter')],
        programId
    );
    return emitterPda;
}

function deriveWormholeBridge(wormholeProgram: PublicKey): PublicKey {
    const [bridgePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('Bridge')],
        wormholeProgram
    );
    return bridgePda;
}

function deriveWormholeFeeCollector(wormholeProgram: PublicKey): PublicKey {
    const [feeCollector] = PublicKey.findProgramAddressSync(
        [Buffer.from('fee_collector')],
        wormholeProgram
    );
    return feeCollector;
}

function deriveWormholeSequence(wormholeProgram: PublicKey, emitter: PublicKey): PublicKey {
    const [sequencePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('Sequence'), emitter.toBuffer()],
        wormholeProgram
    );
    return sequencePda;
}

function deriveMessagePda(programId: PublicKey, sequence: bigint): PublicKey {
    const sequenceBuffer = Buffer.alloc(8);
    sequenceBuffer.writeBigUInt64LE(sequence);
    const [messagePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('sent'), sequenceBuffer],
        programId
    );
    return messagePda;
}

// Anchor instruction discriminator for "initialize"
function getInitializeDiscriminator(): Buffer {
    const hash = createHash('sha256');
    hash.update('global:initialize');
    return Buffer.from(hash.digest().slice(0, 8));
}

async function main() {
    console.log('🚀 Initializing HelloExecutor on Solana Devnet\n');

    // Load keypair
    const keypair = loadKeypair();
    console.log(`Wallet: ${keypair.publicKey.toBase58()}`);

    // Connect
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Balance: ${balance / 1e9} SOL`);

    // Derive PDAs
    const configPda = deriveConfigPda(PROGRAM_ID);
    const emitterPda = deriveEmitterPda(PROGRAM_ID);
    const wormholeBridge = deriveWormholeBridge(WORMHOLE_PROGRAM);
    const wormholeFeeCollector = deriveWormholeFeeCollector(WORMHOLE_PROGRAM);
    const wormholeSequence = deriveWormholeSequence(WORMHOLE_PROGRAM, emitterPda);
    const wormholeMessage = deriveMessagePda(PROGRAM_ID, 1n);

    console.log(`\nPDAs:`);
    console.log(`  Program ID: ${PROGRAM_ID.toBase58()}`);
    console.log(`  Config: ${configPda.toBase58()}`);
    console.log(`  Emitter: ${emitterPda.toBase58()}`);
    console.log(`  Wormhole Bridge: ${wormholeBridge.toBase58()}`);
    console.log(`  Fee Collector: ${wormholeFeeCollector.toBase58()}`);
    console.log(`  Sequence: ${wormholeSequence.toBase58()}`);
    console.log(`  Message (seq 1): ${wormholeMessage.toBase58()}`);

    // Build instruction data
    // Format: [discriminator (8 bytes)][chain_id (2 bytes LE)]
    const discriminator = getInitializeDiscriminator();
    const chainIdBuffer = Buffer.alloc(2);
    chainIdBuffer.writeUInt16LE(CHAIN_ID_SOLANA);
    
    const instructionData = Buffer.concat([
        discriminator,
        chainIdBuffer,
    ]);

    console.log(`\nInstruction discriminator: ${discriminator.toString('hex')}`);

    // Build instruction
    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true }, // owner
            { pubkey: configPda, isSigner: false, isWritable: true }, // config
            { pubkey: WORMHOLE_PROGRAM, isSigner: false, isWritable: false }, // wormhole_program
            { pubkey: wormholeBridge, isSigner: false, isWritable: true }, // wormhole_bridge
            { pubkey: wormholeFeeCollector, isSigner: false, isWritable: true }, // wormhole_fee_collector
            { pubkey: emitterPda, isSigner: false, isWritable: true }, // wormhole_emitter
            { pubkey: wormholeSequence, isSigner: false, isWritable: true }, // wormhole_sequence
            { pubkey: wormholeMessage, isSigner: false, isWritable: true }, // wormhole_message
            { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // clock
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // rent
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    // Send transaction
    const transaction = new Transaction().add(instruction);

    try {
        console.log('\nSending transaction...');
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [keypair],
            { commitment: 'confirmed' }
        );

        console.log(`\n✅ Program initialized successfully!`);
        console.log(`Transaction: ${signature}`);
        console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    } catch (error: any) {
        if (error.message?.includes('already in use') || error.logs?.some((l: string) => l.includes('already in use'))) {
            console.log('\n⚠️  Program already initialized');
        } else {
            console.log('\n❌ Transaction failed');
            console.log('Error:', error.message);
            if (error.logs) {
                console.log('\nProgram logs:');
                error.logs.forEach((log: string) => console.log('  ', log));
            }
            throw error;
        }
    }
}

main().catch((error) => {
    console.error('\n❌ Error:', error.message || error);
    process.exit(1);
});
