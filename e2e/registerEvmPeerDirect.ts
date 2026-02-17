#!/usr/bin/env tsx
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const PROGRAM_ID = new PublicKey('5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp');
const SOLANA_RPC = 'https://api.devnet.solana.com';
const KEYPAIR_PATH = path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');
const CHAIN_ID_SEPOLIA = 10002;
const EVM_CONTRACT = '0x978d3cF51e9358C58a9538933FC3E277C29915C5';

function loadKeypair(): Keypair {
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function getDiscriminator(name: string): Buffer {
    const hash = createHash('sha256');
    hash.update('global:' + name);
    return Buffer.from(hash.digest().slice(0, 8));
}

function evmAddressToBytes32(address: string): Buffer {
    const cleaned = address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    return Buffer.from(cleaned, 'hex');
}

async function main() {
    console.log('🔗 Registering EVM Peer on Solana HelloExecutor\n');
    
    const keypair = loadKeypair();
    console.log('Wallet:', keypair.publicKey.toBase58());
    
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('Balance:', balance / 1e9, 'SOL');
    
    // Derive PDAs
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
    const chainBuffer = Buffer.alloc(2);
    chainBuffer.writeUInt16LE(CHAIN_ID_SEPOLIA);
    const [peerPda] = PublicKey.findProgramAddressSync([Buffer.from('peer'), chainBuffer], PROGRAM_ID);
    
    console.log('\nRegistering:');
    console.log('  Chain:', CHAIN_ID_SEPOLIA, '(Sepolia)');
    console.log('  EVM Contract:', EVM_CONTRACT);
    console.log('  Config PDA:', configPda.toBase58());
    console.log('  Peer PDA:', peerPda.toBase58());
    
    // Check if already registered
    const peerAccount = await connection.getAccountInfo(peerPda);
    if (peerAccount) {
        console.log('\n⚠️ Peer already registered. Will update...');
    }
    
    // Build instruction
    const discriminator = getDiscriminator('register_peer');
    const peerAddress = evmAddressToBytes32(EVM_CONTRACT);
    const instructionData = Buffer.concat([discriminator, chainBuffer, peerAddress]);
    
    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: peerPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });
    
    console.log('\nSending transaction...');
    const tx = new Transaction().add(instruction);
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });
    
    console.log('\n✅ Peer registered!');
    console.log('TX:', sig);
    console.log('Explorer: https://explorer.solana.com/tx/' + sig + '?cluster=devnet');
}

main().catch(e => {
    console.error('\n❌ Error:', e.message || e);
    if (e.logs) e.logs.forEach((l: string) => console.error('  ', l));
});
