import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TokenAccountNotFoundError,
} from '@solana/spl-token'
import {
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { PlatformConfigService } from '../billing/platform-config.service'
import { ConfigService } from '../config/config.service'
import { resolveNetworkConfig } from '../config/network.config'
import { DatabaseService } from '../database/database.service'
import { Withdrawal } from '../generated/prisma/client'
import { WalletService } from './wallet.service'

interface RequestWithdrawalInput {
  callerUserId: string
  usdcAmount: number
  toWalletAddress: string
}

const USDC_DECIMALS = 6
const USDC_DECIMAL_FACTOR = 1_000_000

@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name)
  private readonly usdcMintAddress: string

  constructor(
    private readonly db: DatabaseService,
    private readonly walletService: WalletService,
    private readonly platformConfigService: PlatformConfigService,
    private readonly configService: ConfigService,
  ) {
    this.usdcMintAddress = resolveNetworkConfig(this.configService).usdcMintAddress
  }

  async requestWithdrawal(input: RequestWithdrawalInput): Promise<Withdrawal> {
    const config = await this.platformConfigService.getConfig()
    if (input.usdcAmount < config.minWithdrawalUsdc.toNumber()) {
      throw new BadRequestException('Below minimum withdrawal amount')
    }

    try {
      new PublicKey(input.toWalletAddress)
    } catch {
      throw new BadRequestException('Invalid Solana wallet address')
    }

    const provider = await this.db.provider.findUnique({
      where: { userId: input.callerUserId },
      include: { user: { select: { usdcBalance: true, walletKeyIndex: true } } },
    })

    if (!provider) {
      throw new NotFoundException('Provider not found')
    }

    const available = provider.user.usdcBalance.toNumber()
    if (input.usdcAmount > available) {
      throw new BadRequestException('Insufficient balance')
    }

    const withdrawal = await this.db.withdrawal.create({
      data: {
        providerId: provider.id,
        usdcAmount: input.usdcAmount,
        toWalletAddress: input.toWalletAddress,
        status: 'PENDING',
      },
    })

    try {
      const keypair = await this.walletService.deriveKeypairForUser(input.callerUserId)
      const connection = this.walletService.getConnection()
      const usdcMint = new PublicKey(this.usdcMintAddress)
      const fromPubkey = keypair.publicKey
      const toPubkey = new PublicKey(input.toWalletAddress)

      const fromAta = getAssociatedTokenAddressSync(usdcMint, fromPubkey)
      const toAta = getAssociatedTokenAddressSync(usdcMint, toPubkey)

      const instructions: TransactionInstruction[] = []

      try {
        await getAccount(connection, toAta)
      } catch (error) {
        if (error instanceof TokenAccountNotFoundError) {
          instructions.push(
            createAssociatedTokenAccountInstruction(fromPubkey, toAta, toPubkey, usdcMint),
          )
        } else {
          throw error
        }
      }

      const rawAmount = BigInt(Math.round(input.usdcAmount * USDC_DECIMAL_FACTOR))
      instructions.push(
        createTransferCheckedInstruction(
          fromAta,
          usdcMint,
          toAta,
          fromPubkey,
          rawAmount,
          USDC_DECIMALS,
        ),
      )

      const transaction = new Transaction().add(...instructions)
      const signature = await sendAndConfirmTransaction(connection, transaction, [keypair])

      const [updatedWithdrawal] = await this.db.$transaction([
        this.db.withdrawal.update({
          where: { id: withdrawal.id },
          data: { status: 'COMPLETED', solanaSignature: signature },
        }),
        this.db.user.update({
          where: { id: input.callerUserId },
          data: { usdcBalance: { decrement: input.usdcAmount } },
        }),
        this.db.provider.update({
          where: { id: provider.id },
          data: { totalWithdrawn: { increment: input.usdcAmount } },
        }),
      ])

      return updatedWithdrawal
    } catch (error) {
      await this.db.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: 'FAILED' },
      })

      this.logger.error(
        `[Withdrawal] ${withdrawal.id} failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      )

      throw new ServiceUnavailableException('Withdrawal failed. Please try again.')
    }
  }

  async listByProvider(callerUserId: string): Promise<Withdrawal[]> {
    const provider = await this.db.provider.findUnique({ where: { userId: callerUserId } })

    if (!provider) {
      throw new NotFoundException('Provider not found')
    }

    return this.db.withdrawal.findMany({
      where: { providerId: provider.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
  }
}
