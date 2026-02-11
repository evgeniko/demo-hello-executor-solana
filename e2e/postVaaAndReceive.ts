#!/usr/bin/env tsx
/**
 * Post VAA to Wormhole and call receive_greeting
 * Manual relay for testing when Executor shows "unsupported"
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Config
const SOLANA_RPC = process.env.SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com';
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

function loadIdl() {
    const idlPath = path.join(__dirname, '..', 'target', 'idl', 'hello_executor.json');
    return JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
}

async function main() {
    console.log('🔧 Manual VAA Relay Test\n');

    const keypair = loadKeypair();
    console.log('Wallet:', keypair.publicKey.toBase58());

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('Balance:', balance / 1e9, 'SOL');

    // Decode VAA
    const vaaBytes = Buffer.from(VAA_BASE64, 'base64');
    console.log('\nVAA length:', vaaBytes.length);

    // Parse VAA structure
    // Header: version(1) + guardian_set_index(4) + signature_count(1)
    // Signatures: count * 66 bytes each
    // Body: timestamp(4) + nonce(4) + emitter_chain(2) + emitter_address(32) + sequence(8) + consistency(1) + payload
    
    const sigCount = vaaBytes[5];
    const bodyStart = 6 + sigCount * 66;
    const vaaBody = vaaBytes.slice(bodyStart);
    
    // Hash the body for VAA verification
    const vaaHash = createHash('sha256').update(vaaBody).digest();
    console.log('VAA body hash:', vaaHash.toString('hex'));

    // Parse emitter info from body
    const emitterChain = vaaBody.readUInt16BE(8);
    const emitterAddress = vaaBody.slice(10, 42);
    const sequence = vaaBody.readBigUInt64BE(42);
    const payload = vaaBody.slice(51);
    
    console.log('\nVAA Details:');
    console.log('  Emitter chain:', emitterChain);
    console.log('  Emitter address:', emitterAddress.toString('hex'));
    console.log('  Sequence:', sequence.toString());
    console.log('  Payload:', payload.toString('utf8'));

    // Check if VAA is already posted
    const [postedVaaPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('PostedVAA'), vaaHash],
        WORMHOLE_PROGRAM
    );
    console.log('\nPosted VAA PDA:', postedVaaPda.toBase58());

    const postedVaaAccount = await connection.getAccountInfo(postedVaaPda);
    if (postedVaaAccount) {
        console.log('✅ VAA already posted to Wormhole');
    } else {
        console.log('❌ VAA not posted yet');
        console.log('\nTo post the VAA, you need the Wormhole SDK postVaa or worm CLI.');
        console.log('Install worm: npm install -g @wormhole-foundation/wormhole-cli');
        console.log('Then run: worm submit', VAA_BASE64, '--network devnet');
        return;
    }

    // Check if already received
    const chainBuffer = Buffer.alloc(2);
    chainBuffer.writeUInt16LE(emitterChain);
    const seqBuffer = Buffer.alloc(8);
    seqBuffer.writeBigUInt64LE(sequence);
    
    const [receivedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('received'), chainBuffer, seqBuffer],
        PROGRAM_ID
    );
    console.log('Received PDA:', receivedPda.toBase58());

    const receivedAccount = await connection.getAccountInfo(receivedPda);
    if (receivedAccount) {
        console.log('✅ Message already received!');
        return;
    }

    // Load program
    const wallet = new Wallet(keypair);
    const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    const idl = loadIdl();
    const program = new Program({ ...idl, address: PROGRAM_ID.toBase58() }, provider);

    // Derive other PDAs
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
    const [peerPda] = PublicKey.findProgramAddressSync([Buffer.from('peer'), chainBuffer], PROGRAM_ID);

    console.log('\nCalling receive_greeting...');
    console.log('  Config:', configPda.toBase58());
    console.log('  Peer:', peerPda.toBase58());
    console.log('  Received:', receivedPda.toBase58());

    try {
        const tx = await program.methods
            .receiveGreeting(Array.from(vaaHash))
            .accounts({
                payer: keypair.publicKey,
                config: configPda,
                wormholeProgram: WORMHOLE_PROGRAM,
                posted: postedVaaPda,
                peer: peerPda,
                received: receivedPda,
                systemProgram: PublicKey.default,
            })
            .rpc();

        console.log('\n🎉 SUCCESS! Transaction:', tx);
        console.log('Explorer:', `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        if (error.logs) {
            console.error('Logs:', error.logs.slice(-10).join('\n'));
        }
    }
}

main().catch(console.error);
