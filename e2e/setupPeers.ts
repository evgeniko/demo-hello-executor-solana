#!/usr/bin/env tsx
/**
 * Unified Peer Registration for EVM ↔ Solana
 * 
 * This script registers peers in both directions:
 * 1. Solana → registers EVM contract address as peer
 * 2. EVM → registers Solana emitter PDA as peer (NOT the program ID!)
 * 
 * Usage:
 *   npx tsx e2e/setupPeers.ts          # Both directions
 *   npx tsx e2e/setupPeers.ts solana   # Solana side only
 *   npx tsx e2e/setupPeers.ts evm      # EVM side only
 */

import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, Idl } from '@coral-xyz/anchor';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
    config,
    loadSolanaKeypair,
    loadEvmWallet,
    evmAddressToBytes32,
    deriveEmitterPda,
    CHAIN_ID_SEPOLIA,
    CHAIN_ID_SOLANA,
    HELLO_WORMHOLE_SEPOLIA,
    HELLO_EXECUTOR_SOLANA,
} from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Solana Side - Register EVM peer
// ============================================================================

function loadIdl(): Idl {
    // Try paths in order of preference
    const candidates = [
        path.join(__dirname, 'abi', 'hello_executor.json'),   // e2e/abi/ (committed)
        path.join(__dirname, '..', 'idls', 'hello_executor.json'), // idls/ (root)
        path.join(__dirname, '..', 'target', 'idl', 'hello_executor.json'), // anchor build output
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
    }

    throw new Error(
        `IDL not found. Checked:\n${candidates.map(p => `  - ${p}`).join('\n')}\nRun 'anchor build' to generate it.`
    );
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

async function registerEvmPeerOnSolana(): Promise<boolean> {
    console.log('\n📋 SOLANA: Registering EVM peer...\n');

    const keypair = loadSolanaKeypair();
    console.log(`  Wallet: ${keypair.publicKey.toBase58()}`);

    const connection = new Connection(config.solana.rpcUrl, 'confirmed');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`  Balance: ${balance / 1e9} SOL`);

    const programId = config.solana.programId;
    const wallet = new Wallet(keypair);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    
    const idl = loadIdl();
    const idlWithAddress = { ...idl, address: programId.toBase58() };
    const program = new Program(idlWithAddress as Idl, provider);

    const configPda = deriveConfigPda(programId);
    const peerPda = derivePeerPda(programId, CHAIN_ID_SEPOLIA);

    // Convert EVM address to bytes array for Anchor
    const peerAddressBytes = Array.from(evmAddressToBytes32(HELLO_WORMHOLE_SEPOLIA));

    console.log(`\n  Registering:`);
    console.log(`    Chain ID: ${CHAIN_ID_SEPOLIA} (Sepolia)`);
    console.log(`    EVM Contract: ${HELLO_WORMHOLE_SEPOLIA}`);
    console.log(`    Peer PDA: ${peerPda.toBase58()}`);

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

        console.log(`\n  ✅ Success! TX: ${tx}`);
        console.log(`  Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        return true;
    } catch (error: any) {
        if (error.message?.includes('already in use')) {
            console.log('\n  ⚠️  Peer already registered');
            return true;
        }
        console.error('\n  ❌ Error:', error.message);
        return false;
    }
}

// ============================================================================
// EVM Side - Register Solana peer
// ============================================================================

const HELLO_WORMHOLE_ABI = [
    'function setPeer(uint16 chainId, bytes32 peerAddress) external',
    'function peers(uint16 chainId) external view returns (bytes32)',
];

async function registerSolanaPeerOnEvm(): Promise<boolean> {
    console.log('\n📋 EVM: Registering Solana peer...\n');

    const wallet = loadEvmWallet();
    console.log(`  Wallet: ${wallet.address}`);

    const balance = await wallet.provider!.getBalance(wallet.address);
    console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);

    const contract = new ethers.Contract(HELLO_WORMHOLE_SEPOLIA, HELLO_WORMHOLE_ABI, wallet);

    // IMPORTANT: Register the emitter PDA, NOT the program ID!
    const programId = new PublicKey(HELLO_EXECUTOR_SOLANA);
    const emitterPda = deriveEmitterPda(programId);
    const emitterBytes32 = '0x' + Buffer.from(emitterPda.toBytes()).toString('hex');

    console.log(`\n  Registering:`);
    console.log(`    Chain ID: ${CHAIN_ID_SOLANA} (Solana)`);
    console.log(`    Program ID: ${programId.toBase58()}`);
    console.log(`    Emitter PDA: ${emitterPda.toBase58()}`);
    console.log(`    As bytes32: ${emitterBytes32}`);

    // Check if already registered
    const existingPeer = await contract.peers(CHAIN_ID_SOLANA);
    if (existingPeer === emitterBytes32) {
        console.log('\n  ⚠️  Peer already registered correctly');
        return true;
    }

    try {
        const tx = await contract.setPeer(CHAIN_ID_SOLANA, emitterBytes32);
        console.log(`\n  TX Hash: ${tx.hash}`);
        console.log(`  Waiting for confirmation...`);
        
        await tx.wait();
        console.log(`  ✅ Success!`);
        console.log(`  Explorer: https://sepolia.etherscan.io/tx/${tx.hash}`);
        return true;
    } catch (error: any) {
        console.error('\n  ❌ Error:', error.message);
        return false;
    }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    const arg = process.argv[2]?.toLowerCase();

    console.log('═'.repeat(60));
    console.log('  Cross-VM Peer Registration: EVM ↔ Solana');
    console.log('═'.repeat(60));

    let solanaOk = true;
    let evmOk = true;

    if (!arg || arg === 'solana') {
        solanaOk = await registerEvmPeerOnSolana();
    }

    if (!arg || arg === 'evm') {
        evmOk = await registerSolanaPeerOnEvm();
    }

    console.log('\n' + '═'.repeat(60));
    if (solanaOk && evmOk) {
        console.log('  ✅ All peers registered successfully!');
    } else {
        console.log('  ⚠️  Some registrations failed - check logs above');
    }
    console.log('═'.repeat(60) + '\n');
}

main().catch(console.error);
