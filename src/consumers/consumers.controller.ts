import { Controller, Get, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { AuthGuard } from '../common/guards/auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { User } from '../generated/prisma/client'
import {
  ConsumerMeterItem,
  ConsumerProfile,
  ConsumerWithUser,
  ConsumersService,
} from './consumers.service'

@Controller('consumers')
export class ConsumersController {
  constructor(private readonly consumersService: ConsumersService) {}

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CONSUMER')
  @Get('me')
  async me(@CurrentUser() user: User): Promise<ConsumerProfile> {
    const consumer = await this.consumersService.findByUserId(user.id)
    return this.toProfile(consumer)
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('CONSUMER')
  @Get('me/meters')
  async meters(@CurrentUser() user: User): Promise<ConsumerMeterItem[]> {
    return this.consumersService.getMetersWithBalances(user.id)
  }

  private toProfile(consumer: ConsumerWithUser): ConsumerProfile {
    return {
      id: consumer.id,
      createdAt: consumer.createdAt,
      updatedAt: consumer.updatedAt,
      user: {
        id: consumer.user.id,
        name: consumer.user.name,
        avatar: consumer.user.avatar,
        walletAddress: consumer.user.walletAddress,
      },
    }
  }
}
