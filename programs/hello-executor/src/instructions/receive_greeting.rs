use anchor_lang::prelude::*;
use wormhole_anchor_sdk::wormhole::{self, program::Wormhole};

use crate::{
    error::HelloExecutorError,
    message::{HelloExecutorMessage, GREETING_MAX_LENGTH},
    state::{Config, Peer, Received},
};

/// Type alias for the posted VAA containing a HelloExecutorMessage.
type HelloExecutorVaa = wormhole::PostedVaa<HelloExecutorMessage>;

#[derive(Accounts)]
#[instruction(vaa_hash: [u8; 32])]
pub struct ReceiveGreeting<'info> {
    #[account(mut)]
    /// Payer for creating the Received account.
    pub payer: Signer<'info>,

    #[account(
        seeds = [Config::SEED_PREFIX],
        bump,
    )]
    /// Config account.
    pub config: Account<'info, Config>,

    /// Wormhole Core Bridge program.
    pub wormhole_program: Program<'info, Wormhole>,

    #[account(
        seeds = [
            wormhole::SEED_PREFIX_POSTED_VAA,
            &vaa_hash,
        ],
        bump,
        seeds::program = wormhole_program.key,
    )]
    /// The verified Wormhole VAA containing the greeting.
    pub posted: Account<'info, HelloExecutorVaa>,

    #[account(
        seeds = [
            Peer::SEED_PREFIX,
            &posted.emitter_chain().to_le_bytes()[..],
        ],
        bump,
        constraint = peer.verify(posted.emitter_address()) @ HelloExecutorError::UnknownEmitter,
    )]
    /// Registered peer that sent this message.
    pub peer: Account<'info, Peer>,

    #[account(
        init,
        payer = payer,
        seeds = [
            Received::SEED_PREFIX,
            &posted.emitter_chain().to_le_bytes()[..],
            &posted.sequence().to_le_bytes()[..],
        ],
        bump,
        space = Received::MAXIMUM_SIZE,
    )]
    /// Received account for replay protection.
    /// Creating this account prevents the same message from being processed twice.
    pub received: Account<'info, Received>,

    /// System program.
    pub system_program: Program<'info, System>,
}

/// Event emitted when a greeting is received.
#[event]
pub struct GreetingReceived {
    /// The greeting message.
    pub greeting: String,
    /// Chain ID of the sender.
    pub sender_chain: u16,
    /// Universal address of the sender.
    pub sender: [u8; 32],
    /// Sequence number of the Wormhole message.
    pub sequence: u64,
}

pub fn handler(ctx: Context<ReceiveGreeting>, vaa_hash: [u8; 32]) -> Result<()> {
    let posted = &ctx.accounts.posted;

    // Extract the greeting from the payload
    match posted.data() {
        HelloExecutorMessage::Hello { message } => {
            // Validate message length
            require!(
                message.len() <= GREETING_MAX_LENGTH,
                HelloExecutorError::InvalidMessage,
            );

            // Convert message to string for display
            let greeting = String::from_utf8(message.clone())
                .map_err(|_| HelloExecutorError::InvalidMessage)?;

            // Store in Received account for reference
            let received = &mut ctx.accounts.received;
            received.batch_id = posted.batch_id();
            received.wormhole_message_hash = vaa_hash;
            received.message = message.clone();

            // Emit event
            emit!(GreetingReceived {
                greeting: greeting.clone(),
                sender_chain: posted.emitter_chain(),
                sender: *posted.emitter_address(),
                sequence: posted.sequence(),
            });

            msg!(
                "Received greeting from chain {}: \"{}\"",
                posted.emitter_chain(),
                greeting
            );

            Ok(())
        }
        _ => Err(HelloExecutorError::InvalidMessage.into()),
    }
}
