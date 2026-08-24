// Jest-only stub. Redirected via moduleNameMapper so that test files which
// merely need `@solana/web3.js` class *references* as DI tokens (never
// actually invoked, since the real service is provided as a full jest mock)
// don't have to load the real package — which transitively pulls in an
// ESM-only build of `uuid` via `rpc-websockets` that Jest's default CJS
// transform can't parse. Never used by the production build.

export class Connection {}
export class Keypair {
  static fromSeed(): Keypair {
    return new Keypair()
  }
}
export class PublicKey {}
export class Transaction {
  add(): this {
    return this
  }
}
export type TransactionInstruction = unknown
export function sendAndConfirmTransaction(): Promise<string> {
  return Promise.resolve('')
}
