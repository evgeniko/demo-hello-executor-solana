use anchor_lang::prelude::*;
use wormhole_anchor_sdk::wormhole::program::Wormhole;

use crate::state::Config;

#[derive(Accounts)]
pub struct ExecuteVaaV1<'info> {
    #[account(
        seeds = [Config::SEED_PREFIX],
        bump,
    )]
    /// Config account.
    pub config: Account<'info, Config>,

    /// Wormhole Core Bridge program.
    pub wormhole_program: Program<'info, Wormhole>,

    /// System program.
    pub system_program: Program<'info, System>,
}

// Note: The actual resolve_execute_vaa_v1 handler is in src/resolver.rs
// because it uses a custom discriminator and bypasses Anchor's normal flow.
