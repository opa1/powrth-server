import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import {
  getAssociatedTokenAddressSync,
  getAccount,
  TokenAccountNotFoundError,
} from '@solana/spl-token'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { mnemonicToSeedSync } from 'bip39'
import { derivePath } from 'ed25519-hd-key'
import { ConfigService } from '../config/config.service'
import { resolveNetworkConfig } from '../config/network.config'
import { DatabaseService } from '../database/database.service'

const USDC_DECIMALS = 1_000_000

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name)
  private readonly connection: Connection
  private readonly usdcMintAddress: string

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {
    const net = resolveNetworkConfig(this.configService)
    this.connection = new Connection(net.rpcUrl, 'confirmed')
    this.usdcMintAddress = net.usdcMintAddress
    console.log(`[Wallet] Network: ${net.network} | RPC: ${net.rpcUrl}`)
  }

  // Deliberately duplicated with deriveKeypair rather than sharing code: this method's
  // exact behavior from Phase 2 must never drift, since that would break address
  // derivation for already-created users.
  deriveAddress(index: number): string {
    const mnemonic = this.configService.get('MASTER_MNEMONIC')
    const seed = mnemonicToSeedSync(mnemonic)
    const path = `m/44'/501'/${index}'/0'`
    const { key } = derivePath(path, seed.toString('hex'))
    const keypair = Keypair.fromSeed(key)
    return keypair.publicKey.toBase58()
  }

  getConnection(): Connection {
    return this.connection
  }

  async getOnChainUsdcBalance(walletAddress: string): Promise<number> {
    try {
      const publicKey = new PublicKey(walletAddress)
      const usdcMint = new PublicKey(this.usdcMintAddress)
      const ata = getAssociatedTokenAddressSync(usdcMint, publicKey)

      const account = await getAccount(this.connection, ata)
      return Number(account.amount) / USDC_DECIMALS
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError) {
        return 0
      }
      this.logger.error(
        `Failed to fetch on-chain USDC balance for ${walletAddress}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return 0
    }
  }

  /**
   * @internal Only WithdrawalService may call this. Never expose via HTTP.
   */
  async deriveKeypairForUser(userId: string): Promise<Keypair> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { walletKeyIndex: true },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    return this.deriveKeypair(user.walletKeyIndex)
  }

  async getPlatformBalance(
    userId: string,
  ): Promise<{ usdcBalance: number; walletAddress: string }> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { usdcBalance: true, walletAddress: true },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    return { usdcBalance: user.usdcBalance.toNumber(), walletAddress: user.walletAddress }
  }

  private deriveKeypair(index: number): Keypair {
    const mnemonic = this.configService.get('MASTER_MNEMONIC')
    const seed = mnemonicToSeedSync(mnemonic)
    const path = `m/44'/501'/${index}'/0'`
    const { key } = derivePath(path, seed.toString('hex'))
    return Keypair.fromSeed(key)
  }
}
