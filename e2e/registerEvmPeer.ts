#!/usr/bin/env tsx
/**
 * Register an EVM contract as a peer on the Solana HelloExecutor program
 */

import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, Idl } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SOLANA_RPC = process.env.SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com';
const PROGRAM_ID = process.env.HELLO_EXECUTOR_SOLANA || '5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp';
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || 
    path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');

// Wormhole chain ID for Sepolia
const CHAIN_ID_SEPOLIA = 10002;

// Sepolia HelloWormhole contract address
const SEPOLIA_CONTRACT = process.env.HELLO_WORMHOLE_SEPOLIA_CROSSVM || '0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c';

// Wormhole Core Bridge (Solana Devnet)
const WORMHOLE_CORE_BRIDGE = '3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5';

function loadKeypair(): Keypair {
    if (!fs.existsSync(KEYPAIR_PATH)) {
        throw new Error(`Keypair not found at ${KEYPAIR_PATH}`);
    }
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function loadIdl(): Idl {
    const idlPath = path.join(__dirname, '..', 'target', 'idl', 'hello_executor.json');
    if (!fs.existsSync(idlPath)) {
        throw new Error(`IDL not found at ${idlPath}. Run 'anchor build' first.`);
    }
    return JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
}

function evmAddressToBytes32(address: string): number[] {
    // Remove 0x prefix if present
    const cleaned = address.toLowerCase().replace(/^0x/, '');
    
    // Pad to 64 hex chars (32 bytes) - left pad with zeros
    const padded = cleaned.padStart(64, '0');
    
    // Convert to byte array
    const bytes: number[] = [];
    for (let i = 0; i < 64; i += 2) {
        bytes.push(parseInt(padded.slice(i, i + 2), 16));
    }
    
    return bytes;
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

async function main() {
    console.log('🔗 Registering EVM Peer on Solana HelloExecutor\n');

    // Load keypair
    const keypair = loadKeypair();
    console.log(`Wallet: ${keypair.publicKey.toBase58()}`);

    // Connect
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Balance: ${balance / 1e9} SOL`);

    // Load program
    const programId = new PublicKey(PROGRAM_ID);
    const wallet = new Wallet(keypair);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    const idl = loadIdl();
    const idlWithAddress = { ...idl, address: programId.toBase58() };
    const program = new Program(idlWithAddress as Idl, provider);

    // Derive PDAs
    const configPda = deriveConfigPda(programId);
    const peerPda = derivePeerPda(programId, CHAIN_ID_SEPOLIA);

    // Convert EVM address to bytes32
    const peerAddressBytes = evmAddressToBytes32(SEPOLIA_CONTRACT);

    console.log(`\nRegistering peer:`);
    console.log(`  Chain ID: ${CHAIN_ID_SEPOLIA} (Sepolia)`);
    console.log(`  EVM Address: ${SEPOLIA_CONTRACT}`);
    console.log(`  As bytes32: 0x${peerAddressBytes.map(b => b.toString(16).padStart(2, '0')).join('')}`);
    console.log(`  Config PDA: ${configPda.toBase58()}`);
    console.log(`  Peer PDA: ${peerPda.toBase58()}`);

    try {
        const tx = await program.methods
            .registerPeer(CHAIN_ID_SEPOLIA, peerAddressBytes)
            .accounts({
                owner: keypair.publicKey,
                config: configPda,
                peer: peerPda,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log(`\n✅ Peer registered successfully!`);
        console.log(`Transaction: ${tx}`);
        console.log(`Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    } catch (error: any) {
        if (error.message?.includes('already in use')) {
            console.log('\n⚠️  Peer already registered (account exists)');
        } else {
            throw error;
        }
    }
}

main().catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
});
