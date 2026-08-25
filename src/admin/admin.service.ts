import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Consumer, Meter, MeterStatus, Provider, User } from '../generated/prisma/client'
import { HeliusWebhookService } from '../helius/helius-webhook.service'
import { MeterSummary } from '../meters/meters.service'

type AdminUserSelect = Pick<
  User,
  'id' | 'name' | 'email' | 'walletAddress' | 'usdcBalance' | 'isActive' | 'createdAt'
>

const ADMIN_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  walletAddress: true,
  usdcBalance: true,
  isActive: true,
  createdAt: true,
} as const

export interface AdminUserSummary {
  id: string
  name: string | null
  email: string | null
  walletAddress: string
  usdcBalance: number
  isActive: boolean
  createdAt: Date
}

export interface PlatformOverview {
  totalUsers: number
  totalProviders: number
  totalConsumers: number
  totalMeters: number
  onlineMeters: number
  totalTransactionVolume: number
  totalPlatformFees: number
}

export interface AdminProviderItem {
  id: string
  businessName: string | null
  pricePerKwh: number
  isVerified: boolean
  totalEarned: number
  totalWithdrawn: number
  createdAt: Date
  user: AdminUserSummary
}

export interface AdminProviderDetail extends AdminProviderItem {
  meters: MeterSummary[]
}

export interface AdminConsumerItem {
  id: string
  createdAt: Date
  user: AdminUserSummary
  meterCount: number
}

export interface AdminMeterItem extends MeterSummary {
  providerId: string | null
  providerName: string | null
}

