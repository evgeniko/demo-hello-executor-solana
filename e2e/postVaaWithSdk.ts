#!/usr/bin/env tsx
/**
 * Post VAA to Wormhole Solana using the SDK
 * 
 * The verify signatures process creates instruction pairs:
 * 1. secp256k1 instruction (native program, no custom signers)
 * 2. verify_signatures instruction (needs signature_set as signer)
 * 
 * We need to send them together in the same transaction.
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { utils } from '@wormhole-foundation/sdk-solana-core';
import { deserialize } from '@wormhole-foundation/sdk-definitions';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOLANA_RPC = 'https://api.devnet.solana.com';
const WORMHOLE_PROGRAM = new PublicKey('3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5');
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || 
    path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');

// VAA from Sepolia (sequence 9) - "Fixed peer address! 🎉"
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
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('Balance:', balance / 1e9, 'SOL');

    const vaaBytes = Buffer.from(VAA_BASE64, 'base64');
    console.log('\nVAA bytes:', vaaBytes.length, 'bytes');

    // Parse VAA using SDK
    console.log('\nParsing VAA...');
    const vaa = deserialize('Uint8Array', vaaBytes);
    console.log('Guardian set:', vaa.guardianSet);
    console.log('Signatures:', vaa.signatures.length);
    console.log('Emitter chain:', vaa.emitterChain);
    console.log('Sequence:', vaa.sequence);
    console.log('Hash:', Buffer.from(vaa.hash).toString('hex'));

    try {
        const signatureSetKeypair = Keypair.generate();
        console.log('\nSignature set:', signatureSetKeypair.publicKey.toBase58());

        // 1. Get verify signatures instructions
        console.log('\n1. Creating verify signatures instructions...');
        const verifyIxs = await utils.createVerifySignaturesInstructions(
            connection,
            WORMHOLE_PROGRAM,
            keypair.publicKey,
            vaa as any,
            signatureSetKeypair.publicKey
        );
        console.log('Got', verifyIxs.length, 'verify instructions');

        // The instructions come in pairs (secp256k1 + verify_signatures)
        // Send them in batches of 2
        for (let i = 0; i < verifyIxs.length; i += 2) {
            const tx = new Transaction();
            
            // Add compute budget for complex signature verification
            tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }));
            
            tx.add(verifyIxs[i]); // secp256k1
            if (i + 1 < verifyIxs.length) {
                tx.add(verifyIxs[i + 1]); // verify_signatures
            }

            console.log(`\nSending verify tx ${Math.floor(i/2) + 1}/${Math.ceil(verifyIxs.length/2)}...`);
            
            // The verify_signatures instruction requires signature_set as signer
            const sig = await sendAndConfirmTransaction(
                connection, 
                tx, 
                [keypair, signatureSetKeypair],
                { commitment: 'confirmed' }
            );
            console.log('  Tx:', sig);
        }

        // 2. Post VAA
        console.log('\n2. Creating post VAA instruction...');
        const postVaaIx = await utils.createPostVaaInstruction(
            connection,
            WORMHOLE_PROGRAM,
            keypair.publicKey,
            vaa as any,
            signatureSetKeypair.publicKey
        );

        const postTx = new Transaction();
        postTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }));
        postTx.add(postVaaIx);
        
        console.log('Sending post VAA tx...');
        const postSig = await sendAndConfirmTransaction(
            connection, 
            postTx, 
            [keypair],
            { commitment: 'confirmed' }
        );

        console.log('\n🎉 VAA posted!');
        console.log('Transaction:', postSig);
        console.log('Explorer:', `https://explorer.solana.com/tx/${postSig}?cluster=devnet`);
    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        if (error.logs) {
            console.error('Logs:', error.logs.join('\n'));
        }
        throw error;
    }
}

main().catch(console.error);
