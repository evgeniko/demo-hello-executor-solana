#!/usr/bin/env tsx
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const FOGO_RPC = 'https://testnet.fogo.io';
const PROGRAM_ID = new PublicKey('J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk');
const WORMHOLE_PROGRAM = new PublicKey('BhnQyKoQQgpuRTRo6D8Emz93PvXCYfVgHhnrR4T3qhw4');
const CHAIN_ID = 51; // Fogo
const KEYPAIR_PATH = path.join(process.env.HOME || '', '.config/solana/test-wallets/fogo-testnet.json');

function loadKeypair(): Keypair {
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function getDiscriminator(name: string): Buffer {
    const hash = createHash('sha256');
    hash.update(`global:${name}`);
    return Buffer.from(hash.digest().slice(0, 8));
}

async function main() {
    console.log('🚀 Initializing HelloExecutor on Fogo Testnet\n');
    
    const keypair = loadKeypair();
    const connection = new Connection(FOGO_RPC, 'confirmed');
    
    console.log('Wallet:', keypair.publicKey.toBase58());
    console.log('Balance:', (await connection.getBalance(keypair.publicKey)) / 1e9, 'FOGO');
    console.log('Program:', PROGRAM_ID.toBase58());
    console.log('Wormhole Core:', WORMHOLE_PROGRAM.toBase58());
    console.log('Chain ID:', CHAIN_ID);

    // Derive our program PDAs
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
    const [emitterPda] = PublicKey.findProgramAddressSync([Buffer.from('emitter')], PROGRAM_ID);
    
    // Derive Wormhole PDAs
    const [wormholeBridge] = PublicKey.findProgramAddressSync([Buffer.from('Bridge')], WORMHOLE_PROGRAM);
    const [wormholeFeeCollector] = PublicKey.findProgramAddressSync([Buffer.from('fee_collector')], WORMHOLE_PROGRAM);
    const [wormholeSequence] = PublicKey.findProgramAddressSync(
        [Buffer.from('Sequence'), emitterPda.toBuffer()], 
        WORMHOLE_PROGRAM
    );
    
    // Message account - PDA with seeds ["sent", sequence_number]
    // INITIAL_SEQUENCE is 1 (from wormhole SDK)
    const INITIAL_SEQUENCE = BigInt(1);
    const seqBytes = Buffer.alloc(8);
    seqBytes.writeBigUInt64LE(INITIAL_SEQUENCE);
    const [wormholeMessage] = PublicKey.findProgramAddressSync(
        [Buffer.from('sent'), seqBytes], 
        PROGRAM_ID
    );
    
    console.log('\nPDAs:');
    console.log('  Config:', configPda.toBase58());
    console.log('  Emitter:', emitterPda.toBase58());
    console.log('  Wormhole Bridge:', wormholeBridge.toBase58());
    console.log('  Wormhole Fee Collector:', wormholeFeeCollector.toBase58());
    console.log('  Wormhole Sequence:', wormholeSequence.toBase58());
    console.log('  Wormhole Message:', wormholeMessage.toBase58());

    // Check if already initialized
    const configAccount = await connection.getAccountInfo(configPda);
    if (configAccount) {
        console.log('\n✅ Already initialized!');
        return;
    }

    // Build initialize instruction
    const discriminator = getDiscriminator('initialize');
    const chainIdBuffer = Buffer.alloc(2);
    chainIdBuffer.writeUInt16LE(CHAIN_ID);
    const instructionData = Buffer.concat([discriminator, chainIdBuffer]);

    // Account order from the program:
    // 1. owner (signer, writable)
    // 2. config (writable)
    // 3. wormhole_program
    // 4. wormhole_bridge (writable)
    // 5. wormhole_fee_collector (writable)
    // 6. wormhole_emitter (writable)
    // 7. wormhole_sequence (writable)
    // 8. wormhole_message (writable, signer)
    // 9. clock
    // 10. rent
    // 11. system_program

    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },      // owner
            { pubkey: configPda, isSigner: false, isWritable: true },             // config
            { pubkey: WORMHOLE_PROGRAM, isSigner: false, isWritable: false },     // wormhole_program
            { pubkey: wormholeBridge, isSigner: false, isWritable: true },        // wormhole_bridge
            { pubkey: wormholeFeeCollector, isSigner: false, isWritable: true },  // wormhole_fee_collector
            { pubkey: emitterPda, isSigner: false, isWritable: true },            // wormhole_emitter
            { pubkey: wormholeSequence, isSigner: false, isWritable: true },      // wormhole_sequence
            { pubkey: wormholeMessage, isSigner: false, isWritable: true }, // wormhole_message
            { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },  // clock
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },   // rent
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    console.log('\nSending initialize transaction...');
    const tx = new Transaction().add(instruction);
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });
    
    console.log('\n🎉 Initialized!');
    console.log('TX:', sig);
}

main().catch(e => {
    console.error('❌ Error:', e.message);
    if (e.logs) e.logs.forEach((l: string) => console.error('  ', l));
});
