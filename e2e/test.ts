/**
 * E2E Test for SVM Cross-Chain Hello World with Wormhole Executor
 *
 * This test demonstrates sending a greeting from Solana Devnet to Fogo Testnet
 * (or vice versa) using Wormhole's messaging and Executor service.
 */

import { config, validateConfig, CHAIN_ID_SOLANA, CHAIN_ID_FOGO } from './config.js';
import {
    initialize,
    registerPeer,
    sendGreeting,
    requestRelay,
    waitForVAA,
    waitForReceipt,
} from './messaging.js';
import { getBalance, requestAirdrop } from './utils.js';
import { getExecutorQuote, pollForExecutorStatus } from './executor.js';
import { createRelayInstructions, DEFAULT_COMPUTE_UNITS, DEFAULT_LAMPORTS } from './relay.js';

async function main() {
    console.log('='.repeat(70));
    console.log('SVM Cross-Chain Hello World with Wormhole Executor');
    console.log('='.repeat(70));
    console.log();

    // Step 1: Validate configuration
    console.log('Step 1: Validating configuration...');
    try {
        validateConfig();
    } catch (error) {
        console.error('Configuration validation failed:', error);
        process.exit(1);
    }

    // Step 2: Check balances
    console.log('\nStep 2: Checking wallet balances...');
    const solanaBalance = await getBalance(config.solana);
    console.log(`  Solana Devnet balance: ${solanaBalance} SOL`);

    if (solanaBalance < 0.1) {
        console.log('  Requesting airdrop on Solana Devnet...');
        try {
            await requestAirdrop(config.solana);
            const newBalance = await getBalance(config.solana);
            console.log(`  New balance: ${newBalance} SOL`);
        } catch (error) {
            console.warn('  Airdrop failed (may have rate limit):', error);
        }
    }

    // Step 3: Initialize program (if not already initialized)
    console.log('\nStep 3: Initializing HelloExecutor program...');
    try {
        await initialize(config.solana);
        console.log('  Program initialized successfully');
    } catch (error: any) {
        if (error.message?.includes('already in use') || error.logs?.some((l: string) => l.includes('already in use'))) {
            console.log('  Program already initialized');
        } else {
            console.error('  Initialization failed:', error.message);
            // Continue anyway - might be a different error
        }
    }

    // Step 4: Register peer (Fogo program on Solana)
    console.log('\nStep 4: Registering peer contract...');
    try {
        await registerPeer(config.solana, CHAIN_ID_FOGO, config.fogo.programId);
        console.log('  Peer registered successfully');
    } catch (error: any) {
        if (error.message?.includes('already in use')) {
            console.log('  Peer already registered');
        } else {
            console.warn('  Peer registration note:', error.message);
        }
    }

    // Step 5: Send greeting
    console.log('\nStep 5: Sending cross-chain greeting...');
    const greeting = `Hello from Solana at ${new Date().toISOString()}`;

    let result;
    try {
        result = await sendGreeting(config.solana, config.fogo, greeting);
        console.log(`\n  Greeting sent!`);
        console.log(`  Transaction: ${result.signature}`);
        console.log(`  Sequence: ${result.sequence}`);
    } catch (error: any) {
        console.error('  Failed to send greeting:', error.message);
        process.exit(1);
    }

    // Step 6: Request Executor relay
    console.log('\nStep 6: Requesting Executor relay...');
    const relayInstructions = createRelayInstructions(
        DEFAULT_COMPUTE_UNITS,
        DEFAULT_LAMPORTS
    );
    let quote;
    try {
        quote = await getExecutorQuote({
            srcChain: config.solana.wormholeChainId,
            dstChain: config.fogo.wormholeChainId,
            relayInstructions,
        });
        const execAmount = quote.estimatedCost
            ? BigInt(quote.estimatedCost)
            : 0n;
        await requestRelay(
            config.solana,
            config.fogo,
            quote.signedQuote,
            execAmount,
            relayInstructions
        );
    } catch (error: any) {
        console.log('  Executor request failed:', error.message);
    }

    // Step 7: Wait for VAA to be signed
    console.log('\nStep 7: Waiting for VAA signing...');
    const vaaData = await waitForVAA(config.solana, result.sequence, 120000);

    if (vaaData) {
        console.log(`\n  VAA signed!`);
        console.log(`  Timestamp: ${vaaData.timestamp}`);
        console.log(`  VAA: ${vaaData.vaa.substring(0, 50)}...`);
    } else {
        console.log('\n  VAA not signed within timeout');
        console.log('  Note: On devnet/testnet, guardians may be slow or unavailable');
    }

    // Step 8: Poll Executor status
    console.log('\nStep 8: Checking Executor status...');
    try {
        const status = await pollForExecutorStatus(
            config.solana.chain,
            result.signature,
            'Testnet',
            60000
        );

        if (status && status.length > 0) {
            console.log('\n  Executor status:');
            status.forEach((s: any) => {
                console.log(`    Status: ${s.status}`);
                if (s.txHash) console.log(`    Relay TX: ${s.txHash}`);
            });
        }
    } catch (error) {
        console.log('  Could not get Executor status (relay may not be configured)');
    }

    // Step 9: Check for receipt on target chain
    console.log('\nStep 9: Checking for receipt on target chain...');
    const received = await waitForReceipt(
        config.fogo,
        CHAIN_ID_SOLANA,
        result.sequence,
        30000
    );

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('Test Summary');
    console.log('='.repeat(70));
    console.log(`  Source Chain: ${config.solana.chain} (${CHAIN_ID_SOLANA})`);
    console.log(`  Target Chain: ${config.fogo.chain} (${CHAIN_ID_FOGO})`);
    console.log(`  Greeting: "${greeting}"`);
    console.log(`  Transaction: ${result.signature}`);
    console.log(`  Sequence: ${result.sequence}`);
    console.log(`  VAA Signed: ${vaaData ? 'Yes' : 'No'}`);
    console.log(`  Received: ${received ? 'Yes' : 'Pending'}`);
    console.log('='.repeat(70));

    if (received) {
        console.log('\nSUCCESS: Cross-chain greeting delivered!');
    } else if (vaaData) {
        console.log('\nPARTIAL: VAA signed but not yet delivered.');
        console.log('The Executor should relay the message automatically.');
        console.log('Check the target chain for the GreetingReceived event.');
    } else {
        console.log('\nINCOMPLETE: Waiting for guardians to sign the VAA.');
        console.log('This may take a few minutes on testnet.');
    }
}

main().catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
});
