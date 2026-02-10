#!/usr/bin/env tsx
/**
 * Send a greeting from Solana Devnet to Sepolia with Executor auto-relay
 */

import { 
    Connection, 
    Keypair, 
    PublicKey, 
    SystemProgram,
    SYSVAR_CLOCK_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
    ComputeBudgetProgram,
} from '@solana/web3.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { serializeLayout } from '@wormhole-foundation/sdk-connect';
import { relayInstructionsLayout } from '@wormhole-foundation/sdk-definitions';

// Configuration
const SOLANA_RPC = process.env.SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.HELLO_EXECUTOR_SOLANA || '5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp');
const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || 
    path.join(process.env.HOME || '', '.config/solana/test-wallets/solana-devnet.json');

// Wormhole
const WORMHOLE_PROGRAM = new PublicKey('3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5');
const CHAIN_ID_SOLANA = 1;
const CHAIN_ID_SEPOLIA = 10002;

// Executor
const EXECUTOR_PROGRAM = new PublicKey('execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYyuDRciV');
const EXECUTOR_API = 'https://executor-testnet.labsapis.com/v0';

// Sepolia contract
const SEPOLIA_CONTRACT = process.env.HELLO_WORMHOLE_SEPOLIA_CROSSVM || '0xC83dcae38111019e8efbA0B78CE6BA055e7A3f2c';

function loadKeypair(): Keypair {
    if (!fs.existsSync(KEYPAIR_PATH)) {
        throw new Error(`Keypair not found at ${KEYPAIR_PATH}`);
    }
    const keyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
}

// PDAs
function deriveConfigPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
    return pda;
}

function deriveEmitterPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('emitter')], PROGRAM_ID);
    return pda;
}

function derivePeerPda(chainId: number): PublicKey {
    const chainIdBuffer = Buffer.alloc(2);
    chainIdBuffer.writeUInt16LE(chainId);
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('peer'), chainIdBuffer], PROGRAM_ID);
    return pda;
}

function deriveWormholeBridge(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('Bridge')], WORMHOLE_PROGRAM);
    return pda;
}

function deriveWormholeFeeCollector(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('fee_collector')], WORMHOLE_PROGRAM);
    return pda;
}

function deriveWormholeSequence(emitter: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from('Sequence'), emitter.toBuffer()],
        WORMHOLE_PROGRAM
    );
    return pda;
}

function deriveMessagePda(sequence: bigint): PublicKey {
    const sequenceBuffer = Buffer.alloc(8);
    sequenceBuffer.writeBigUInt64LE(sequence);
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('sent'), sequenceBuffer], PROGRAM_ID);
    return pda;
}

// Discriminators
function getDiscriminator(name: string): Buffer {
    const hash = createHash('sha256');
    hash.update(`global:${name}`);
    return Buffer.from(hash.digest().slice(0, 8));
}

// Get current sequence
async function getCurrentSequence(connection: Connection, sequencePda: PublicKey): Promise<bigint> {
    const accountInfo = await connection.getAccountInfo(sequencePda);
    if (!accountInfo) return 1n;
    return BigInt(accountInfo.data.readBigUInt64LE(0)) + 1n;
}

// Get Executor quote
async function getExecutorQuote(srcChain: number, dstChain: number, gasLimit: number = 200000): Promise<any> {
    const response = await fetch(`${EXECUTOR_API}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            srcChain,
            dstChain,
            gasLimit,
        }),
    });
    
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to get quote: ${response.status} ${text}`);
    }
    
    return response.json();
}

// Decode signed quote to get payee
function getPayeeFromSignedQuote(signedQuoteHex: string): PublicKey {
    // The signed quote contains the payee address at bytes 24-56
    const quoteBytes = Buffer.from(signedQuoteHex.replace('0x', ''), 'hex');
    if (quoteBytes.length < 56) {
        throw new Error('Signed quote is too short to extract payee');
    }
    const payeeBytes = quoteBytes.slice(24, 56);
    return new PublicKey(payeeBytes);
}

