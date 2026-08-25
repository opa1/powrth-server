import { BadRequestException, Injectable } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Role, User } from '../generated/prisma/client'
import { HeliusWebhookService } from '../helius/helius-webhook.service'
import { WalletService } from '../wallet/wallet.service'

type SocialProvider = 'google' | 'apple' | 'x'

interface UpsertByProviderInput {
  provider: SocialProvider
  providerId: string
  name?: string
  avatar?: string
  email?: string
}

interface UpsertByProviderResult {
  user: User
  isNewUser: boolean
}

export interface UserProfile {
  id: string
  name: string | null
  avatar: string | null
  email: string | null
  role: Role | null
  walletAddress: string
  createdAt: Date
}

@Injectable()
export class UsersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly walletService: WalletService,
    private readonly heliusWebhookService: HeliusWebhookService,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } })
  }

  async upsertByProvider(input: UpsertByProviderInput): Promise<UpsertByProviderResult> {
    const existing = await this.findByProvider(input.provider, input.providerId)

    if (existing) {
      const updateData: { name?: string; avatar?: string } = {}
      if (input.name !== undefined) {
        updateData.name = input.name
      }
      if (input.avatar !== undefined) {
        updateData.avatar = input.avatar
      }

      const user =
        Object.keys(updateData).length > 0
          ? await this.db.user.update({ where: { id: existing.id }, data: updateData })
          : existing

      return { user, isNewUser: false }
    }

    const user = await this.db.$transaction(async (tx) => {
      const agg = await tx.user.aggregate({ _max: { walletKeyIndex: true } })
      const nextIndex = (agg._max.walletKeyIndex ?? -1) + 1
      const walletAddress = this.walletService.deriveAddress(nextIndex)

      const baseData = {
        name: input.name,
        avatar: input.avatar,
        email: input.email,
        walletAddress,
        walletKeyIndex: nextIndex,
      }

      switch (input.provider) {
        case 'google':
          return tx.user.create({ data: { ...baseData, googleId: input.providerId } })
        case 'apple':
          return tx.user.create({ data: { ...baseData, appleId: input.providerId } })
        case 'x':
          return tx.user.create({ data: { ...baseData, xId: input.providerId } })
      }
    })

    // Runs after the transaction commits — this is an external HTTP call and
    // must never hold the DB transaction open while it's in flight.
    await this.heliusWebhookService.addAddress(user.walletAddress)

    return { user, isNewUser: true }
  }

  async setRole(userId: string, role: Role): Promise<User> {
    const user = await this.db.user.findUnique({ where: { id: userId } })

    if (!user) {
      throw new BadRequestException('User not found')
    }

    if (user.role) {
      throw new BadRequestException('Role already set')
    }

    return this.db.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: userId }, data: { role } })

      if (role === 'PROVIDER') {
        await tx.provider.create({ data: { userId } })
      } else if (role === 'CONSUMER') {
        await tx.consumer.create({ data: { userId } })
      }

      return updated
    })
  }

  async updateProfile(userId: string, input: { name?: string; avatar?: string }): Promise<User> {
    if (input.name === undefined && input.avatar === undefined) {
      throw new BadRequestException('At least one field must be provided')
    }

    const data: { name?: string; avatar?: string } = {}
    if (input.name !== undefined) {
      data.name = input.name
    }
    if (input.avatar !== undefined) {
      data.avatar = input.avatar
    }

    return this.db.user.update({ where: { id: userId }, data })
  }

  private async findByProvider(provider: SocialProvider, providerId: string): Promise<User | null> {
    switch (provider) {
      case 'google':
        return this.db.user.findUnique({ where: { googleId: providerId } })
      case 'apple':
        return this.db.user.findUnique({ where: { appleId: providerId } })
      case 'x':
        return this.db.user.findUnique({ where: { xId: providerId } })
    }
  }
}
