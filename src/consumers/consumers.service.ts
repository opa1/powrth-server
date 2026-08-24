import { Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { Consumer, User } from '../generated/prisma/client'

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
}