// Build relay instructions using SDK's layout serialization
// This ensures correct encoding with array wrapper
function buildRelayInstructions(gasLimit: bigint, msgValue: bigint = 0n): Buffer {
    const encoded = serializeLayout(relayInstructionsLayout, {
        requests: [
            {
                request: {
                    type: "GasInstruction",
                    gasLimit,
                    msgValue,
                },
            },
        ],
    });
    return Buffer.from(encoded);
}

// Poll for VAA
async function pollForVAA(emitterHex: string, sequence: number, timeoutMs: number = 180000): Promise<any> {
    const startTime = Date.now();
    const url = `https://api.testnet.wormholescan.io/api/v1/vaas/${CHAIN_ID_SOLANA}/${emitterHex}/${sequence}`;
    
    console.log(`Polling: ${url}`);
    
    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data: any = await response.json();
                if (data.data?.vaa) return data.data;
            }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 5000));
        process.stdout.write('.');
    }
    return null;
}

// Poll executor status
async function pollExecutorStatus(txHash: string, timeoutMs: number = 180000): Promise<any> {
    const startTime = Date.now();
    const url = `${EXECUTOR_API}/status/tx?srcChain=Solana&txHash=${txHash}&env=Testnet`;
    
    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data: any = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    const status = data[0].status;
                    if (status === 'completed' || status === 'error' || status === 'underpaid') {
                        return data;
                    }
                }
            }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 5000));
        process.stdout.write('*');
    }
    return null;
}

