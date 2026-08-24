import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '../config/config.service'
import { DatabaseService } from '../database/database.service'

interface HeliusTokenTransfer {
  mint?: string
  tokenAmount?: number
  toUserAccount?: string
}

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  async processHeliusWebhook(payload: any[], incomingAuthHeader: string): Promise<void> {
    const expected = this.configService.get('HELIUS_WEBHOOK_SECRET')

    if (incomingAuthHeader !== expected) {
      throw new UnauthorizedException('Invalid webhook signature')
    }

    for (const tx of payload) {
      try {
        await this.processTransaction(tx)
      } catch (error) {
        this.logger.error(
          `Failed to process Helius transaction: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
  }

  private async processTransaction(tx: any): Promise<void> {
    const signature: string = tx.signature
    const tokenTransfers: HeliusTokenTransfer[] | undefined = tx.tokenTransfers

    if (!tokenTransfers || tokenTransfers.length === 0) {
      return
    }

    const usdcMint = this.configService.get('USDC_MINT_ADDRESS')

    for (const transfer of tokenTransfers) {
      if (transfer.mint !== usdcMint) {
        continue
      }

      if (!transfer.tokenAmount || transfer.tokenAmount <= 0) {
        continue
      }

      if (!transfer.toUserAccount) {
        continue
      }

      const user = await this.db.user.findUnique({
        where: { walletAddress: transfer.toUserAccount },
        select: { id: true },
      })

      if (!user) {
        continue
      }

      const existing = await this.db.walletDeposit.findUnique({
        where: { solanaSignature: signature },
      })

      if (existing) {
        continue
      }

      await this.db.$transaction([
        this.db.walletDeposit.create({
          data: {
            userId: user.id,
            walletAddress: transfer.toUserAccount,
            usdcAmount: transfer.tokenAmount,
            solanaSignature: signature,
            status: 'CONFIRMED',
            confirmedAt: new Date(),
          },
        }),
        this.db.user.update({
          where: { id: user.id },
          data: { usdcBalance: { increment: transfer.tokenAmount } },
        }),
      ])

      this.logger.log(`[Deposit] ${transfer.tokenAmount} USDC → user ${user.id}`)
    }
  }
}
