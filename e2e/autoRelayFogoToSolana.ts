#!/usr/bin/env tsx
/**
 * Automatic relay: Fogo Testnet → Solana Devnet via Executor
 */

import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction, sendAndConfirmTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { serializeLayout } from '@wormhole-foundation/sdk-connect';
import { relayInstructionsLayout } from '@wormhole-foundation/sdk-definitions';

// Fogo Testnet config
const FOGO_RPC = 'https://testnet.fogo.io';
const PROGRAM_ID = new PublicKey('J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk');
const WORMHOLE_PROGRAM = new PublicKey('BhnQyKoQQgpuRTRo6D8Emz93PvXCYfVgHhnrR4T3qhw4');
const EXECUTOR_PROGRAM = new PublicKey('execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYyuDRciV');
const KEYPAIR_PATH = path.join(process.env.HOME || '', '.config/solana/test-wallets/fogo-testnet.json');

const CHAIN_ID_SOLANA = 1;
const CHAIN_ID_FOGO = 51;

const EXECUTOR_API = 'https://executor-testnet.labsapis.com/v0';

function loadKeypair(): Keypair {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'))));
}

function getDiscriminator(name: string): Buffer {
    const hash = createHash('sha256');
    hash.update(`global:${name}`);
    return Buffer.from(hash.digest().slice(0, 8));
}

function buildRelayInstructions(gasLimit: bigint): Buffer {
    return Buffer.from(serializeLayout(relayInstructionsLayout, {
        requests: [{ request: { type: "GasInstruction", gasLimit, msgValue: 0n }}],
    }));
}

