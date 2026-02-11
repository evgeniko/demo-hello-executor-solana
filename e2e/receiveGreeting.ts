#!/usr/bin/env tsx
/**
 * Call receive_greeting on Solana program to complete manual relay
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import { parseVaa } from '@certusone/wormhole-sdk/lib/cjs/vaa/wormhole';
import { derivePostedVaaKey } from '@certusone/wormhole-sdk/lib/cjs/solana/wormhole/accounts/postedVaa';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOLANA_RPC = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp');
const WORMHOLE_PROGRAM = new PublicKey('3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5');
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || 
    path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');

// VAA from Sepolia (sequence 9) - "Fixed peer address! 🎉"
const VAA_BASE64 = 'AQAAAAABAHm4oBxraTHr/yZFBGvZ6Ubugz6O1hwTFY/hug8gOceUW4ETC+jaNcTzPhQbWDsIUsSjI6SvlHd5qYdWHcu0pBEAaYxClAAAAAAnEgAAAAAAAAAAAAAAAMg9yuOBEQGejvugt4zmugVeej8sAAAAAAAAAAnIRml4ZWQgcGVlciBhZGRyZXNzISDwn46J';

function loadKeypair(): Keypair {
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

// Get the anchor discriminator for receive_greeting
function getReceiveGreetingDiscriminator(): Buffer {
    const hash = createHash('sha256');
    hash.update('global:receive_greeting');
    return Buffer.from(hash.digest().slice(0, 8));
}

async function main() {
    console.log('🔧 Receiving Greeting from Sepolia on Solana\n');

    const keypair = loadKeypair();
    console.log('Wallet:', keypair.publicKey.toBase58());

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('Balance:', balance / 1e9, 'SOL');

    // Parse VAA
    const vaaBytes = Buffer.from(VAA_BASE64, 'base64');
    const parsed = parseVaa(vaaBytes);
    
    console.log('\nVAA Details:');
    console.log('  Hash:', Buffer.from(parsed.hash).toString('hex'));
    console.log('  Emitter chain:', parsed.emitterChain);
    console.log('  Emitter:', Buffer.from(parsed.emitterAddress).toString('hex'));
    console.log('  Sequence:', parsed.sequence);
    console.log('  Payload:', Buffer.from(parsed.payload).toString('utf8'));

    // Derive Posted VAA PDA
    const postedVaaPda = derivePostedVaaKey(WORMHOLE_PROGRAM, parsed.hash);
    console.log('\nPosted VAA PDA:', postedVaaPda.toBase58());

    // Verify VAA is posted
    const postedAccount = await connection.getAccountInfo(postedVaaPda);
    if (!postedAccount) {
        console.error('❌ VAA not posted! Run postVaaCertusone.ts first.');
        return;
    }
    console.log('✅ VAA is posted');

    // Derive other PDAs
    const emitterChain = parsed.emitterChain;
    const sequence = BigInt(parsed.sequence);
    
    const chainBuffer = Buffer.alloc(2);
    chainBuffer.writeUInt16LE(emitterChain);
    
    const seqBuffer = Buffer.alloc(8);
    seqBuffer.writeBigUInt64LE(sequence);

    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
    const [peerPda] = PublicKey.findProgramAddressSync([Buffer.from('peer'), chainBuffer], PROGRAM_ID);
    const [receivedPda] = PublicKey.findProgramAddressSync([Buffer.from('received'), chainBuffer, seqBuffer], PROGRAM_ID);

    console.log('\nPDAs:');
    console.log('  Config:', configPda.toBase58());
    console.log('  Peer:', peerPda.toBase58());
    console.log('  Received:', receivedPda.toBase58());

    // Check if peer is registered
    const peerAccount = await connection.getAccountInfo(peerPda);
    if (!peerAccount) {
        console.error('❌ Peer not registered for chain', emitterChain);
        return;
    }
    console.log('✅ Peer is registered');

    // Check if already received
    const receivedAccount = await connection.getAccountInfo(receivedPda);
    if (receivedAccount) {
        console.log('\n✅ Message already received!');
        return;
    }

    // Build instruction manually
    const discriminator = getReceiveGreetingDiscriminator();
    const vaaHash = Buffer.from(parsed.hash);
    
    // Instruction data: discriminator (8) + vaa_hash (32)
    const instructionData = Buffer.concat([discriminator, vaaHash]);

    console.log('\nBuilding receive_greeting instruction...');
    console.log('  Discriminator:', discriminator.toString('hex'));
    console.log('  VAA Hash:', vaaHash.toString('hex'));

    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },  // payer
            { pubkey: configPda, isSigner: false, isWritable: false },        // config
            { pubkey: WORMHOLE_PROGRAM, isSigner: false, isWritable: false }, // wormhole_program
            { pubkey: postedVaaPda, isSigner: false, isWritable: false },     // posted
            { pubkey: peerPda, isSigner: false, isWritable: false },          // peer
            { pubkey: receivedPda, isSigner: false, isWritable: true },       // received
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    console.log('\nSending transaction...');

    try {
        const tx = new Transaction().add(instruction);
        const sig = await sendAndConfirmTransaction(connection, tx, [keypair], {
            commitment: 'confirmed',
        });

        console.log('\n🎉 SUCCESS! Greeting received from Sepolia!');
        console.log('Transaction:', sig);
        console.log('Explorer:', `https://explorer.solana.com/tx/${sig}?cluster=devnet`);
        console.log('\nMessage:', Buffer.from(parsed.payload).toString('utf8'));
    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        if (error.logs) {
            console.error('\nProgram logs:');
            error.logs.forEach((log: string) => console.error('  ', log));
        }
    }
}

main().catch(console.error);
