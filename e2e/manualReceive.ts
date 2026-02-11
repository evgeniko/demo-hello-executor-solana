#!/usr/bin/env tsx
/**
 * Manually receive a VAA on Solana (bypass Executor)
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Config
const SOLANA_RPC = process.env.SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp');
const WORMHOLE_PROGRAM = new PublicKey('3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5');
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || 
    path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');

// VAA from wormholescan (sequence 9)
const VAA_BASE64 = 'AQAAAAABAHm4oBxraTHr/yZFBGvZ6Ubugz6O1hwTFY/hug8gOceUW4ETC+jaNcTzPhQbWDsIUsSjI6SvlHd5qYdWHcu0pBEAaYxClAAAAAAnEgAAAAAAAAAAAAAAAMg9yuOBEQGejvugt4zmugVeej8sAAAAAAAAAAnIRml4ZWQgcGVlciBhZGRyZXNzISDwn46J';

function loadKeypair(): Keypair {
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function loadIdl() {
    const idlPath = path.join(__dirname, '..', 'target', 'idl', 'hello_executor.json');
    return JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
}

async function main() {
    console.log('🔧 Manual VAA Receive on Solana\n');

    const keypair = loadKeypair();
    console.log('Wallet:', keypair.publicKey.toBase58());

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('Balance:', balance / 1e9, 'SOL');

    // Decode VAA
    const vaaBytes = Buffer.from(VAA_BASE64, 'base64');
    console.log('\nVAA length:', vaaBytes.length);

    // Parse VAA body (skip header + signatures)
    const sigCount = vaaBytes[5];
    const bodyStart = 6 + sigCount * 66;
    const vaaBody = vaaBytes.slice(bodyStart);
    
    // Hash the body
    const crypto = await import('crypto');
    const vaaHash = crypto.createHash('sha256').update(vaaBody).digest();
    console.log('VAA hash:', vaaHash.toString('hex'));

    // Parse emitter info
    const emitterChain = vaaBody.readUInt16BE(8);
    const sequence = vaaBody.readBigUInt64BE(42);
    console.log('Emitter chain:', emitterChain);
    console.log('Sequence:', sequence.toString());

    // Check if already received
    const [receivedPda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('received'),
            Buffer.alloc(2).fill(0).map((_, i) => i === 0 ? emitterChain & 0xff : (emitterChain >> 8) & 0xff),
            (() => { const buf = Buffer.alloc(8); buf.writeBigUInt64LE(sequence); return buf; })()
        ],
        PROGRAM_ID
    );
    
    const receivedAccount = await connection.getAccountInfo(receivedPda);
    if (receivedAccount) {
        console.log('\n✅ Message already received at:', receivedPda.toBase58());
        return;
    }

    // First, we need to post the VAA to Wormhole
    // This requires the wormhole SDK or manual instruction building
    console.log('\n⚠️ VAA needs to be posted to Wormhole first.');
    console.log('This requires the Wormhole SDK postVaa function.');
    console.log('\nTo test manually, use worm CLI:');
    console.log(`  worm submit ${VAA_BASE64} --network devnet`);
}

main().catch(console.error);