async function getQuote(srcChain: number, dstChain: number, gasLimit: number = 200000) {
    const res = await fetch(`${EXECUTOR_API}/quote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ srcChain, dstChain, gasLimit }),
    });
    if (!res.ok) throw new Error(`Quote failed: ${await res.text()}`);
    return res.json();
}

async function pollStatus(txHash: string, srcChain: string = 'Fogo', timeout = 180000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const res = await fetch(`${EXECUTOR_API}/status/tx?srcChain=${srcChain}&txHash=${txHash}&env=Testnet`);
            const data = await res.json();
            if (Array.isArray(data) && data[0]) {
                const s = data[0].status;
                if (s === 'completed') return { success: true, data: data[0] };
                if (s === 'aborted' || s === 'error') return { success: false, data: data[0] };
                process.stdout.write(`(${s})`);
            }
        } catch {}
        await new Promise(r => setTimeout(r, 5000));
        process.stdout.write('.');
    }
    return null;
}

async function main() {
    const greeting = process.argv[2] || 'Auto-relay Fogo→Solana! 🔥';
    console.log('🔥 Auto-Relay: Fogo Testnet → Solana Devnet\n');
    console.log(`Message: "${greeting}"`);
    
    const keypair = loadKeypair();
    const connection = new Connection(FOGO_RPC, 'confirmed');
    console.log(`Wallet: ${keypair.publicKey.toBase58()}`);
    console.log(`Balance: ${(await connection.getBalance(keypair.publicKey)) / 1e9} FOGO`);
    
    // PDAs
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
    const [emitterPda] = PublicKey.findProgramAddressSync([Buffer.from('emitter')], PROGRAM_ID);
    const [wormholeBridge] = PublicKey.findProgramAddressSync([Buffer.from('Bridge')], WORMHOLE_PROGRAM);
    const [wormholeFeeCollector] = PublicKey.findProgramAddressSync([Buffer.from('fee_collector')], WORMHOLE_PROGRAM);
    const [wormholeSequence] = PublicKey.findProgramAddressSync([Buffer.from('Sequence'), emitterPda.toBuffer()], WORMHOLE_PROGRAM);
    
    const chainBuf = Buffer.alloc(2); chainBuf.writeUInt16LE(CHAIN_ID_SOLANA);
    const [peerPda] = PublicKey.findProgramAddressSync([Buffer.from('peer'), chainBuf], PROGRAM_ID);
    
    // Get sequence
    const seqAccount = await connection.getAccountInfo(wormholeSequence);
    const sequence = seqAccount ? seqAccount.data.readBigUInt64LE(0) + 1n : 1n;
    const seqBuf = Buffer.alloc(8); seqBuf.writeBigUInt64LE(sequence);
    const [wormholeMessage] = PublicKey.findProgramAddressSync([Buffer.from('sent'), seqBuf], PROGRAM_ID);
    
    console.log(`\nSequence: ${sequence}`);
    
    // Get quote
    console.log('\n📊 Getting Executor quote...');
    const quote = await getQuote(CHAIN_ID_FOGO, CHAIN_ID_SOLANA, 200000);
    console.log(`   Quote: ${quote.signedQuote.slice(0, 50)}...`);
    
    const quoteBytes = Buffer.from(quote.signedQuote.replace('0x', ''), 'hex');
    const payee = new PublicKey(quoteBytes.slice(24, 56));
    console.log(`   Payee: ${payee.toBase58()}`);
    
    const execAmount = BigInt(10_000_000); // 0.01 FOGO
    
    // Build send_greeting
    const sendData = Buffer.concat([
        getDiscriminator('send_greeting'),
        Buffer.from([greeting.length & 0xff, (greeting.length >> 8) & 0xff, 0, 0]),
        Buffer.from(greeting, 'utf-8')
    ]);
    
    const sendIx = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: WORMHOLE_PROGRAM, isSigner: false, isWritable: false },
            { pubkey: wormholeBridge, isSigner: false, isWritable: true },
            { pubkey: wormholeFeeCollector, isSigner: false, isWritable: true },
            { pubkey: emitterPda, isSigner: false, isWritable: true },
            { pubkey: wormholeSequence, isSigner: false, isWritable: true },
            { pubkey: wormholeMessage, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: sendData,
    });
    
    // Build request_relay  
    const relayInstructions = buildRelayInstructions(200000n);
    const dstChainBuf = Buffer.alloc(2); dstChainBuf.writeUInt16LE(CHAIN_ID_SOLANA);
    const execAmountBuf = Buffer.alloc(8); execAmountBuf.writeBigUInt64LE(execAmount);
    const quoteLenBuf = Buffer.alloc(4); quoteLenBuf.writeUInt32LE(quoteBytes.length);
    const relayLenBuf = Buffer.alloc(4); relayLenBuf.writeUInt32LE(relayInstructions.length);
    
    const relayData = Buffer.concat([
        getDiscriminator('request_relay'),
        dstChainBuf, execAmountBuf, quoteLenBuf, quoteBytes, relayLenBuf, relayInstructions
    ]);
    
    // Executor PDAs
    
    const relayIx = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },  // payer
            { pubkey: payee, isSigner: false, isWritable: true },             // payee
            { pubkey: configPda, isSigner: false, isWritable: false },        // config
            { pubkey: peerPda, isSigner: false, isWritable: false },          // peer
            { pubkey: emitterPda, isSigner: false, isWritable: false },       // wormhole_emitter
            { pubkey: WORMHOLE_PROGRAM, isSigner: false, isWritable: false }, // wormhole_program
            { pubkey: wormholeSequence, isSigner: false, isWritable: false }, // wormhole_sequence
            { pubkey: EXECUTOR_PROGRAM, isSigner: false, isWritable: false }, // executor_program
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        ],
        programId: PROGRAM_ID,
        data: relayData,
    });
    
    console.log('\n📤 Sending transaction...');
    const tx = new Transaction()
        .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }))
        .add(sendIx)
        .add(relayIx);
    
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: 'confirmed' });
    console.log(`✅ TX: ${sig}`);
    
    console.log('\n⏳ Waiting for Executor relay...');
    const result = await pollStatus(sig, 'Fogo');
    
    if (result?.success) {
        console.log('\n\n🎉 SUCCESS! Message relayed to Solana!');
        console.log('Solana TX:', result.data.txs?.[0]?.txHash || 'check explorer');
    } else if (result) {
        console.log('\n\n❌ Relay failed:', result.data.failureCause || result.data.status);
    } else {
        console.log('\n\n⏱️ Timeout - check status manually');
    }
}

main().catch(e => {
    console.error('❌ Error:', e.message);
    if (e.logs) e.logs.forEach((l: string) => console.error('  ', l));
});
