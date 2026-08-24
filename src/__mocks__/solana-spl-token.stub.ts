// Jest-only stub — see solana-web3.stub.ts for why this exists.

export function getAssociatedTokenAddressSync(): unknown {
  return undefined
}
export function getAccount(): Promise<unknown> {
  return Promise.resolve(undefined)
}
export class TokenAccountNotFoundError extends Error {}
export function createAssociatedTokenAccountInstruction(): unknown {
  return undefined
}
export function createTransferCheckedInstruction(): unknown {
  return undefined
}
