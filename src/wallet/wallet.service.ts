import { Injectable } from '@nestjs/common'
import { Keypair } from '@solana/web3.js'
import { mnemonicToSeedSync } from 'bip39'
import { derivePath } from 'ed25519-hd-key'
import { ConfigService } from '../config/config.service'

@Injectable()
export class WalletService {
  constructor(private readonly configService: ConfigService) {}

  deriveAddress(index: number): string {
    const mnemonic = this.configService.get('MASTER_MNEMONIC')
    const seed = mnemonicToSeedSync(mnemonic)
    const path = `m/44'/501'/${index}'/0'`
    const { key } = derivePath(path, seed.toString('hex'))
    const keypair = Keypair.fromSeed(key)
    return keypair.publicKey.toBase58()
  }
}
