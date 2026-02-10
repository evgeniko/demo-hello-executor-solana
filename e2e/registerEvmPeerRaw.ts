#!/usr/bin/env tsx
/**
 * Register an EVM contract as a peer on the Solana HelloExecutor program
 * Uses raw transactions to avoid IDL version issues
 */

import { 
    Connection, 
    Keypair, 
    PublicKey, 
    SystemProgram,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const SOLANA_RPC = process.env.SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.HELLO_EXECUTOR_SOLANA || '5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp');
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || 
    path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');

// Wormhole chain ID for Sepolia
const CHAIN_ID_SEPOLIA = 10002;

// Sepolia HelloWormhole contract address
const SEPOLIA_CONTRACT = process.env.HELLO_WORMHOLE_SEPOLIA_CROSSVM || '0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c';

function loadKeypair(): Keypair {
    if (!fs.existsSync(KEYPAIR_PATH)) {
        throw new Error(`Keypair not found at ${KEYPAIR_PATH}`);
    }
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function evmAddressToBytes32(address: string): Buffer {
    // Remove 0x prefix if present
    const cleaned = address.toLowerCase().replace(/^0x/, '');
    
    // Pad to 64 hex chars (32 bytes) - left pad with zeros
    const padded = cleaned.padStart(64, '0');
    
    return Buffer.from(padded, 'hex');
}

function derivePeerPda(programId: PublicKey, chainId: number): PublicKey {
    const chainIdBuffer = Buffer.alloc(2);
    chainIdBuffer.writeUInt16LE(chainId);
    const [peerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('peer'), chainIdBuffer],
        programId
    );
    return peerPda;
}

function deriveConfigPda(programId: PublicKey): PublicKey {
    const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        programId
    );
    return configPda;
}

import { createHash } from 'crypto';

// Anchor instruction discriminator for "register_peer"
// Generated from: sha256("global:register_peer")[0..8]
function getRegisterPeerDiscriminator(): Buffer {
    const hash = createHash('sha256');
    hash.update('global:register_peer');
    return Buffer.from(hash.digest().slice(0, 8));
}

async function main() {
    console.log('🔗 Registering EVM Peer on Solana HelloExecutor\n');

    // Load keypair
    const keypair = loadKeypair();
    console.log(`Wallet: ${keypair.publicKey.toBase58()}`);

    // Connect
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Balance: ${balance / 1e9} SOL`);

    // Derive PDAs
    const configPda = deriveConfigPda(PROGRAM_ID);
    const peerPda = derivePeerPda(PROGRAM_ID, CHAIN_ID_SEPOLIA);

    // Convert EVM address to bytes32
    const peerAddressBytes = evmAddressToBytes32(SEPOLIA_CONTRACT);

    console.log(`\nRegistering peer:`);
    console.log(`  Chain ID: ${CHAIN_ID_SEPOLIA} (Sepolia)`);
    console.log(`  EVM Address: ${SEPOLIA_CONTRACT}`);
    console.log(`  As bytes32: 0x${peerAddressBytes.toString('hex')}`);
    console.log(`  Program ID: ${PROGRAM_ID.toBase58()}`);
    console.log(`  Config PDA: ${configPda.toBase58()}`);
    console.log(`  Peer PDA: ${peerPda.toBase58()}`);

    // Build instruction data
    // Format: [discriminator (8 bytes)][chain_id (2 bytes LE)][address (32 bytes)]
    const discriminator = getRegisterPeerDiscriminator();
    const chainIdBuffer = Buffer.alloc(2);
    chainIdBuffer.writeUInt16LE(CHAIN_ID_SEPOLIA);
    
    const instructionData = Buffer.concat([
        discriminator,
        chainIdBuffer,
        peerAddressBytes,
    ]);

    console.log(`\nInstruction data: ${instructionData.toString('hex')}`);

    // Build instruction
    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true }, // owner
            { pubkey: configPda, isSigner: false, isWritable: false }, // config (read-only for auth check)
            { pubkey: peerPda, isSigner: false, isWritable: true }, // peer
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

        console.log(`\n✅ Peer registered successfully!`);
        console.log(`Transaction: ${signature}`);
        console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    } catch (error: any) {
        if (error.message?.includes('already in use') || error.logs?.some((l: string) => l.includes('already in use'))) {
            console.log('\n⚠️  Peer already registered (account exists)');
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
