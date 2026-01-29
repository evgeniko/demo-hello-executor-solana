/**
 * Relay instructions utilities for Wormhole Executor on SVM
 */

/**
 * Create relay instructions for the Executor quote request
 *
 * Relay instructions tell the Executor:
 * - How many compute units to provide (gasLimit)
 * - How many lamports to forward (msgValue) for rent/fees
 *
 * Format: 0x01 (version byte) + uint128 gasLimit (16 bytes) + uint128 msgValue (16 bytes)
 */
export function createRelayInstructions(
    gasLimit: bigint,
    msgValue: bigint
): string {
    // Version byte 0x01 for relay instructions format
    const version = '01';

    // Encode as uint128 (16 bytes each, big-endian)
    const gasLimitHex = gasLimit.toString(16).padStart(32, '0'); // 16 bytes = 32 hex chars
    const msgValueHex = msgValue.toString(16).padStart(32, '0'); // 16 bytes = 32 hex chars

    // Combine: 0x + version (1 byte) + gasLimit (16 bytes) + msgValue (16 bytes)
    return '0x' + version + gasLimitHex + msgValueHex;
}

/**
 * Default compute units for receiving messages on SVM
 * Based on typical Wormhole message verification and processing:
 * - VAA verification
 * - Account creation (Received PDA)
 * - Event emission
 */
export const DEFAULT_COMPUTE_UNITS = 200_000n;

/**
 * Default lamports for relay instructions
 * Covers rent-exempt minimum for account creation
 */
export const DEFAULT_LAMPORTS = 0n;

/**
 * Parse relay instructions back into components
 */
export function parseRelayInstructions(
    relayInstructions: string
): { version: number; gasLimit: bigint; msgValue: bigint } | null {
    try {
        // Remove 0x prefix
        const hex = relayInstructions.startsWith('0x')
            ? relayInstructions.slice(2)
            : relayInstructions;

        if (hex.length !== 66) {
            // 1 + 32 + 32 = 65 bytes = 130 hex chars? No wait, 1 + 16 + 16 = 33 bytes = 66 hex chars
            return null;
        }

        const version = parseInt(hex.slice(0, 2), 16);
        const gasLimit = BigInt('0x' + hex.slice(2, 34));
        const msgValue = BigInt('0x' + hex.slice(34, 66));

        return { version, gasLimit, msgValue };
    } catch {
        return null;
    }
}

/**
 * Convert relay instructions hex string into bytes.
 */
export function relayInstructionsToBytes(relayInstructions: string): Uint8Array {
    const hex = relayInstructions.startsWith('0x')
        ? relayInstructions.slice(2)
        : relayInstructions;
    return Buffer.from(hex, 'hex');
}
