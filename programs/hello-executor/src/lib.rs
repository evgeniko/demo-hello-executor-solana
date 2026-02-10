use anchor_lang::prelude::*;

pub use error::*;
pub use instructions::*;
pub use message::*;
pub use state::*;

pub mod error;
pub mod executor_cpi;
pub mod executor_requests;
pub mod instructions;
pub mod message;
pub mod state;

declare_id!("5qAHNEvdL7gAj49q4jm1718h6tCGX5q8KBurM9iiQ4Rp");

#[program]
/// # Hello Executor
///
/// A cross-chain Hello World application using Wormhole's Executor service
/// for automatic message relay between SVM chains (Solana <-> Fogo).
///
/// ## Program Instructions
/// * [`initialize`](initialize) - Initialize program config
/// * [`register_peer`](register_peer) - Register a peer contract on another chain
/// * [`send_greeting`](send_greeting) - Send a cross-chain greeting
/// * [`receive_greeting`](receive_greeting) - Receive and process a greeting
///
/// ## Program Accounts
/// * [Config] - Program configuration
/// * [Peer] - Registered peer contracts
/// * [Received] - Received messages (replay protection)
/// * [WormholeEmitter] - Program's Wormhole emitter
pub mod hello_executor {
    use super::*;

    /// Initialize the program config and create the Wormhole emitter.
    ///
    /// # Arguments
    /// * `ctx` - Initialize context
    pub fn initialize(ctx: Context<Initialize>, chain_id: u16) -> Result<()> {
        instructions::initialize::handler(ctx, chain_id)
    }

    /// Register a peer contract on another chain.
    /// Only the owner can call this instruction.
    ///
    /// # Arguments
    /// * `ctx` - RegisterPeer context
    /// * `chain` - Wormhole chain ID of the peer
    /// * `address` - Universal address of the peer contract
    pub fn register_peer(
        ctx: Context<RegisterPeer>,
        chain: u16,
        address: [u8; 32],
    ) -> Result<()> {
        instructions::register_peer::handler(ctx, chain, address)
    }

    /// Send a cross-chain greeting message.
    ///
    /// This instruction:
    /// 1. Encodes the greeting as a payload
    /// 2. Publishes a message through Wormhole Core Bridge
    /// 3. Emits GreetingSent event
    ///
    /// Note: On SVM, the Executor relay is handled off-chain after VAA signing.
    /// The caller should call the Executor API to request relay after this tx.
    ///
    /// # Arguments
    /// * `ctx` - SendGreeting context
    /// * `greeting` - The greeting message to send
    pub fn send_greeting(ctx: Context<SendGreeting>, greeting: String) -> Result<()> {
        instructions::send_greeting::handler(ctx, greeting)
    }

    /// Receive and process a cross-chain greeting.
    ///
    /// This instruction verifies the VAA and processes the greeting payload.
    /// The Received account provides replay protection.
    ///
    /// # Arguments
    /// * `ctx` - ReceiveGreeting context
    /// * `vaa_hash` - Keccak256 hash of the verified VAA
    pub fn receive_greeting(ctx: Context<ReceiveGreeting>, vaa_hash: [u8; 32]) -> Result<()> {
        instructions::receive_greeting::handler(ctx, vaa_hash)
    }

    /// Request Executor relay for the most recently posted message.
    ///
    /// This instruction requests execution via the Executor program, using
    /// the signed quote and relay instructions provided off-chain.
    pub fn request_relay(ctx: Context<RequestRelay>, args: RequestRelayArgs) -> Result<()> {
        instructions::request_relay::handler(ctx, args)
    }

    /// Return an instruction for the Executor relayer to execute a VAA.
    pub fn execute_vaa_v1(ctx: Context<ExecuteVaaV1>, vaa_body: Vec<u8>) -> Result<Ix> {
        instructions::execute_vaa_v1::handler(ctx, vaa_body)
    }

    /// Fallback handler for unmatched discriminators.
    /// Handles camelCase discriminator (executeVaaV1) by routing to execute_vaa_v1.
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        use anchor_lang::Discriminator;
        
        // CamelCase discriminator: SHA256("global:executeVaaV1")[0..8]
        const CAMEL_EXECUTE_VAA_V1: [u8; 8] = [0x69, 0xfa, 0x40, 0xa8, 0x62, 0x9c, 0x7d, 0xe6];

        if data.len() >= 8 && data[..8] == CAMEL_EXECUTE_VAA_V1 {
            // Reconstruct data with the snake_case discriminator
            let mut new_data = Vec::with_capacity(data.len());
            new_data.extend_from_slice(&instruction::ExecuteVaaV1::DISCRIMINATOR);
            new_data.extend_from_slice(&data[8..]);
            
            // Re-invoke with corrected discriminator
            return __private::__global::execute_vaa_v1(program_id, accounts, &new_data[8..]);
        }

        Err(anchor_lang::error::ErrorCode::InstructionFallbackNotFound.into())
    }
}
