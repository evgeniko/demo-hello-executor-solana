#!/usr/bin/env tsx
/**
 * Full manual relay test: Sepolia → Solana
 * Uses VAA sequence 11 (from failed executor attempt)
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import { postVaaSolana, NodeWallet } from '@certusone/wormhole-sdk/lib/cjs/solana';
import { parseVaa } from '@certusone/wormhole-sdk/lib/cjs/vaa/wormhole';
import { derivePostedVaaKey } from '@certusone/wormhole-sdk/lib/cjs/solana/wormhole/accounts/postedVaa';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const SOLANA_RPC = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp');
const WORMHOLE_PROGRAM = new PublicKey('3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5');
const KEYPAIR_PATH = path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');

// VAA sequence 11 - "Testing RESOLVER_PUBKEY_POSTED_VAA! 🚀"
const VAA_BASE64 = 'AQAAAAABAEujKwO/lQC/wM46NAwDo19YicipT29c8MACAeM3rfcIKgPAfPNFIH4JFbsodL17thBz+zwmJQRZVJN7S97XEk0BaYx5hAAAAAAnEgAAAAAAAAAAAAAAAMg9yuOBEQGejvugt4zmugVeej8sAAAAAAAAAAvIVGVzdGluZyBSRVNPTFZFUl9QVUJLRVlfUE9TVEVEX1ZBQSEg8J+agA==';

function loadKeypair(): Keypair {
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function getDiscriminator(): Buffer {
    const hash = createHash('sha256');
    hash.update('global:receive_greeting');
    return Buffer.from(hash.digest().slice(0, 8));
}

async function main() {
    console.log('🔧 Manual Relay Test: Sepolia → Solana\n');

    const keypair = loadKeypair();
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const wallet = NodeWallet.fromSecretKey(keypair.secretKey);
    
    console.log('Wallet:', keypair.publicKey.toBase58());
    console.log('Balance:', (await connection.getBalance(keypair.publicKey)) / 1e9, 'SOL');

    // Parse VAA
    const vaaBytes = Buffer.from(VAA_BASE64, 'base64');
    const parsed = parseVaa(vaaBytes);
    
    console.log('\n📦 VAA Details:');
    console.log('  Sequence:', parsed.sequence);
    console.log('  Emitter chain:', parsed.emitterChain, '(Sepolia)');
    console.log('  Payload:', Buffer.from(parsed.payload).toString('utf8'));

    // Check if VAA already posted
    const postedVaaPda = derivePostedVaaKey(WORMHOLE_PROGRAM, parsed.hash);
    let postedAccount = await connection.getAccountInfo(postedVaaPda);
    
    if (!postedAccount) {
        console.log('\n📤 Step 1: Posting VAA to Wormhole...');
        await postVaaSolana(
            connection,
            wallet.signTransaction.bind(wallet),
            WORMHOLE_PROGRAM.toBase58(),
            wallet.key().toBase58(),
            vaaBytes
        );
        console.log('✅ VAA posted!');
    } else {
        console.log('\n✅ Step 1: VAA already posted');
    }

    // Derive PDAs
    const chainBuffer = Buffer.alloc(2);
    chainBuffer.writeUInt16LE(parsed.emitterChain);
    const seqBuffer = Buffer.alloc(8);
    seqBuffer.writeBigUInt64LE(BigInt(parsed.sequence));

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
    const [peerPda] = PublicKey.findProgramAddressSync([Buffer.from('peer'), chainBuffer], PROGRAM_ID);
    const [receivedPda] = PublicKey.findProgramAddressSync([Buffer.from('received'), chainBuffer, seqBuffer], PROGRAM_ID);

    // Check if already received
    const receivedAccount = await connection.getAccountInfo(receivedPda);
    if (receivedAccount) {
        console.log('\n✅ Message already received (sequence', parsed.sequence, ')');
        return;
    }

    // Build receive_greeting instruction
    console.log('\n📤 Step 2: Calling receive_greeting...');
    
    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: WORMHOLE_PROGRAM, isSigner: false, isWritable: false },
            { pubkey: postedVaaPda, isSigner: false, isWritable: false },
            { pubkey: peerPda, isSigner: false, isWritable: false },
            { pubkey: receivedPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: Buffer.concat([getDiscriminator(), Buffer.from(parsed.hash)]),
    });

    const tx = new Transaction().add(instruction);
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });

    console.log('\n🎉 SUCCESS! Manual relay complete!');
    console.log('Transaction:', sig);
    console.log('Explorer: https://explorer.solana.com/tx/' + sig + '?cluster=devnet');
    console.log('\nMessage received:', Buffer.from(parsed.payload).toString('utf8'));
}

main().catch(e => {
    console.error('\n❌ Error:', e.message);
    if (e.logs) e.logs.forEach((l: string) => console.error('  ', l));
    process.exit(1);
});
