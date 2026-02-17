#!/usr/bin/env tsx
/**
 * Fix Solana peer on Fogo to EMITTER PDA (for VAA verification)
 */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const FOGO_PROGRAM = new PublicKey('J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk');
const SOLANA_EMITTER = new PublicKey('DNmK1Red1aEtrkUhfniwpXzjxtnVjxeVeKUBtdM5vwkJ'); // Solana emitter PDA
const FOGO_RPC = 'https://testnet.fogo.io/rpc';
const KEYPAIR_PATH = path.join(process.env.HOME || '', '.config/solana/test-wallets/fogo-testnet.json');
const CHAIN_ID_SOLANA = 1;

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
    console.log('🔧 Fixing Solana peer on Fogo to EMITTER PDA\n');
    console.log('Solana Emitter:', SOLANA_EMITTER.toBase58());
    console.log('As bytes32:', Buffer.from(SOLANA_EMITTER.toBytes()).toString('hex'));
    
    const keypair = loadKeypair();
    console.log('\nWallet:', keypair.publicKey.toBase58());
    
    const connection = new Connection(FOGO_RPC, 'confirmed');
    
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], FOGO_PROGRAM);
    const chainBuffer = Buffer.alloc(2);
    chainBuffer.writeUInt16LE(CHAIN_ID_SOLANA);
    const [peerPda] = PublicKey.findProgramAddressSync([Buffer.from('peer'), chainBuffer], FOGO_PROGRAM);
    
    const discriminator = getDiscriminator('register_peer');
    const peerAddress = Buffer.from(SOLANA_EMITTER.toBytes());
    const instructionData = Buffer.concat([discriminator, chainBuffer, peerAddress]);
    
    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: peerPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: FOGO_PROGRAM,
        data: instructionData,
    });
    
    console.log('\nSending transaction...');
    const tx = new Transaction().add(instruction);
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });
    
    console.log('\n✅ Solana peer on Fogo fixed to emitter!');
    console.log('TX:', sig);
}

main().catch(e => {
    console.error('\n❌ Error:', e.message || e);
});
