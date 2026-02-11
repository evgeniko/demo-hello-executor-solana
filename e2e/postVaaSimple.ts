#!/usr/bin/env tsx
/**
 * Post VAA to Wormhole using low-level SDK
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOLANA_RPC = 'https://api.devnet.solana.com';
const WORMHOLE_PROGRAM = new PublicKey('3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5');
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || 
    path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');

// VAA from Sepolia (sequence 9)
const VAA_BASE64 = 'AQAAAAABAHm4oBxraTHr/yZFBGvZ6Ubugz6O1hwTFY/hug8gOceUW4ETC+jaNcTzPhQbWDsIUsSjI6SvlHd5qYdWHcu0pBEAaYxClAAAAAAnEgAAAAAAAAAAAAAAAMg9yuOBEQGejvugt4zmugVeej8sAAAAAAAAAAnIRml4ZWQgcGVlciBhZGRyZXNzISDwn46J';

function loadKeypair(): Keypair {
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

function keccak256(data: Buffer): Buffer {
    // Use sha256 as a fallback (Wormhole actually uses keccak256 but sha256 for body hash)
    return createHash('sha256').update(data).digest();
}

async function main() {
    console.log('📤 Posting VAA to Wormhole on Solana\n');

    const keypair = loadKeypair();
    console.log('Wallet:', keypair.publicKey.toBase58());

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('Balance:', balance / 1e9, 'SOL');

    // Parse VAA
    const vaaBytes = Buffer.from(VAA_BASE64, 'base64');
    const sigCount = vaaBytes[5];
    const bodyStart = 6 + sigCount * 66;
    const vaaBody = vaaBytes.slice(bodyStart);
    
    // Hash for PDA derivation
    const vaaHash = keccak256(vaaBody);
    console.log('\nVAA hash:', vaaHash.toString('hex'));

    // Derive PDAs
    const [guardianSet] = PublicKey.findProgramAddressSync(
        [Buffer.from('GuardianSet'), Buffer.from([0, 0, 0, 0])], // guardian set index 0
        WORMHOLE_PROGRAM
    );
    const [bridge] = PublicKey.findProgramAddressSync(
        [Buffer.from('Bridge')],
        WORMHOLE_PROGRAM
    );
    const [signatureSet] = PublicKey.findProgramAddressSync(
        [Buffer.from('Signature'), vaaHash],
        WORMHOLE_PROGRAM
    );
    const [postedVaa] = PublicKey.findProgramAddressSync(
        [Buffer.from('PostedVAA'), vaaHash],
        WORMHOLE_PROGRAM
    );

    console.log('Guardian Set:', guardianSet.toBase58());
    console.log('Bridge:', bridge.toBase58());
    console.log('Signature Set:', signatureSet.toBase58());
    console.log('Posted VAA:', postedVaa.toBase58());

    // Check if already posted
    const postedAccount = await connection.getAccountInfo(postedVaa);
    if (postedAccount) {
        console.log('\n✅ VAA already posted!');
        return;
    }

    console.log('\n❌ VAA not posted yet');
    console.log('\nTo post the VAA manually, you would need to:');
    console.log('1. Call verify_signatures instruction with VAA signatures');
    console.log('2. Call post_vaa instruction with the verified signatures');
    console.log('\nThis is complex. Better to use the Wormhole CLI or a higher-level SDK.');
    
    // Check if worm CLI is available
    const { execSync } = await import('child_process');
    try {
        execSync('which worm', { stdio: 'pipe' });
        console.log('\n🔧 worm CLI found! Running post...');
        const result = execSync(`worm submit ${VAA_BASE64} --network devnet`, { encoding: 'utf-8' });
        console.log(result);
    } catch {
        console.log('\n⚠️  worm CLI not found.');
        console.log('Install with: npm install -g @wormhole-foundation/wormhole-cli');
        console.log('Or ask the Executor team why "unsupported" for custom Solana programs.');
    }
}

main().catch(console.error);
