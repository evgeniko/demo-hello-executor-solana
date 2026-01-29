/**
 * Utility functions for Solana Wormhole integration
 */

import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, Idl } from '@coral-xyz/anchor';
import type { ChainConfig, ProgramAccounts } from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get a Solana connection for the given config
 */
export function getConnection(config: ChainConfig): Connection {
    return new Connection(config.rpcUrl, 'confirmed');
}

/**
 * Get an Anchor provider for the given config
 */
export function getProvider(config: ChainConfig): AnchorProvider {
    const connection = getConnection(config);
    const wallet = new Wallet(config.keypair);
    return new AnchorProvider(connection, wallet, {
        commitment: 'confirmed',
    });
}

/**
 * Load the HelloExecutor program IDL
 */
export function loadIdl(): Idl {
    const idlPath = path.join(__dirname, '..', 'target', 'idl', 'hello_executor.json');
    if (!fs.existsSync(idlPath)) {
        throw new Error(`IDL not found at ${idlPath}. Run 'anchor build' first.`);
    }
    return JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
}

/**
 * Get the HelloExecutor program
 */
export function getProgram(config: ChainConfig): Program {
    const provider = getProvider(config);
    const idl = loadIdl();
    // In Anchor 0.29, Program constructor takes (idl, provider)
    // and reads programId from IDL metadata
    // For custom programId, we need to update the IDL or use the address field
    const idlWithAddress = { ...idl, address: config.programId.toBase58() };
    return new Program(idlWithAddress as Idl, provider);
}

/**
 * Derive program PDAs
 */
export function deriveProgramAccounts(
    programId: PublicKey,
    wormholeProgramId: PublicKey
): ProgramAccounts {
    const [config] = PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        programId
    );

    const [wormholeEmitter] = PublicKey.findProgramAddressSync(
        [Buffer.from('emitter')],
        programId
    );

    const [wormholeBridge] = PublicKey.findProgramAddressSync(
        [Buffer.from('Bridge')],
        wormholeProgramId
    );

    const [wormholeFeeCollector] = PublicKey.findProgramAddressSync(
        [Buffer.from('fee_collector')],
        wormholeProgramId
    );

    const [wormholeSequence] = PublicKey.findProgramAddressSync(
        [Buffer.from('Sequence'), wormholeEmitter.toBuffer()],
        wormholeProgramId
    );

    return {
        config,
        wormholeEmitter,
        wormholeBridge,
        wormholeFeeCollector,
        wormholeSequence,
    };
}

/**
 * Derive the message PDA for a given sequence
 */
export function deriveMessagePda(
    programId: PublicKey,
    sequence: bigint
): PublicKey {
    const sequenceBuffer = Buffer.alloc(8);
    sequenceBuffer.writeBigUInt64LE(sequence);
    const [messagePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('sent'), sequenceBuffer],
        programId
    );
    return messagePda;
}

/**
 * Derive the peer PDA for a given chain ID
 */
export function derivePeerPda(programId: PublicKey, chainId: number): PublicKey {
    const chainIdBuffer = Buffer.alloc(2);
    chainIdBuffer.writeUInt16LE(chainId);
    const [peerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('peer'), chainIdBuffer],
        programId
    );
    return peerPda;
}

/**
 * Derive the received PDA for a given emitter chain and sequence
 */
export function deriveReceivedPda(
    programId: PublicKey,
    emitterChain: number,
    sequence: bigint
): PublicKey {
    const chainBuffer = Buffer.alloc(2);
    chainBuffer.writeUInt16LE(emitterChain);
    const sequenceBuffer = Buffer.alloc(8);
    sequenceBuffer.writeBigUInt64LE(sequence);

    const [receivedPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('received'), chainBuffer, sequenceBuffer],
        programId
    );
    return receivedPda;
}

/**
 * Convert a Solana public key to a 32-byte universal address
 */
export function toUniversalAddress(pubkey: PublicKey): Uint8Array {
    return pubkey.toBytes();
}

/**
 * Convert a Solana public key to a 32-byte universal address hex string (no 0x)
 */
export function toUniversalAddressHex(pubkey: PublicKey): string {
    return Buffer.from(toUniversalAddress(pubkey)).toString('hex');
}

/**
 * Convert a 32-byte universal address to a Solana public key
 */
export function fromUniversalAddress(address: Uint8Array): PublicKey {
    return new PublicKey(address);
}

/**
 * Request SOL from devnet faucet
 */
export async function requestAirdrop(
    config: ChainConfig,
    lamports: number = LAMPORTS_PER_SOL
): Promise<string> {
    const connection = getConnection(config);
    const signature = await connection.requestAirdrop(
        config.keypair.publicKey,
        lamports
    );
    await connection.confirmTransaction(signature);
    return signature;
}

/**
 * Get wallet balance in SOL
 */
export async function getBalance(config: ChainConfig): Promise<number> {
    const connection = getConnection(config);
    const balance = await connection.getBalance(config.keypair.publicKey);
    return balance / LAMPORTS_PER_SOL;
}

/**
 * Poll for VAA using Wormhole Scan API
 */
export async function pollForVAA(
    emitterChain: number,
    emitterAddress: string,
    sequence: number,
    network: 'Mainnet' | 'Testnet' = 'Testnet',
    timeoutMs: number = 120000
): Promise<{ vaa: string; timestamp: string } | null> {
    const startTime = Date.now();
    const baseUrl =
        network === 'Mainnet'
            ? 'https://api.wormholescan.io'
            : 'https://api.testnet.wormholescan.io';

    let paddedEmitter = emitterAddress.toLowerCase().replace(/^0x/, '');

    if (!/^[0-9a-f]+$/.test(paddedEmitter) || paddedEmitter.length !== 64) {
        try {
            const pubkey = new PublicKey(emitterAddress);
            paddedEmitter = Buffer.from(pubkey.toBytes()).toString('hex');
        } catch {
            // Leave as-is; the API will return 404 if it's invalid.
        }
    }

    paddedEmitter = paddedEmitter.padStart(64, '0');
    const url = `${baseUrl}/api/v1/vaas/${emitterChain}/${paddedEmitter}/${sequence}`;

    console.log(`\nPolling for VAA at ${url}...`);

    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json() as any;
                if (data.data?.vaa) {
                    console.log('\nVAA found!');
                    return {
                        vaa: data.data.vaa,
                        timestamp: data.data.timestamp,
                    };
                }
            }
        } catch (error) {
            // Ignore and continue polling
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
        process.stdout.write('.');
    }

    console.log('\nTimeout waiting for VAA');
    return null;
}

/**
 * Parse transaction logs to extract events
 */
export function parseTransactionLogs(
    logs: string[],
    eventName: string
): any | null {
    for (const log of logs) {
        if (log.includes(`Program log: ${eventName}:`)) {
            try {
                const jsonStr = log.split(`${eventName}:`)[1].trim();
                return JSON.parse(jsonStr);
            } catch {
                // Not JSON, return raw
                return log;
            }
        }
    }
    return null;
}
