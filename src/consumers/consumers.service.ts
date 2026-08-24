import { Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Consumer, MeterStatus, RelayState, User } from '../generated/prisma/client'

export interface ConsumerWithUser extends Consumer {
  user: User
}

export interface ConsumerProfile {
  id: string
  createdAt: Date
  updatedAt: Date
  user: {
    id: string
    name: string | null
    avatar: string | null
    walletAddress: string
  }
}

export interface ConsumerMeterItem {
  id: string
  meterAddr: string
  status: MeterStatus
  relayState: RelayState
  lastSeen: Date | null
  provider: { id: string; businessName: string | null; user: { id: string; name: string | null } }
  pricePerKwh: number
  kwhBalance: number
  kwhConsumed: number
  usdcLoaded: number
  lastSyncedAt: Date | null
  latestReading: {
    voltageA: number
    currentA: number
    activePowerW: number
    relayState: RelayState
    readAt: Date
  } | null
}

@Injectable()
export class ConsumersService {
  constructor(private readonly db: DatabaseService) {}

  async findByUserId(userId: string): Promise<ConsumerWithUser> {
    const consumer = await this.db.consumer.findUnique({
      where: { userId },
      include: { user: true },
    })

    if (!consumer) {
      throw new NotFoundException('Consumer not found')
    }

    return consumer
  }

  async getMetersWithBalances(userId: string): Promise<ConsumerMeterItem[]> {
    const consumer = await this.findByUserId(userId)

    const meters = await this.db.meter.findMany({
      where: { consumerId: consumer.id },
      include: {
        provider: { include: { user: { select: { id: true, name: true } } } },
        energyBalance: true,
        readings: { orderBy: { readAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    })

    return meters.flatMap((meter) => {
      if (!meter.provider) {
        return []
      }

      const latest = meter.readings[0]

      return [
        {
          id: meter.id,
          meterAddr: meter.meterAddr,
          status: meter.status,
          relayState: meter.relayState,
          lastSeen: meter.lastSeen,
          provider: {
            id: meter.provider.id,
            businessName: meter.provider.businessName,
            user: { id: meter.provider.user.id, name: meter.provider.user.name },
          },
          pricePerKwh: (meter.pricePerKwh ?? meter.provider.pricePerKwh).toNumber(),
          kwhBalance: meter.energyBalance?.kwhBalance.toNumber() ?? 0,
          kwhConsumed: meter.energyBalance?.kwhConsumed.toNumber() ?? 0,
          usdcLoaded: meter.energyBalance?.usdcLoaded.toNumber() ?? 0,
          lastSyncedAt: meter.energyBalance?.lastSyncedAt ?? null,
          latestReading: latest
            ? {
                voltageA: latest.voltageA.toNumber(),
                currentA: latest.currentA.toNumber(),
                activePowerW: latest.activePower.toNumber(),
                relayState: latest.relayState,
                readAt: latest.readAt,
              }
            : null,
        },
      ]
    })
  }
}