const DEFAULT_TAKE = 20
const MAX_TAKE = 50

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly heliusWebhookService: HeliusWebhookService,
  ) {}

  async getPlatformOverview(): Promise<PlatformOverview> {
    const [
      totalUsers,
      totalProviders,
      totalConsumers,
      totalMeters,
      onlineMeters,
      totalTransactionVolume,
      totalPlatformFees,
    ] = await Promise.all([
      this.db.user.count(),
      this.db.provider.count(),
      this.db.consumer.count(),
      this.db.meter.count(),
      this.db.meter.count({ where: { status: 'ONLINE' } }),
      this.db.transaction.aggregate({
        _sum: { usdcAmount: true },
        where: { status: 'CONFIRMED', type: 'CREDIT_LOAD' },
      }),
      this.db.transaction.aggregate({
        _sum: { platformFee: true },
        where: { status: 'CONFIRMED' },
      }),
    ])

    return {
      totalUsers,
      totalProviders,
      totalConsumers,
      totalMeters,
      onlineMeters,
      totalTransactionVolume: totalTransactionVolume._sum.usdcAmount?.toNumber() ?? 0,
      totalPlatformFees: totalPlatformFees._sum.platformFee?.toNumber() ?? 0,
    }
  }

  async listProviders(params: {
    skip?: number
    take?: number
    verified?: boolean
  }): Promise<{ items: AdminProviderItem[]; total: number }> {
    const skip = params.skip ?? 0
    const take = Math.min(params.take ?? DEFAULT_TAKE, MAX_TAKE)
    const where = params.verified !== undefined ? { isVerified: params.verified } : {}

    const [items, total] = await this.db.$transaction([
      this.db.provider.findMany({
        where,
        include: { user: { select: ADMIN_USER_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.db.provider.count({ where }),
    ])

    return { items: items.map((provider) => this.toProviderItem(provider)), total }
  }

  async getProviderById(providerId: string): Promise<AdminProviderDetail> {
    const provider = await this.db.provider.findUnique({
      where: { id: providerId },
      include: {
        user: { select: ADMIN_USER_SELECT },
        meters: {
          include: {
            consumer: { include: { user: { select: { id: true, name: true } } } },
          },
        },
      },
    })

    if (!provider) {
      throw new NotFoundException('Provider not found')
    }

    return {
      ...this.toProviderItem(provider),
      meters: provider.meters.map((meter) => this.toMeterSummary(meter)),
    }
  }

  async listConsumers(params: {
    skip?: number
    take?: number
  }): Promise<{ items: AdminConsumerItem[]; total: number }> {
    const skip = params.skip ?? 0
    const take = Math.min(params.take ?? DEFAULT_TAKE, MAX_TAKE)

    const [items, total] = await this.db.$transaction([
      this.db.consumer.findMany({
        include: {
          user: { select: ADMIN_USER_SELECT },
          _count: { select: { meters: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.db.consumer.count(),
    ])

    return {
      items: items.map((consumer) => ({
        id: consumer.id,
        createdAt: consumer.createdAt,
        user: this.toUserSummary(consumer.user),
        meterCount: consumer._count.meters,
      })),
      total,
    }
  }

  async listMeters(params: {
    skip?: number
    take?: number
    status?: MeterStatus
  }): Promise<{ items: AdminMeterItem[]; total: number }> {
    const skip = params.skip ?? 0
    const take = Math.min(params.take ?? DEFAULT_TAKE, MAX_TAKE)
    const where = params.status !== undefined ? { status: params.status } : {}

    const [items, total] = await this.db.$transaction([
      this.db.meter.findMany({
        where,
        include: {
          provider: { include: { user: { select: { id: true, name: true } } } },
          consumer: { include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: [{ lastSeen: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.db.meter.count({ where }),
    ])

    return {
      items: items.map((meter) => ({
        ...this.toMeterSummary(meter),
        providerId: meter.providerId,
        providerName: meter.provider?.user.name ?? null,
      })),
      total,
    }
  }

  async setProviderVerified(providerId: string, isVerified: boolean): Promise<void> {
    const provider = await this.db.provider.findUnique({ where: { id: providerId } })

    if (!provider) {
      throw new NotFoundException('Provider not found')
    }

    await this.db.provider.update({ where: { id: providerId }, data: { isVerified } })
  }

  async setUserActive(userId: string, isActive: boolean, callerId: string): Promise<void> {
    if (!isActive && userId === callerId) {
      throw new BadRequestException('Cannot deactivate your own account')
    }

    const user = await this.db.user.findUnique({ where: { id: userId } })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    await this.db.user.update({ where: { id: userId }, data: { isActive } })

    if (isActive) {
      await this.heliusWebhookService.addAddress(user.walletAddress)
    } else {
      await this.heliusWebhookService.removeAddress(user.walletAddress)
    }
  }

  private toUserSummary(user: AdminUserSelect): AdminUserSummary {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      walletAddress: user.walletAddress,
      usdcBalance: user.usdcBalance.toNumber(),
      isActive: user.isActive,
      createdAt: user.createdAt,
    }
  }

  private toProviderItem(provider: Provider & { user: AdminUserSelect }): AdminProviderItem {
    return {
      id: provider.id,
      businessName: provider.businessName,
      pricePerKwh: provider.pricePerKwh.toNumber(),
      isVerified: provider.isVerified,
      totalEarned: provider.totalEarned.toNumber(),
      totalWithdrawn: provider.totalWithdrawn.toNumber(),
      createdAt: provider.createdAt,
      user: this.toUserSummary(provider.user),
    }
  }

  private toMeterSummary(
    meter: Meter & { consumer: (Consumer & { user: Pick<User, 'id' | 'name'> }) | null },
  ): MeterSummary {
    return {
      id: meter.id,
      meterAddr: meter.meterAddr,
      status: meter.status,
      relayState: meter.relayState,
      lastSeen: meter.lastSeen,
      pricePerKwh: meter.pricePerKwh ? meter.pricePerKwh.toNumber() : null,
      consumer: meter.consumer
        ? {
            id: meter.consumer.id,
            user: { id: meter.consumer.user.id, name: meter.consumer.user.name },
          }
        : null,
    }
  }
}
