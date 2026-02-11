#!/usr/bin/env tsx
/**
 * Post VAA to Wormhole using SDK
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { Wormhole, wormhole, signSendWait } from '@wormhole-foundation/sdk';
import solana from '@wormhole-foundation/sdk/platforms/solana';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOLANA_RPC = 'https://api.devnet.solana.com';
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || 
    path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');

// VAA from Sepolia (sequence 9)
const VAA_BASE64 = 'AQAAAAABAHm4oBxraTHr/yZFBGvZ6Ubugz6O1hwTFY/hug8gOceUW4ETC+jaNcTzPhQbWDsIUsSjI6SvlHd5qYdWHcu0pBEAaYxClAAAAAAnEgAAAAAAAAAAAAAAAMg9yuOBEQGejvugt4zmugVeej8sAAAAAAAAAAnIRml4ZWQgcGVlciBhZGRyZXNzISDwn46J';

function loadKeypair(): Keypair {
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

async function main() {
    console.log('📤 Posting VAA to Wormhole on Solana\n');

    const keypair = loadKeypair();
    console.log('Wallet:', keypair.publicKey.toBase58());

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    
    // Initialize Wormhole SDK
    const wh = await wormhole('Testnet', [solana.Platform]);
    const chain = wh.getChain('Solana');
    
    // Get signer
    const signer = await solana.Platform.getSigner(
        connection,
        keypair
    );
    
    // Parse VAA
    const vaaBytes = Buffer.from(VAA_BASE64, 'base64');
    console.log('VAA bytes:', vaaBytes.length);
    
    // Post VAA
    console.log('\nPosting VAA...');
    try {
        const core = await chain.getWormholeCore();
        const txs = core.postVaa(signer.address(), { bytes: vaaBytes });
        
        const results = await signSendWait(chain, txs, signer);
        console.log('✅ VAA posted!');
        for (const result of results) {
            console.log('TX:', result.txid);
        }
    } catch (error: any) {
        console.error('Error:', error.message);
        if (error.message?.includes('already in use')) {
            console.log('✅ VAA already posted (account exists)');
        }
    }
}

main().catch(console.error);
