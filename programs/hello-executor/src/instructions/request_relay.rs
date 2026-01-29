use anchor_lang::prelude::*;
use wormhole_anchor_sdk::wormhole::{self, program::Wormhole};

use crate::{
    error::HelloExecutorError,
    executor_requests::make_vaa_v1_request,
    state::{Config, Peer, WormholeEmitter},
};

use crate::executor_cpi::{self, ExecutorProgram, RequestForExecutionArgs};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RequestRelayArgs {
    /// Wormhole chain ID of the destination chain.
    pub dst_chain: u16,
    /// Amount to pay the Executor (lamports).
    pub exec_amount: u64,
    /// Signed quote bytes from the Executor API.
    pub signed_quote_bytes: Vec<u8>,
    /// Relay instructions bytes.
    pub relay_instructions: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(args: RequestRelayArgs)]
pub struct RequestRelay<'info> {
    #[account(mut)]
    /// Payer for the Executor request.
    pub payer: Signer<'info>,

    #[account(mut)]
    /// CHECK: payee is enforced by the Executor program via signed quote.
    pub payee: UncheckedAccount<'info>,

    #[account(
        seeds = [Config::SEED_PREFIX],
        bump,
    )]
    /// Config account.
    pub config: Account<'info, Config>,

    #[account(
        seeds = [Peer::SEED_PREFIX, &args.dst_chain.to_le_bytes()[..]],
        bump,
    )]
    /// Registered peer on the destination chain.
    pub peer: Account<'info, Peer>,

    #[account(
        seeds = [WormholeEmitter::SEED_PREFIX],
        bump,
    )]
    /// Program's Wormhole emitter account.
    pub wormhole_emitter: Account<'info, WormholeEmitter>,

    /// Wormhole Core Bridge program.
    pub wormhole_program: Program<'info, Wormhole>,

    #[account(
        address = config.wormhole.sequence @ HelloExecutorError::InvalidWormholeSequence,
        seeds = [
            wormhole::SequenceTracker::SEED_PREFIX,
            wormhole_emitter.key().as_ref(),
        ],
        bump,
        seeds::program = wormhole_program.key,
    )]
    /// CHECK: Emitter's sequence account.
    pub wormhole_sequence: UncheckedAccount<'info>,

    /// Executor program.
    pub executor_program: Program<'info, ExecutorProgram>,

    /// System program.
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RequestRelay>, args: RequestRelayArgs) -> Result<()> {
    let mut buf = &ctx.accounts.wormhole_sequence.try_borrow_data()?[..];
    let seq = wormhole::SequenceTracker::try_deserialize(&mut buf)?;
    require!(seq.sequence > 0, HelloExecutorError::NoMessagesYet);

    let request_bytes = make_vaa_v1_request(
        ctx.accounts.config.chain_id,
        ctx.accounts.wormhole_emitter.key().to_bytes(),
        seq.sequence - 1,
    );

    executor_cpi::request_for_execution(
        &ctx.accounts.executor_program.to_account_info(),
        &ctx.accounts.payer.to_account_info(),
        &ctx.accounts.payee.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        RequestForExecutionArgs {
            amount: args.exec_amount,
            dst_chain: args.dst_chain,
            dst_addr: ctx.accounts.peer.address,
            refund_addr: ctx.accounts.payer.key(),
            signed_quote_bytes: args.signed_quote_bytes,
            request_bytes,
            relay_instructions: args.relay_instructions,
        },
    )
}