async function main() {
    console.log('🚀 Sending Greeting with Executor Relay: Solana → Sepolia\n');

    const greeting = process.argv[2] || 'Hello Sepolia via Executor! 🌊';
    console.log(`Message: "${greeting}"`);

    // Load keypair
    const keypair = loadKeypair();
    console.log(`\nWallet: ${keypair.publicKey.toBase58()}`);

    // Connect
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Balance: ${balance / 1e9} SOL`);

    // Derive PDAs
    const configPda = deriveConfigPda();
    const emitterPda = deriveEmitterPda();
    const peerPda = derivePeerPda(CHAIN_ID_SEPOLIA);
    const wormholeBridge = deriveWormholeBridge();
    const wormholeFeeCollector = deriveWormholeFeeCollector();
    const wormholeSequence = deriveWormholeSequence(emitterPda);

    // Get current sequence
    const sequence = await getCurrentSequence(connection, wormholeSequence);
    const wormholeMessage = deriveMessagePda(sequence);

    console.log(`\nSequence: ${sequence}`);

    // Step 1: Get Executor quote
    console.log('\n📊 Getting Executor quote...');
    const quote = await getExecutorQuote(CHAIN_ID_SOLANA, CHAIN_ID_SEPOLIA, 300000);
    console.log(`   Signed Quote: ${quote.signedQuote.slice(0, 60)}...`);
    
    // Parse cost from signed quote (bytes 37-45 contain the srcNativePriceQuote)
    const quoteBytes = Buffer.from(quote.signedQuote.replace('0x', ''), 'hex');
    // Based on executor quote format, extract estimated cost
    // We'll use a reasonable fixed amount for now: 0.01 SOL = 10_000_000 lamports
    const execAmount = BigInt(10_000_000); // 0.01 SOL
    console.log(`   Paying: ${execAmount} lamports (${Number(execAmount) / 1e9} SOL)`);

    // Parse payee from quote
    const payee = getPayeeFromSignedQuote(quote.signedQuote);
    console.log(`   Payee: ${payee.toBase58()}`);

    // Step 2: Build send_greeting instruction
    const sendDiscriminator = getDiscriminator('send_greeting');
    const greetingBytes = Buffer.from(greeting, 'utf-8');
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(greetingBytes.length);
    
    const sendData = Buffer.concat([sendDiscriminator, lengthBuffer, greetingBytes]);

    const sendInstruction = new TransactionInstruction({
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

    // Step 3: Build request_relay instruction
    const relayDiscriminator = getDiscriminator('request_relay');
    const relayInstructions = buildRelayInstructions(300000n, 0n); // gasLimit, msgValue (for EVM destination)
    console.log(`   Relay Instructions: 0x${relayInstructions.toString('hex')}`);
    console.log(`   Relay Instructions Length: ${relayInstructions.length} bytes`);
    const signedQuoteBytes = Buffer.from(quote.signedQuote.replace('0x', ''), 'hex');

    // Serialize RequestRelayArgs
    const dstChainBuf = Buffer.alloc(2);
    dstChainBuf.writeUInt16LE(CHAIN_ID_SEPOLIA);
    
    const execAmountBuf = Buffer.alloc(8);
    execAmountBuf.writeBigUInt64LE(execAmount);
    
    // Vec<u8> encoding: 4-byte length prefix + bytes
    const signedQuoteLenBuf = Buffer.alloc(4);
    signedQuoteLenBuf.writeUInt32LE(signedQuoteBytes.length);
    
    const relayInstructionsLenBuf = Buffer.alloc(4);
    relayInstructionsLenBuf.writeUInt32LE(relayInstructions.length);

    const relayData = Buffer.concat([
        relayDiscriminator,
        dstChainBuf,
        execAmountBuf,
        signedQuoteLenBuf,
        signedQuoteBytes,
        relayInstructionsLenBuf,
        relayInstructions,
    ]);

    const relayInstruction = new TransactionInstruction({
        keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: payee, isSigner: false, isWritable: true },
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: peerPda, isSigner: false, isWritable: false },
            { pubkey: emitterPda, isSigner: false, isWritable: false },
            { pubkey: WORMHOLE_PROGRAM, isSigner: false, isWritable: false },
            { pubkey: wormholeSequence, isSigner: false, isWritable: false },
            { pubkey: EXECUTOR_PROGRAM, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: relayData,
    });

    // Build transaction
    const transaction = new Transaction();
    transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }));
    transaction.add(sendInstruction);
    transaction.add(relayInstruction);

    console.log('\n📤 Sending transaction (greeting + relay request)...');
    
    try {
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [keypair],
            { commitment: 'confirmed' }
        );

        console.log(`\n✅ Transaction sent!`);
        console.log(`TX: ${signature}`);
        console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

        // Wait for VAA
        const emitterHex = Buffer.from(emitterPda.toBytes()).toString('hex');
        console.log(`\n⏳ Waiting for VAA (seq ${sequence})...`);
        const vaaData = await pollForVAA(emitterHex, Number(sequence), 180000);

        if (vaaData) {
            console.log('\n\n✅ VAA signed!');
        }

        // Wait for Executor
        console.log('\n⏳ Waiting for Executor relay...');
        const status = await pollExecutorStatus(signature, 180000);

        if (status) {
            console.log('\n\n📊 Executor Status:');
            console.log(JSON.stringify(status, null, 2));
            
            if (status[0]?.status === 'completed') {
                console.log('\n🎉 SUCCESS! Message delivered to Sepolia!');
                console.log(`Destination TX: ${status[0].txHash}`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('Links:');
        console.log(`  Wormhole Scan: https://testnet.wormholescan.io/#/tx/${signature}`);
        console.log(`  Executor Explorer: https://wormholelabs-xyz.github.io/executor-explorer/#/tx/${signature}?endpoint=https%3A%2F%2Fexecutor-testnet.labsapis.com&env=Testnet`);

    } catch (error: any) {
        console.error('\n❌ Transaction failed:', error.message);
        if (error.logs) {
            console.log('\nProgram logs:');
            error.logs.forEach((log: string) => console.log('  ', log));
        }
        throw error;
    }
}

main().catch((error) => {
    console.error('\n❌ Error:', error.message || error);
    process.exit(1);
});
