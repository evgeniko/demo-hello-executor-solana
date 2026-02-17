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
pub mod resolver;
pub mod state;

declare_id!("J27c2HY6VdpbKFusXVEGCN61chVfrHhHBAH6MXdJcSnk");

#[program]
/// # Hello Executor
///
/// A cross-chain Hello World application using Wormhole's Executor service
/// for automatic message relay between SVM chains (Solana <-> Fogo).
pub mod hello_executor {
    use super::*;

    /// Initialize the program config and create the Wormhole emitter.
    pub fn initialize(ctx: Context<Initialize>, chain_id: u16) -> Result<()> {
        instructions::initialize::handler(ctx, chain_id)
    }

    /// Register a peer contract on another chain.
    pub fn register_peer(
        ctx: Context<RegisterPeer>,
        chain: u16,
        address: [u8; 32],
    ) -> Result<()> {
        instructions::register_peer::handler(ctx, chain, address)
    }

    /// Send a cross-chain greeting message.
    pub fn send_greeting(ctx: Context<SendGreeting>, greeting: String) -> Result<()> {
        instructions::send_greeting::handler(ctx, greeting)
    }

    /// Receive and process a cross-chain greeting.
    pub fn receive_greeting(ctx: Context<ReceiveGreeting>, vaa_hash: [u8; 32]) -> Result<()> {
        instructions::receive_greeting::handler(ctx, vaa_hash)
    }

    /// Request Executor relay for the most recently posted message.
    pub fn request_relay(ctx: Context<RequestRelay>, args: RequestRelayArgs) -> Result<()> {
        instructions::request_relay::handler(ctx, args)
    }

    /// Update Wormhole configuration (owner only).
    pub fn update_wormhole_config(ctx: Context<UpdateWormholeConfig>) -> Result<()> {
        instructions::update_config::handler(ctx)
    }

    /// Executor resolver: returns instructions for a VAA execution.
    /// 
    /// NOTE: This uses the standard Anchor discriminator. The Executor expects
    /// discriminator 94b8a9decf089a7f. We handle this via a fallback instruction
    /// in Anchor that routes to this handler.
    /// 
    /// Expected accounts: Config, Wormhole Program, System Program
    pub fn resolve_execute_vaa_v1(
        ctx: Context<ExecuteVaaV1>,
        vaa_body: Vec<u8>,
    ) -> Result<resolver::ResolverType<resolver::ResolverInstructionGroups>> {
        resolver::handle_resolve(ctx, vaa_body)
    }

    /// Fallback instruction handler - routes Executor's discriminator to our resolver.
    /// The Executor uses discriminator [148, 184, 169, 222, 207, 8, 154, 127] (94b8a9decf089a7f).
    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        // Executor resolver discriminator
        const EXECUTOR_DISCRIMINATOR: [u8; 8] = [148, 184, 169, 222, 207, 8, 154, 127];

        if data.len() >= 8 && data[..8] == EXECUTOR_DISCRIMINATOR {
            msg!("Executor resolver call detected");
            return resolver::handle_resolve_raw(program_id, accounts, &data[8..]);
        }

        Err(anchor_lang::error::ErrorCode::InstructionFallbackNotFound.into())
    }
}
