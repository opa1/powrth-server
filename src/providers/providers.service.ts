import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { MeterStatus, Provider, RelayState, User } from '../generated/prisma/client'

export interface ProviderWithUser extends Provider {
  user: User
}

export interface ProviderPublicProfile {
  id: string
  businessName: string | null
  pricePerKwh: number
  isVerified: boolean
  createdAt: Date
  user: {
    id: string
    name: string | null
    avatar: string | null
  }
}

export interface ProviderPrivateProfile {
  id: string
  businessName: string | null
  pricePerKwh: number
  isVerified: boolean
  totalEarned: number
  totalWithdrawn: number
  createdAt: Date
  updatedAt: Date
  user: {
    id: string
    name: string | null
    avatar: string | null
    email: string | null
    walletAddress: string
  }
}

export interface ProviderSummary {
  totalEarned: number
  totalWithdrawn: number
  availableBalance: number
  meterCount: number
  activeMetersCount: number
  consumerCount: number
  pricePerKwh: number
  isVerified: boolean
}

export interface ProviderConsumerItem {
  meterId: string
  meterAddr: string
  status: MeterStatus
  relayState: RelayState
  consumer: {
    id: string
    user: { id: string; name: string | null; avatar: string | null; walletAddress: string }
  }
  kwhBalance: number
  lastSyncedAt: Date | null
}

const DEFAULT_TAKE = 20
const MAX_TAKE = 50

@Injectable()
export class ProvidersService {
  constructor(private readonly db: DatabaseService) {}

  async findById(providerId: string): Promise<ProviderWithUser> {
    const provider = await this.db.provider.findUnique({
      where: { id: providerId },
      include: { user: true },
    })

    if (!provider) {
      throw new NotFoundException('Provider not found')
    }

    return provider
  }

  async findByUserId(userId: string): Promise<ProviderWithUser> {
    const provider = await this.db.provider.findUnique({
      where: { userId },
      include: { user: true },
    })

    if (!provider) {
      throw new NotFoundException('Provider not found')
    }

    return provider
  }

  async listAll(params: {
    skip?: number
    take?: number
  }): Promise<{ items: ProviderWithUser[]; total: number }> {
    const skip = params.skip ?? 0
    const take = Math.min(params.take ?? DEFAULT_TAKE, MAX_TAKE)

    const [items, total] = await this.db.$transaction([
      this.db.provider.findMany({
        where: { isVerified: true },
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.db.provider.count({ where: { isVerified: true } }),
    ])

    return { items, total }
  }

  async updateProfile(
    userId: string,
    input: { businessName?: string; pricePerKwh?: number },
  ): Promise<Provider> {
    const provider = await this.db.provider.findUnique({ where: { userId } })

    if (!provider) {
      throw new NotFoundException('Provider not found')
    }

    if (input.pricePerKwh !== undefined && input.pricePerKwh <= 0) {
      throw new BadRequestException('pricePerKwh must be greater than 0')
    }

    const data: { businessName?: string; pricePerKwh?: number } = {}
    if (input.businessName !== undefined) {
      data.businessName = input.businessName
    }
    if (input.pricePerKwh !== undefined) {
      data.pricePerKwh = input.pricePerKwh
    }

    return this.db.provider.update({ where: { userId }, data })
  }

  async getSummary(userId: string): Promise<ProviderSummary> {
    const provider = await this.findByUserId(userId)

    const [meterCount, activeMetersCount, consumerCount] = await Promise.all([
      this.db.meter.count({ where: { providerId: provider.id } }),
      this.db.meter.count({ where: { providerId: provider.id, status: 'ONLINE' } }),
      this.db.meter.count({ where: { providerId: provider.id, consumerId: { not: null } } }),
    ])

    return {
      totalEarned: provider.totalEarned.toNumber(),
      totalWithdrawn: provider.totalWithdrawn.toNumber(),
      availableBalance: provider.user.usdcBalance.toNumber(),
      meterCount,
      activeMetersCount,
      consumerCount,
      pricePerKwh: provider.pricePerKwh.toNumber(),
      isVerified: provider.isVerified,
    }
  }

  async listConsumers(userId: string): Promise<ProviderConsumerItem[]> {
    const provider = await this.findByUserId(userId)

    const meters = await this.db.meter.findMany({
      where: { providerId: provider.id, consumerId: { not: null } },
      include: {
        consumer: {
          include: {
            user: { select: { id: true, name: true, avatar: true, walletAddress: true } },
          },
        },
        energyBalance: { select: { kwhBalance: true, lastSyncedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return meters.flatMap((meter) => {
      if (!meter.consumer) {
        return []
      }

      return [
        {
          meterId: meter.id,
          meterAddr: meter.meterAddr,
          status: meter.status,
          relayState: meter.relayState,
          consumer: {
            id: meter.consumer.id,
            user: {
              id: meter.consumer.user.id,
              name: meter.consumer.user.name,
              avatar: meter.consumer.user.avatar,
              walletAddress: meter.consumer.user.walletAddress,
            },
          },
          kwhBalance: meter.energyBalance?.kwhBalance.toNumber() ?? 0,
          lastSyncedAt: meter.energyBalance?.lastSyncedAt ?? null,
        },
      ]
    })
  }
}
