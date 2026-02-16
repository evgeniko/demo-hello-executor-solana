#!/usr/bin/env tsx
/**
 * Test: Send greeting from Solana Devnet → Fogo Testnet
 */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const SOLANA_RPC = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp');
const WORMHOLE_PROGRAM = new PublicKey('3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5');
const TARGET_CHAIN = 51; // Fogo
const KEYPAIR_PATH = path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');

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
    const greeting = process.argv[2] || 'Hello Fogo from Solana! 🌉';
    console.log(`🚀 Sending Greeting: Solana → Fogo\n`);
    console.log(`Message: "${greeting}"`);
    
    const keypair = loadKeypair();
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    
    console.log(`\nWallet: ${keypair.publicKey.toBase58()}`);
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Balance: ${balance / 1e9} SOL`);
    
    // Derive PDAs
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
    const [emitterPda] = PublicKey.findProgramAddressSync([Buffer.from('emitter')], PROGRAM_ID);
    const [wormholeBridge] = PublicKey.findProgramAddressSync([Buffer.from('Bridge')], WORMHOLE_PROGRAM);
    const [wormholeFeeCollector] = PublicKey.findProgramAddressSync([Buffer.from('fee_collector')], WORMHOLE_PROGRAM);
    const [wormholeSequence] = PublicKey.findProgramAddressSync(
        [Buffer.from('Sequence'), emitterPda.toBuffer()], 
        WORMHOLE_PROGRAM
    );
    
    // Get current sequence to derive message PDA
    const seqAccount = await connection.getAccountInfo(wormholeSequence);
    let sequence = BigInt(1); // Default
    if (seqAccount) {
        // Sequence is stored as u64 at offset 0
        sequence = seqAccount.data.readBigUInt64LE(0) + BigInt(1);
    }
    
    const seqBytes = Buffer.alloc(8);
    seqBytes.writeBigUInt64LE(sequence);
    const [wormholeMessage] = PublicKey.findProgramAddressSync(
        [Buffer.from('sent'), seqBytes],
        PROGRAM_ID
    );
    
    // Derive peer PDA for target chain
    const chainBuffer = Buffer.alloc(2);
    chainBuffer.writeUInt16LE(TARGET_CHAIN);
    const [peerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('peer'), chainBuffer],
        PROGRAM_ID
    );
    
    console.log(`\nSequence: ${sequence}`);
    console.log(`Target chain: ${TARGET_CHAIN} (Fogo)`);
    console.log(`Peer PDA: ${peerPda.toBase58()}`);
    
    // Build send_greeting instruction
    const discriminator = getDiscriminator('send_greeting');
    const greetingBytes = Buffer.from(greeting, 'utf-8');
    const greetingLen = Buffer.alloc(4);
    greetingLen.writeUInt32LE(greetingBytes.length);
    const instructionData = Buffer.concat([discriminator, greetingLen, greetingBytes]);
    
    // Account order from SendGreeting struct
    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },     // payer
            { pubkey: configPda, isSigner: false, isWritable: false },           // config
            { pubkey: WORMHOLE_PROGRAM, isSigner: false, isWritable: false },    // wormhole_program
            { pubkey: wormholeBridge, isSigner: false, isWritable: true },       // wormhole_bridge
            { pubkey: wormholeFeeCollector, isSigner: false, isWritable: true }, // wormhole_fee_collector
            { pubkey: emitterPda, isSigner: false, isWritable: false },          // wormhole_emitter
            { pubkey: wormholeSequence, isSigner: false, isWritable: true },     // wormhole_sequence
            { pubkey: wormholeMessage, isSigner: false, isWritable: true },      // wormhole_message
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
            { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }, // clock
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },  // rent
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });
    
    console.log(`\nSending transaction...`);
    const tx = new Transaction().add(instruction);
    
    try {
        const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });
        console.log(`\n🎉 Greeting sent!`);
        console.log(`TX: ${sig}`);
        console.log(`Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
        console.log(`\nMessage will be relayed to Fogo (chain ${TARGET_CHAIN})`);
    } catch (e: any) {
        console.error(`\n❌ Error:`, e.message);
        if (e.logs) e.logs.forEach((l: string) => console.error('  ', l));
    }
}

main().catch(console.error);
