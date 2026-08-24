import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Meter, RelayState, Role, Transaction, User } from '../generated/prisma/client'
import { RelayService } from '../meters/relay/relay.service'
import { PlatformConfigService } from './platform-config.service'

interface LoadCreditInput {
  callerUserId: string
  callerRole: Role
  meterId: string
  usdcAmount: number
  solanaSignature?: string
}

export interface TransactionWithRelations extends Transaction {
  meter: Meter | null
  loadedBy: User | null
}

export interface BalanceResult {
  meterId: string
  kwhBalance: number
  usdcLoaded: number
  kwhConsumed: number
  lastSyncedAt: Date | null
  meterReportedKwh: number | null
  lastReadingAt: Date | null
  relayState: RelayState
}

interface MeterAccess {
  providerId: string | null
  consumerId: string | null
}

const DEFAULT_HISTORY_TAKE = 20
const MAX_HISTORY_TAKE = 50

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly platformConfigService: PlatformConfigService,
    private readonly relayService: RelayService,
  ) {}

  async loadCredit(input: LoadCreditInput): Promise<TransactionWithRelations> {
    const meter = await this.db.meter.findUnique({
      where: { id: input.meterId },
      include: { provider: true },
    })

    if (!meter) {
      throw new NotFoundException('Meter not found')
    }

    const consumerId = meter.consumerId
    if (!consumerId) {
      throw new BadRequestException('Meter has no assigned consumer')
    }

    await this.assertAccess(meter, input.callerUserId, input.callerRole)

    const config = await this.platformConfigService.getConfig()
    if (input.usdcAmount < config.minCreditLoadUsdc.toNumber()) {
      throw new BadRequestException('Below minimum credit load amount')
    }

    const provider = meter.provider
    if (!provider) {
      // Unreachable in practice: assign() requires a provider to already own the meter
      // before a consumer can be linked, so a meter with consumerId set always has one.
      throw new NotFoundException('Meter has no provider')
    }

    const effectivePricePerKwh = (meter.pricePerKwh ?? provider.pricePerKwh).toNumber()

    if (effectivePricePerKwh <= 0) {
      throw new BadRequestException('Meter has no valid price configured')
    }

    const feeRateDecimal = config.feeRatePercent.toNumber()
    const platformFee = input.usdcAmount * feeRateDecimal
    const providerEarning = input.usdcAmount - platformFee
    const kwhAmount = providerEarning / effectivePricePerKwh

    const [createdTransaction] = await this.db.$transaction([
      this.db.transaction.create({
        data: {
          type: 'CREDIT_LOAD',
          status: 'CONFIRMED',
          loadedByUserId: input.callerUserId,
          meterId: meter.id,
          usdcAmount: input.usdcAmount,
          platformFee,
          platformFeeRate: feeRateDecimal,
          providerEarning,
          kwhAmount,
          pricePerKwhUsed: effectivePricePerKwh,
          solanaSignature: input.solanaSignature,
          note: null,
        },
      }),
      this.db.energyBalance.upsert({
        where: { meterId: meter.id },
        create: {
          consumerId,
          meterId: meter.id,
          kwhBalance: kwhAmount,
          usdcLoaded: input.usdcAmount,
        },
        update: {
          kwhBalance: { increment: kwhAmount },
          usdcLoaded: { increment: input.usdcAmount },
        },
      }),
      this.db.provider.update({
        where: { id: provider.id },
        data: { totalEarned: { increment: providerEarning } },
      }),
    ])

    await this.reconnectIfOff(meter, input.callerUserId)

    const detailed = await this.db.transaction.findUnique({
      where: { id: createdTransaction.id },
      include: { meter: true, loadedBy: true },
    })

    if (!detailed) {
      throw new NotFoundException('Transaction not found')
    }

    return detailed
  }

  async getBalance(
    callerUserId: string,
    callerRole: Role,
    meterId: string,
  ): Promise<BalanceResult> {
    const meter = await this.db.meter.findUnique({
      where: { id: meterId },
      include: { energyBalance: true },
    })

    if (!meter) {
      throw new NotFoundException('Meter not found')
    }

    await this.assertAccess(meter, callerUserId, callerRole)

    const latestReading = await this.db.meterReading.findFirst({
      where: { meterId },
      orderBy: { readAt: 'desc' },
    })

    return {
      meterId: meter.id,
      kwhBalance: meter.energyBalance?.kwhBalance.toNumber() ?? 0,
      usdcLoaded: meter.energyBalance?.usdcLoaded.toNumber() ?? 0,
      kwhConsumed: meter.energyBalance?.kwhConsumed.toNumber() ?? 0,
      lastSyncedAt: meter.energyBalance?.lastSyncedAt ?? null,
      meterReportedKwh: latestReading?.remainingKwh.toNumber() ?? null,
      lastReadingAt: latestReading?.readAt ?? null,
      relayState: meter.relayState,
    }
  }

  async getHistory(
    callerUserId: string,
    callerRole: Role,
    params: { meterId?: string; skip?: number; take?: number },
  ): Promise<{ items: TransactionWithRelations[]; total: number }> {
    if (params.meterId) {
      const meter = await this.db.meter.findUnique({ where: { id: params.meterId } })
      if (!meter) {
        throw new NotFoundException('Meter not found')
      }
      await this.assertAccess(meter, callerUserId, callerRole)
    }

    let meterFilter: { providerId: string } | { consumerId: string }

    if (callerRole === 'PROVIDER') {
      const provider = await this.db.provider.findUnique({ where: { userId: callerUserId } })
      if (!provider) {
        throw new NotFoundException('Provider not found')
      }
      meterFilter = { providerId: provider.id }
    } else if (callerRole === 'CONSUMER') {
      const consumer = await this.db.consumer.findUnique({ where: { userId: callerUserId } })
      if (!consumer) {
        throw new NotFoundException('Consumer not found')
      }
      meterFilter = { consumerId: consumer.id }
    } else {
      throw new ForbiddenException()
    }

    const skip = params.skip ?? 0
    const take = Math.min(params.take ?? DEFAULT_HISTORY_TAKE, MAX_HISTORY_TAKE)

    const where = {
      meter: { is: meterFilter },
      ...(params.meterId ? { meterId: params.meterId } : {}),
    }

    const [items, total] = await this.db.$transaction([
      this.db.transaction.findMany({
        where,
        include: { meter: true, loadedBy: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.db.transaction.count({ where }),
    ])

    return { items, total }
  }

  private async reconnectIfOff(meter: Meter, callerUserId: string): Promise<void> {
    const refreshed = await this.db.meter.findUnique({ where: { id: meter.id } })

    if (refreshed?.relayState === 'OFF') {
      this.relayService
        .sendCommand({
          meterId: meter.id,
          meterAddr: meter.meterAddr,
          action: 'CLOSE',
          trigger: 'TOPUP_RECONNECT',
          initiatedByUserId: callerUserId,
        })
        .catch((err: Error) => {
          this.logger.error(`[Billing] Reconnect failed: ${err.message}`)
        })
    }
  }

  private async assertAccess(
    meter: MeterAccess,
    callerUserId: string,
    callerRole: Role,
  ): Promise<void> {
    if (callerRole === 'PROVIDER') {
      const provider = await this.db.provider.findUnique({ where: { userId: callerUserId } })
      if (!provider) {
        throw new NotFoundException('Provider not found')
      }
      if (meter.providerId !== provider.id) {
        throw new ForbiddenException()
      }
      return
    }

    if (callerRole === 'CONSUMER') {
      const consumer = await this.db.consumer.findUnique({ where: { userId: callerUserId } })
      if (!consumer) {
        throw new NotFoundException('Consumer not found')
      }
      if (meter.consumerId !== consumer.id) {
        throw new ForbiddenException()
      }
      return
    }

    throw new ForbiddenException()
  }
}
