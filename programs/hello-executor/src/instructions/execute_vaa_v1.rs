use anchor_lang::prelude::*;
use anchor_lang::InstructionData;
use wormhole_anchor_sdk::wormhole::{self, program::Wormhole};

use crate::{
    error::HelloExecutorError,
    state::{Config, Peer, Received},
};

/// Placeholder pubkey for the payer to be replaced by the Executor relayer.
const PAYER: &[u8; 32] = b"payer000000000000000000000000000";

#[derive(AnchorSerialize)]
pub struct AcctMeta {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(AnchorSerialize)]
pub struct Ix {
    pub program_id: Pubkey,
    pub accounts: Vec<AcctMeta>,
    pub data: Vec<u8>,
}

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

fn parse_vaa_body(vaa_body: &[u8]) -> Result<(u16, [u8; 32], u64)> {
    // VAA body layout:
    // timestamp(4) | nonce(4) | emitter_chain(2) | emitter_address(32) | sequence(8) | consistency(1) | payload(...)
    require!(vaa_body.len() >= 51, HelloExecutorError::InvalidVaa);

    let emitter_chain = u16::from_be_bytes(
        vaa_body[8..10]
            .try_into()
            .map_err(|_| HelloExecutorError::InvalidVaa)?,
    );

    let mut emitter_address = [0u8; 32];
    emitter_address.copy_from_slice(&vaa_body[10..42]);

    let sequence = u64::from_be_bytes(
        vaa_body[42..50]
            .try_into()
            .map_err(|_| HelloExecutorError::InvalidVaa)?,
    );

    Ok((emitter_chain, emitter_address, sequence))
}

pub fn handler(ctx: Context<ExecuteVaaV1>, vaa_body: Vec<u8>) -> Result<Ix> {
    let vaa_hash = solana_program::keccak::hashv(&[&vaa_body]).to_bytes();
    let (emitter_chain, _emitter_address, sequence) = parse_vaa_body(&vaa_body)?;

    let (posted_vaa, _) = Pubkey::find_program_address(
        &[wormhole::SEED_PREFIX_POSTED_VAA, &vaa_hash],
        &ctx.accounts.wormhole_program.key(),
    );

    let (peer, _) = Pubkey::find_program_address(
        &[Peer::SEED_PREFIX, &emitter_chain.to_le_bytes()],
        &crate::ID,
    );

    let (received, _) = Pubkey::find_program_address(
        &[
            Received::SEED_PREFIX,
            &emitter_chain.to_le_bytes(),
            &sequence.to_le_bytes(),
        ],
        &crate::ID,
    );

    let data = crate::instruction::ReceiveGreeting { vaa_hash }.data();

    Ok(Ix {
        program_id: crate::ID,
        accounts: vec![
            AcctMeta {
                pubkey: Pubkey::new_from_array(*PAYER),
                is_signer: true,
                is_writable: true,
            },
            AcctMeta {
                pubkey: ctx.accounts.config.key(),
                is_signer: false,
                is_writable: false,
            },
            AcctMeta {
                pubkey: ctx.accounts.wormhole_program.key(),
                is_signer: false,
                is_writable: false,
            },
            AcctMeta {
                pubkey: posted_vaa,
                is_signer: false,
                is_writable: false,
            },
            AcctMeta {
                pubkey: peer,
                is_signer: false,
                is_writable: false,
            },
            AcctMeta {
                pubkey: received,
                is_signer: false,
                is_writable: true,
            },
            AcctMeta {
                pubkey: ctx.accounts.system_program.key(),
                is_signer: false,
                is_writable: false,
            },
        ],
        data,
    })
}
