#!/usr/bin/env tsx
/**
 * Send a greeting from Solana Devnet to Sepolia via Wormhole Executor
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

// Wormhole
const WORMHOLE_PROGRAM = new PublicKey('3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5');
const CHAIN_ID_SOLANA = 1;
const CHAIN_ID_SEPOLIA = 10002;

// Executor
const EXECUTOR_PROGRAM = new PublicKey('execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYyuDRciV');
const EXECUTOR_API = 'https://executor-testnet.labsapis.com/v0';

function loadKeypair(): Keypair {
    if (!fs.existsSync(KEYPAIR_PATH)) {
        throw new Error(`Keypair not found at ${KEYPAIR_PATH}`);
    }
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

// PDAs
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

// Discriminators
function getSendGreetingDiscriminator(): Buffer {
    const hash = createHash('sha256');
    hash.update('global:send_greeting');
    return Buffer.from(hash.digest().slice(0, 8));
}

// Get current sequence
async function getCurrentSequence(connection: Connection, sequencePda: PublicKey): Promise<bigint> {
    const accountInfo = await connection.getAccountInfo(sequencePda);
    if (!accountInfo) return 1n;
    return BigInt(accountInfo.data.readBigUInt64LE(0)) + 1n;
}

// Poll for VAA
async function pollForVAA(
    emitterChain: number,
    emitterAddress: string,
    sequence: number,
    timeoutMs: number = 120000
): Promise<any> {
    const startTime = Date.now();
    const baseUrl = 'https://api.testnet.wormholescan.io/api/v1/vaas';
    const paddedEmitter = emitterAddress.padStart(64, '0');
    const url = `${baseUrl}/${emitterChain}/${paddedEmitter}/${sequence}`;

    console.log(`\nPolling for VAA: ${url}`);

    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data: any = await response.json();
                if (data.data?.vaa) {
                    return data.data;
                }
            }
        } catch (e) {
            // Ignore errors, keep polling
        }
        await new Promise(r => setTimeout(r, 5000));
        process.stdout.write('.');
    }
    return null;
}

// Poll executor status
async function pollExecutorStatus(
    txHash: string,
    timeoutMs: number = 120000
): Promise<any> {
    const startTime = Date.now();
    const url = `${EXECUTOR_API}/status/tx?srcChain=Solana&txHash=${txHash}&env=Testnet`;

    console.log(`\nPolling executor status: ${url}`);

    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data: any = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    const status = data[0].status;
                    if (status === 'completed' || status === 'error' || status === 'underpaid') {
                        return data;
                    }
                }
            }
        } catch (e) {
            // Ignore, keep polling
        }
        await new Promise(r => setTimeout(r, 5000));
        process.stdout.write('*');
    }
    return null;
}

async function main() {
    console.log('🚀 Sending Greeting: Solana Devnet → Sepolia\n');

    const greeting = process.argv[2] || 'Hello from Solana! 🌊';
    console.log(`Message: "${greeting}"`);

    // Load keypair
    const keypair = loadKeypair();
    console.log(`\nWallet: ${keypair.publicKey.toBase58()}`);

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

    // Get current sequence
    const sequence = await getCurrentSequence(connection, wormholeSequence);
    const wormholeMessage = deriveMessagePda(PROGRAM_ID, sequence);

    console.log(`\nSequence: ${sequence}`);
    console.log(`Message PDA: ${wormholeMessage.toBase58()}`);

    // Build instruction data for send_greeting
    // Format: [discriminator (8 bytes)][string length (4 bytes LE)][string bytes]
    const discriminator = getSendGreetingDiscriminator();
    const greetingBytes = Buffer.from(greeting, 'utf-8');
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(greetingBytes.length);
    
    const instructionData = Buffer.concat([
        discriminator,
        lengthBuffer,
        greetingBytes,
    ]);

    // Build instruction
    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true }, // payer
            { pubkey: configPda, isSigner: false, isWritable: false }, // config
            { pubkey: WORMHOLE_PROGRAM, isSigner: false, isWritable: false }, // wormhole_program
            { pubkey: wormholeBridge, isSigner: false, isWritable: true }, // wormhole_bridge
            { pubkey: wormholeFeeCollector, isSigner: false, isWritable: true }, // wormhole_fee_collector
            { pubkey: emitterPda, isSigner: false, isWritable: true }, // wormhole_emitter
            { pubkey: wormholeSequence, isSigner: false, isWritable: true }, // wormhole_sequence
            { pubkey: wormholeMessage, isSigner: false, isWritable: true }, // wormhole_message
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
            { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // clock
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // rent
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    // Send transaction
    const transaction = new Transaction().add(instruction);

    console.log('\n📤 Sending greeting transaction...');
    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [keypair],
        { commitment: 'confirmed' }
    );

    console.log(`\n✅ Greeting sent!`);
    console.log(`Transaction: ${signature}`);
    console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    // Get emitter address in hex
    const emitterHex = Buffer.from(emitterPda.toBytes()).toString('hex');
    console.log(`\nEmitter: ${emitterHex}`);

    // Wait for VAA
    console.log('\n⏳ Waiting for VAA to be signed by Wormhole guardians...');
    const vaaData = await pollForVAA(CHAIN_ID_SOLANA, emitterHex, Number(sequence), 180000);

    if (vaaData) {
        console.log('\n\n✅ VAA signed!');
        console.log(`VAA ID: ${vaaData.id}`);
        console.log(`Timestamp: ${vaaData.timestamp}`);
    } else {
        console.log('\n\n⚠️  VAA not signed within timeout.');
        console.log('Check Wormhole Scan manually:');
        console.log(`https://testnet.wormholescan.io/#/tx/${signature}`);
    }

    // Poll executor status
    console.log('\n⏳ Waiting for Executor relay...');
    const executorStatus = await pollExecutorStatus(signature, 180000);

    if (executorStatus) {
        console.log('\n\n📊 Executor Status:');
        console.log(JSON.stringify(executorStatus, null, 2));
        
        const relay = executorStatus[0];
        if (relay?.status === 'completed') {
            console.log('\n🎉 SUCCESS! Message delivered to Sepolia!');
            console.log(`Destination TX: ${relay.txHash}`);
        } else if (relay?.status === 'underpaid') {
            console.log('\n❌ UNDERPAID - Need to send with Executor relay request');
        }
    } else {
        console.log('\n\n⚠️  Executor status not available within timeout.');
    }

    console.log('\n' + '='.repeat(60));
    console.log('Debug URLs:');
    console.log(`  Wormhole Scan: https://testnet.wormholescan.io/#/tx/${signature}`);
    console.log(`  Executor Explorer: https://wormholelabs-xyz.github.io/executor-explorer/#/tx/${signature}?endpoint=https%3A%2F%2Fexecutor-testnet.labsapis.com&env=Testnet`);
    console.log('='.repeat(60));
}

main().catch((error) => {
    console.error('\n❌ Error:', error.message || error);
    if (error.logs) {
        console.log('\nProgram logs:');
        error.logs.forEach((log: string) => console.log('  ', log));
    }
    process.exit(1);
});
