import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { AuthGuard } from '../common/guards/auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import { User } from '../generated/prisma/client'
import { UpdateProviderDto, updateProviderSchema } from './dto/update-provider.dto'
import {
  ProviderPrivateProfile,
  ProviderPublicProfile,
  ProviderWithUser,
  ProvidersService,
} from './providers.service'

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  async list(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ): Promise<{ items: ProviderPublicProfile[]; total: number }> {
    const { items, total } = await this.providersService.listAll({
      skip: skip !== undefined ? Number(skip) : undefined,
      take: take !== undefined ? Number(take) : undefined,
    })

    return { items: items.map((provider) => this.toPublicProfile(provider)), total }
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('PROVIDER')
  @Get('me')
  async me(@CurrentUser() user: User): Promise<ProviderPrivateProfile> {
    const provider = await this.providersService.findByUserId(user.id)
    return this.toPrivateProfile(provider)
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('PROVIDER')
  @Patch('me')
  async updateMe(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(updateProviderSchema)) dto: UpdateProviderDto,
  ): Promise<ProviderPrivateProfile> {
    await this.providersService.updateProfile(user.id, dto)
    const provider = await this.providersService.findByUserId(user.id)
    return this.toPrivateProfile(provider)
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ProviderPublicProfile> {
    const provider = await this.providersService.findById(id)
    return this.toPublicProfile(provider)
  }

  private toPublicProfile(provider: ProviderWithUser): ProviderPublicProfile {
    return {
      id: provider.id,
      businessName: provider.businessName,
      pricePerKwh: provider.pricePerKwh.toNumber(),
      isVerified: provider.isVerified,
      createdAt: provider.createdAt,
      user: {
        id: provider.user.id,
        name: provider.user.name,
        avatar: provider.user.avatar,
      },
    }
  }

  private toPrivateProfile(provider: ProviderWithUser): ProviderPrivateProfile {
    return {
      id: provider.id,
      businessName: provider.businessName,
      pricePerKwh: provider.pricePerKwh.toNumber(),
      isVerified: provider.isVerified,
      totalEarned: provider.totalEarned.toNumber(),
      totalWithdrawn: provider.totalWithdrawn.toNumber(),
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
      user: {
        id: provider.user.id,
        name: provider.user.name,
        avatar: provider.user.avatar,
        email: provider.user.email,
        walletAddress: provider.user.walletAddress,
      },
    }
  }
}
