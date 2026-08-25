// Generates a new BIP39 mnemonic and its Solana keypair (m/44'/501'/0'/0').
// Run with: npx ts-node scripts/generate-wallet.ts
//
// Usage:
//   - As a MASTER_MNEMONIC for this app's HD wallet derivation (Phase 2):
//     paste the mnemonic into MASTER_MNEMONIC and restart. Every user wallet
//     is derived from it — losing it means losing access to all wallets.
//   - As a standalone one-off wallet: use the mnemonic/address/secretKey as-is.
//
// Never commit the output. Never log it outside a secrets manager.

import { generateMnemonic, mnemonicToSeedSync } from 'bip39'
import { derivePath } from 'ed25519-hd-key'
import { Keypair } from '@solana/web3.js'

function main() {
  const mnemonic = generateMnemonic(256) // 24 words

  const seed = mnemonicToSeedSync(mnemonic)
  const path = "m/44'/501'/0'/0'"
  const { key } = derivePath(path, seed.toString('hex'))
  const keypair = Keypair.fromSeed(key)

  console.log('Mnemonic (24 words):')
  console.log(`  ${mnemonic}`)
  console.log()
  console.log(`Derivation path: ${path}`)
  console.log(`Public address:  ${keypair.publicKey.toBase58()}`)
  console.log(`Secret key (JSON array, Solana CLI keypair format):`)
  console.log(`  [${Array.from(keypair.secretKey).join(',')}]`)
}

main()
