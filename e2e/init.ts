#!/usr/bin/env tsx
/**
 * Initialize HelloExecutor program on any supported chain
 * 
 * Usage:
 *   npx tsx e2e/init.ts solana
 *   npx tsx e2e/init.ts fogo
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const CHAINS: Record<string, {
    id: number;
    name: string;
    rpc: string;
    programId: PublicKey;
    wormhole: PublicKey;
    keypairPath: string;
    token: string;
}> = {
    solana: {
        id: 1,
        name: 'Solana Devnet',
        rpc: 'https://api.devnet.solana.com',
        programId: new PublicKey('J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk'),
        wormhole: new PublicKey('3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5'),
        keypairPath: path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json'),
        token: 'SOL',
    },
    fogo: {
        id: 51,
        name: 'Fogo Testnet',
        rpc: 'https://testnet.fogo.io',
        programId: new PublicKey('J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk'),
        wormhole: new PublicKey('BhnQyKoQQgpuRTRo6D8Emz93PvXCYfVgHhnrR4T3qhw4'),
        keypairPath: path.join(process.env.HOME || '', '.config/solana/test-wallets/fogo-testnet.json'),
        token: 'FOGO',
    },
};

function loadKeypair(keypairPath: string): Keypair {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8'))));
}

function getDiscriminator(name: string): Buffer {
    const hash = createHash('sha256');
    hash.update(`global:${name}`);
    return Buffer.from(hash.digest().slice(0, 8));
}

async function main() {
    const chainKey = process.argv[2]?.toLowerCase();
    
    if (!chainKey || !CHAINS[chainKey]) {
        console.log('Usage: npx tsx e2e/init.ts <chain>');
        console.log('  chain: solana | fogo');
        process.exit(1);
    }
    
    const chain = CHAINS[chainKey];
    console.log(`🚀 Initializing HelloExecutor on ${chain.name}\n`);
    
    const keypair = loadKeypair(chain.keypairPath);
    const connection = new Connection(chain.rpc, 'confirmed');
    
    console.log('Wallet:', keypair.publicKey.toBase58());
    console.log('Balance:', (await connection.getBalance(keypair.publicKey)) / 1e9, chain.token);
    
    // Derive PDAs
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], chain.programId);
    const [emitterPda] = PublicKey.findProgramAddressSync([Buffer.from('emitter')], chain.programId);
    const [wormholeBridge] = PublicKey.findProgramAddressSync([Buffer.from('Bridge')], chain.wormhole);
    const [wormholeFeeCollector] = PublicKey.findProgramAddressSync([Buffer.from('fee_collector')], chain.wormhole);
    const [wormholeSequence] = PublicKey.findProgramAddressSync([Buffer.from('Sequence'), emitterPda.toBuffer()], chain.wormhole);
    
    console.log('\nPDAs:');
    console.log('  Config:', configPda.toBase58());
    console.log('  Emitter:', emitterPda.toBase58());
    
    // Check if already initialized
    const configAccount = await connection.getAccountInfo(configPda);
    if (configAccount) {
        console.log('\n✅ Program already initialized!');
        console.log('  Owner:', configAccount.owner.toBase58());
        console.log('  Data length:', configAccount.data.length);
        return;
    }
    
    // Build initialize instruction
    const chainIdBuf = Buffer.alloc(2);
    chainIdBuf.writeUInt16LE(chain.id);
    
    const initData = Buffer.concat([
        getDiscriminator('initialize'),
        chainIdBuf,
    ]);
    
    const initIx = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: configPda, isSigner: false, isWritable: true },
            { pubkey: emitterPda, isSigner: false, isWritable: true },
            { pubkey: chain.wormhole, isSigner: false, isWritable: false },
            { pubkey: wormholeBridge, isSigner: false, isWritable: false },
            { pubkey: wormholeFeeCollector, isSigner: false, isWritable: false },
            { pubkey: wormholeSequence, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: chain.programId,
        data: initData,
    });
    
    console.log('\n📤 Sending initialize transaction...');
    const tx = new Transaction().add(initIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });
    
    console.log('✅ Initialized!');
    console.log('TX:', sig);
}

main().catch(e => {
    console.error('❌ Error:', e.message);
    process.exit(1);
});
