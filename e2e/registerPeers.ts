#!/usr/bin/env tsx
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Chain configs
const CHAINS = {
    solana: {
        rpc: 'https://api.devnet.solana.com',
        programId: new PublicKey('J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk'),
        chainId: 1,
        keypairPath: path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json'),
    },
    fogo: {
        rpc: 'https://testnet.fogo.io',
        programId: new PublicKey('J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk'),
        chainId: 51,
        keypairPath: path.join(process.env.HOME || '', '.config/solana/test-wallets/fogo-testnet.json'),
    }
};

function loadKeypair(path: string): Keypair {
    const keyData = JSON.parse(fs.readFileSync(path, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function getDiscriminator(name: string): Buffer {
    const hash = createHash('sha256');
    hash.update(`global:${name}`);
    return Buffer.from(hash.digest().slice(0, 8));
}

function pubkeyToBytes32(pubkey: PublicKey): number[] {
    return Array.from(pubkey.toBytes());
}

async function registerPeer(
    sourceChain: 'solana' | 'fogo',
    targetChain: 'solana' | 'fogo'
) {
    const source = CHAINS[sourceChain];
    const target = CHAINS[targetChain];
    
    console.log(`\n📝 Registering ${targetChain} as peer on ${sourceChain}`);
    console.log(`   Target chain ID: ${target.chainId}`);
    
    const keypair = loadKeypair(source.keypairPath);
    const connection = new Connection(source.rpc, 'confirmed');
    
    // Derive target's emitter PDA (this is what we register as peer)
    const [targetEmitter] = PublicKey.findProgramAddressSync(
        [Buffer.from('emitter')], 
        target.programId
    );
    console.log(`   Target emitter: ${targetEmitter.toBase58()}`);
    
    // Derive source PDAs
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], source.programId);
    const chainBuffer = Buffer.alloc(2);
    chainBuffer.writeUInt16LE(target.chainId);
    const [peerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('peer'), chainBuffer], 
        source.programId
    );
    
    // Check if peer already registered
    const peerAccount = await connection.getAccountInfo(peerPda);
    if (peerAccount) {
        console.log(`   ✅ Peer already registered at ${peerPda.toBase58()}`);
        return;
    }
    
    // Build register_peer instruction
    const discriminator = getDiscriminator('register_peer');
    const peerAddress = Buffer.from(pubkeyToBytes32(targetEmitter));
    const instructionData = Buffer.concat([discriminator, chainBuffer, peerAddress]);
    
    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: peerPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: source.programId,
        data: instructionData,
    });
    
    console.log(`   Sending transaction...`);
    const tx = new Transaction().add(instruction);
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });
    
    console.log(`   ✅ Registered! TX: ${sig}`);
}

async function main() {
    console.log('🔗 Registering Peers: Solana ↔ Fogo\n');
    
    // Register Fogo on Solana
    await registerPeer('solana', 'fogo');
    
    // Register Solana on Fogo
    await registerPeer('fogo', 'solana');
    
    console.log('\n✅ All peers registered!');
}

main().catch(e => {
    console.error('❌ Error:', e.message);
    if (e.logs) e.logs.forEach((l: string) => console.error('  ', l));
});
