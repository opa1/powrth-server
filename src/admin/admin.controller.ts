import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { AuthGuard } from '../common/guards/auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import { User } from '../generated/prisma/client'
import {
  AdminConsumerItem,
  AdminMeterItem,
  AdminProviderDetail,
  AdminProviderItem,
  AdminService,
  PlatformOverview,
} from './admin.service'
import { AdminQueryDto, adminQuerySchema } from './dto/admin-query.dto'
import { VerifyProviderDto, verifyProviderSchema } from './dto/verify-provider.dto'

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  overview(): Promise<PlatformOverview> {
    return this.adminService.getPlatformOverview()
  }

  @Get('providers')
  listProviders(
    @Query(new ZodValidationPipe(adminQuerySchema)) query: AdminQueryDto,
  ): Promise<{ items: AdminProviderItem[]; total: number }> {
    return this.adminService.listProviders({
      skip: query.skip,
      take: query.take,
      verified: query.verified,
    })
  }

  @Get('providers/:id')
  getProvider(@Param('id') id: string): Promise<AdminProviderDetail> {
    return this.adminService.getProviderById(id)
  }

  @Patch('providers/:id/verify')
  async verifyProvider(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(verifyProviderSchema)) dto: VerifyProviderDto,
  ): Promise<{ success: true }> {
    await this.adminService.setProviderVerified(id, dto.isVerified)
    return { success: true }
  }

  @Get('consumers')
  listConsumers(
    @Query(new ZodValidationPipe(adminQuerySchema)) query: AdminQueryDto,
  ): Promise<{ items: AdminConsumerItem[]; total: number }> {
    return this.adminService.listConsumers({ skip: query.skip, take: query.take })
  }

  @Get('meters')
  listMeters(
    @Query(new ZodValidationPipe(adminQuerySchema)) query: AdminQueryDto,
  ): Promise<{ items: AdminMeterItem[]; total: number }> {
    return this.adminService.listMeters({
      skip: query.skip,
      take: query.take,
      status: query.status,
    })
  }

  @Patch('users/:id/activate')
  async activateUser(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<{ success: true }> {
    await this.adminService.setUserActive(id, true, user.id)
    return { success: true }
  }

  @Patch('users/:id/deactivate')
  async deactivateUser(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<{ success: true }> {
    await this.adminService.setUserActive(id, false, user.id)
    return { success: true }
  }
}
