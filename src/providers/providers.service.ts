import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Provider, User } from '../generated/prisma/client'

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
}
