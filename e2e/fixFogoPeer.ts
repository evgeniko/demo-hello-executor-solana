#!/usr/bin/env tsx
/**
 * Fix Fogo peer registration on Solana
 * Register the PROGRAM ID (not emitter) so Executor can call resolver
 */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const SOLANA_PROGRAM = new PublicKey('5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp');
const FOGO_PROGRAM = new PublicKey('J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk');
const SOLANA_RPC = 'https://api.devnet.solana.com';
const KEYPAIR_PATH = path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');
const CHAIN_ID_FOGO = 51;

function loadKeypair(): Keypair {
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function getDiscriminator(name: string): Buffer {
    const hash = createHash('sha256');
    hash.update('global:' + name);
    return Buffer.from(hash.digest().slice(0, 8));
}

async function main() {
    console.log('🔧 Fixing Fogo peer on Solana\n');
    console.log('Registering PROGRAM ID instead of emitter PDA');
    console.log('Fogo Program:', FOGO_PROGRAM.toBase58());
    console.log('As bytes32:', Buffer.from(FOGO_PROGRAM.toBytes()).toString('hex'));
    
    const keypair = loadKeypair();
    console.log('\nWallet:', keypair.publicKey.toBase58());
    
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    
    // Derive PDAs
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], SOLANA_PROGRAM);
    const chainBuffer = Buffer.alloc(2);
    chainBuffer.writeUInt16LE(CHAIN_ID_FOGO);
    const [peerPda] = PublicKey.findProgramAddressSync([Buffer.from('peer'), chainBuffer], SOLANA_PROGRAM);
    
    console.log('Config PDA:', configPda.toBase58());
    console.log('Peer PDA:', peerPda.toBase58());
    
    // Build instruction - register Fogo PROGRAM ID as peer
    const discriminator = getDiscriminator('register_peer');
    const peerAddress = Buffer.from(FOGO_PROGRAM.toBytes());
    const instructionData = Buffer.concat([discriminator, chainBuffer, peerAddress]);
    
    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: peerPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: SOLANA_PROGRAM,
        data: instructionData,
    });
    
    console.log('\nSending transaction...');
    const tx = new Transaction().add(instruction);
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });
    
    console.log('\n✅ Fogo peer updated!');
    console.log('TX:', sig);
    console.log('Explorer: https://explorer.solana.com/tx/' + sig + '?cluster=devnet');
}

main().catch(e => {
    console.error('\n❌ Error:', e.message || e);
    if (e.logs) e.logs.forEach((l: string) => console.error('  ', l));
});
