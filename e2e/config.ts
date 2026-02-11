/**
 * Configuration for cross-chain E2E tests
 * Supports Solana Devnet <-> Fogo Testnet
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import { toChainId } from '@wormhole-foundation/sdk-base';
import type { ChainConfig } from './types.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// Load keypair from file or environment
function loadKeypair(envVar: string, filePath?: string): Keypair {
    // Try environment variable first (base58 encoded)
    const envKey = process.env[envVar];
    if (envKey) {
        try {
            // Try parsing as JSON array
            const parsed = JSON.parse(envKey);
            if (Array.isArray(parsed)) {
                return Keypair.fromSecretKey(Uint8Array.from(parsed));
            }
        } catch {
            // Try parsing as base58
            const bs58 = require('bs58');
            return Keypair.fromSecretKey(bs58.decode(envKey));
        }
    }

    // Try file path
    if (filePath && fs.existsSync(filePath)) {
        const keyData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return Keypair.fromSecretKey(Uint8Array.from(keyData));
    }

    // Default to ~/.config/solana/id.json
    const defaultPath = path.join(
        process.env.HOME || '',
        '.config/solana/id.json'
    );
    if (fs.existsSync(defaultPath)) {
        const keyData = JSON.parse(fs.readFileSync(defaultPath, 'utf-8'));
        return Keypair.fromSecretKey(Uint8Array.from(keyData));
    }

    throw new Error(`No keypair found for ${envVar}`);
}

// Wormhole Chain IDs
export const CHAIN_ID_SOLANA = 1;
export const CHAIN_ID_FOGO = 51;

// Program addresses (placeholder - will be updated after deployment)
const HELLO_EXECUTOR_SOLANA =
    process.env.HELLO_EXECUTOR_SOLANA ||
    'He11oExec1111111111111111111111111111111111';
const HELLO_EXECUTOR_FOGO =
    process.env.HELLO_EXECUTOR_FOGO ||
    'He11oExec1111111111111111111111111111111111';

// Wormhole Core Bridge addresses
export const WORMHOLE_CORE_BRIDGE_SOLANA_DEVNET =
    '3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5';
export const WORMHOLE_CORE_BRIDGE_FOGO_TESTNET =
    'worm2mrQkG1B1KTz37erMfWN8anHkSK24nzca7UD8BB';

// Executor program addresses
export const EXECUTOR_PROGRAM_SOLANA =
    'execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYyuDRciV';
export const EXECUTOR_PROGRAM_FOGO =
    'execXUrAsMnqMmTHj5m7N1YQgsDz3cwGLYCYyuDRciV';

// RPC URLs
const SOLANA_DEVNET_RPC =
    process.env.SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com';
const FOGO_TESTNET_RPC =
    process.env.FOGO_TESTNET_RPC || 'https://testnet.fogo.io/rpc';

export const config = {
    solana: {
        chain: 'Solana' as const,
        network: 'Testnet' as const,
        rpcUrl: SOLANA_DEVNET_RPC,
        keypair: loadKeypair('PRIVATE_KEY_SOLANA'),
        programId: new PublicKey(HELLO_EXECUTOR_SOLANA),
        wormholeChainId: CHAIN_ID_SOLANA,
        wormholeCoreBridge: new PublicKey(WORMHOLE_CORE_BRIDGE_SOLANA_DEVNET),
        executorProgram: new PublicKey(EXECUTOR_PROGRAM_SOLANA),
    } as ChainConfig & {
        wormholeCoreBridge: PublicKey;
        executorProgram: PublicKey;
    },
    fogo: {
        chain: 'Fogo' as const,
        network: 'Testnet' as const,
        rpcUrl: FOGO_TESTNET_RPC,
        keypair: loadKeypair('PRIVATE_KEY_FOGO'),
        programId: new PublicKey(HELLO_EXECUTOR_FOGO),
        wormholeChainId: CHAIN_ID_FOGO,
        wormholeCoreBridge: new PublicKey(WORMHOLE_CORE_BRIDGE_FOGO_TESTNET),
        executorProgram: new PublicKey(EXECUTOR_PROGRAM_FOGO),
    } as ChainConfig & {
        wormholeCoreBridge: PublicKey;
        executorProgram: PublicKey;
    },
};

export function validateConfig(): void {
    const errors: string[] = [];
    const defaultKeypairPath = path.join(
        process.env.HOME || '',
        '.config/solana/id.json'
    );

    if (!process.env.PRIVATE_KEY_SOLANA && !fs.existsSync(defaultKeypairPath)) {
        errors.push('PRIVATE_KEY_SOLANA not set and no default keypair found');
    }

    if (!process.env.PRIVATE_KEY_FOGO && !fs.existsSync(defaultKeypairPath)) {
        errors.push('PRIVATE_KEY_FOGO not set and no default keypair found');
    }

    if (errors.length > 0) {
        console.error('Configuration errors:');
        errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(1);
    }

    console.log('Configuration validated:');
    console.log(`  Solana Devnet RPC: ${config.solana.rpcUrl}`);
    console.log(`  Fogo Testnet RPC: ${config.fogo.rpcUrl}`);
    console.log(`  Solana Program: ${config.solana.programId.toBase58()}`);
    console.log(`  Fogo Program: ${config.fogo.programId.toBase58()}`);
    console.log(`  Wallet: ${config.solana.keypair.publicKey.toBase58()}`);
}
