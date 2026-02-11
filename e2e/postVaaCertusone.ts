#!/usr/bin/env tsx
/**
 * Post VAA to Solana using @certusone/wormhole-sdk
 * This is the simplest approach that handles all the complexity
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { postVaaSolana, NodeWallet } from '@certusone/wormhole-sdk/lib/cjs/solana';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOLANA_RPC = 'https://api.devnet.solana.com';
const WORMHOLE_PROGRAM = '3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5';
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || 
    path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');

// VAA from Sepolia (sequence 9) - "Fixed peer address! 🎉"
const VAA_BASE64 = 'AQAAAAABAHm4oBxraTHr/yZFBGvZ6Ubugz6O1hwTFY/hug8gOceUW4ETC+jaNcTzPhQbWDsIUsSjI6SvlHd5qYdWHcu0pBEAaYxClAAAAAAnEgAAAAAAAAAAAAAAAMg9yuOBEQGejvugt4zmugVeej8sAAAAAAAAAAnIRml4ZWQgcGVlciBhZGRyZXNzISDwn46J';

function loadKeypair(): Keypair {
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

async function main() {
    console.log('📤 Posting VAA to Wormhole on Solana (certusone SDK)\n');

    const keypair = loadKeypair();
    console.log('Wallet:', keypair.publicKey.toBase58());

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('Balance:', balance / 1e9, 'SOL');

    const vaaBytes = Buffer.from(VAA_BASE64, 'base64');
    console.log('\nVAA bytes:', vaaBytes.length, 'bytes');

    // Create NodeWallet for signing
    const wallet = NodeWallet.fromSecretKey(keypair.secretKey);

    console.log('\nPosting VAA...');
    try {
        await postVaaSolana(
            connection,
            wallet.signTransaction.bind(wallet),
            WORMHOLE_PROGRAM,
            wallet.key().toBase58(),
            vaaBytes
        );
        console.log('\n🎉 VAA posted successfully!');
    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        if (error.logs) {
            console.error('Logs:', error.logs.join('\n'));
        }
        throw error;
    }
}

main().catch(console.error);
