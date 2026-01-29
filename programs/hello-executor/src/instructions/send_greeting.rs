use anchor_lang::prelude::*;
use anchor_lang::solana_program;
use wormhole_anchor_sdk::wormhole::{self, program::Wormhole};

use crate::{
    error::HelloExecutorError,
    message::{HelloExecutorMessage, GREETING_MAX_LENGTH},
    state::{Config, WormholeEmitter},
};

use super::SEED_PREFIX_SENT;

#[derive(Accounts)]
pub struct SendGreeting<'info> {
    #[account(mut)]
    /// Payer for the Wormhole fee and message account.
    pub payer: Signer<'info>,

    #[account(
        seeds = [Config::SEED_PREFIX],
        bump,
    )]
    /// Config account with Wormhole addresses.
    pub config: Account<'info, Config>,

    /// Wormhole Core Bridge program.
    pub wormhole_program: Program<'info, Wormhole>,

    #[account(
        mut,
        address = config.wormhole.bridge @ HelloExecutorError::InvalidWormholeConfig,
    )]
    /// Wormhole bridge data.
    pub wormhole_bridge: Account<'info, wormhole::BridgeData>,

    #[account(
        mut,
        address = config.wormhole.fee_collector @ HelloExecutorError::InvalidWormholeFeeCollector,
    )]
    /// Wormhole fee collector.
    pub wormhole_fee_collector: Account<'info, wormhole::FeeCollector>,

    #[account(
        seeds = [WormholeEmitter::SEED_PREFIX],
        bump,
    )]
    /// Program's emitter account.
    pub wormhole_emitter: Account<'info, WormholeEmitter>,

    #[account(
        mut,
        address = config.wormhole.sequence @ HelloExecutorError::InvalidWormholeSequence,
    )]
    /// Emitter's sequence account.
    pub wormhole_sequence: Account<'info, wormhole::SequenceTracker>,

    #[account(
        mut,
        seeds = [
            SEED_PREFIX_SENT,
            &wormhole_sequence.next_value().to_le_bytes()[..],
        ],
        bump,
    )]
    /// CHECK: Wormhole message account. Written by Wormhole program.
    pub wormhole_message: UncheckedAccount<'info>,

    /// System program.
    pub system_program: Program<'info, System>,

    /// Clock sysvar.
    pub clock: Sysvar<'info, Clock>,

    /// Rent sysvar.
    pub rent: Sysvar<'info, Rent>,
}

/// Event emitted when a greeting is sent.
#[event]
pub struct GreetingSent {
    /// The greeting message.
    pub greeting: String,
    /// Sequence number of the Wormhole message.
    pub sequence: u64,
    /// Timestamp of the transaction.
    pub timestamp: i64,
}

pub fn handler(ctx: Context<SendGreeting>, greeting: String) -> Result<()> {
    // Validate message length
    require!(
        greeting.len() <= GREETING_MAX_LENGTH,
        HelloExecutorError::MessageTooLarge,
    );

    // Pay Wormhole fee if required
    let fee = ctx.accounts.wormhole_bridge.fee();
    if fee > 0 {
        solana_program::program::invoke(
            &solana_program::system_instruction::transfer(
                &ctx.accounts.payer.key(),
                &ctx.accounts.wormhole_fee_collector.key(),
                fee,
            ),
            &ctx.accounts.to_account_infos(),
        )?;
    }

    let wormhole_emitter = &ctx.accounts.wormhole_emitter;
    let config = &ctx.accounts.config;
    let sequence = ctx.accounts.wormhole_sequence.next_value();

    // Encode the greeting as payload
    let payload = HelloExecutorMessage::Hello {
        message: greeting.as_bytes().to_vec(),
    }
    .try_to_vec()?;

    // Post message through Wormhole
    wormhole::post_message(
        CpiContext::new_with_signer(
            ctx.accounts.wormhole_program.to_account_info(),
            wormhole::PostMessage {
                config: ctx.accounts.wormhole_bridge.to_account_info(),
                message: ctx.accounts.wormhole_message.to_account_info(),
                emitter: wormhole_emitter.to_account_info(),
                sequence: ctx.accounts.wormhole_sequence.to_account_info(),
                payer: ctx.accounts.payer.to_account_info(),
                fee_collector: ctx.accounts.wormhole_fee_collector.to_account_info(),
                clock: ctx.accounts.clock.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
            &[
                &[
                    SEED_PREFIX_SENT,
                    &sequence.to_le_bytes()[..],
                    &[ctx.bumps.wormhole_message],
                ],
                &[WormholeEmitter::SEED_PREFIX, &[wormhole_emitter.bump]],
            ],
        ),
        config.batch_id,
        payload,
        config.finality.try_into().unwrap(),
    )?;

    // Emit event
    let clock = &ctx.accounts.clock;
    emit!(GreetingSent {
        greeting,
        sequence,
        timestamp: clock.unix_timestamp,
    });

    msg!("Greeting sent! Sequence: {}", sequence);

    Ok(())
}
