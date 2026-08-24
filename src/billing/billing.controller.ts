import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { AuthGuard } from '../common/guards/auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import {
  PlatformConfig,
  Role,
  TransactionStatus,
  TransactionType,
  User,
} from '../generated/prisma/client'
import { BalanceResult, BillingService, TransactionWithRelations } from './billing.service'
import { BillingQueryDto, billingQuerySchema } from './dto/billing-query.dto'
import { LoadCreditDto, loadCreditSchema } from './dto/load-credit.dto'
import { UpdateConfigDto, updateConfigSchema } from './dto/update-config.dto'
import { PlatformConfigService } from './platform-config.service'

interface TransactionDetail {
  id: string
  type: TransactionType
  status: TransactionStatus
  usdcAmount: number
  platformFee: number
  platformFeeRate: number
  providerEarning: number
  kwhAmount: number | null
  pricePerKwhUsed: number | null
  solanaSignature: string | null
  note: string | null
  createdAt: Date
  meter: { id: string; meterAddr: string } | null
  loadedBy: { id: string; name: string | null } | null
}

interface PublicPlatformConfig {
  feeRatePercent: number
  minCreditLoadUsdc: number
  minWithdrawalUsdc: number
}

interface PlatformConfigDetail extends PublicPlatformConfig {
  id: string
  feeWalletAddress: string | null
  updatedAt: Date
}

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly platformConfigService: PlatformConfigService,
  ) {}

  // NestJS's ThrottlerGuard checks every route against every configured
  // named throttler (AND logic), not just the one named in @Throttle().
  // Skip the unrelated buckets so this route is bound only by 'billing'.
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('PROVIDER', 'CONSUMER')
  @Throttle({ billing: { limit: 20, ttl: 60_000 } })
  @SkipThrottle({ auth: true, wallet: true })
  @UseInterceptors(IdempotencyInterceptor)
  @Post('load')
  async load(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(loadCreditSchema)) dto: LoadCreditDto,
  ): Promise<TransactionDetail> {
    const transaction = await this.billingService.loadCredit({
      callerUserId: user.id,
      callerRole: user.role as Role,
      meterId: dto.meterId,
      usdcAmount: dto.usdcAmount,
      solanaSignature: dto.solanaSignature,
    })
    return this.toTransactionDetail(transaction)
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('PROVIDER', 'CONSUMER')
  @Get('balance/:meterId')
  async balance(
    @CurrentUser() user: User,
    @Param('meterId') meterId: string,
  ): Promise<BalanceResult> {
    return this.billingService.getBalance(user.id, user.role as Role, meterId)
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('PROVIDER', 'CONSUMER')
  @Get('history')
  async history(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(billingQuerySchema)) query: BillingQueryDto,
  ): Promise<{ items: TransactionDetail[]; total: number }> {
    const { items, total } = await this.billingService.getHistory(user.id, user.role as Role, query)
    return { items: items.map((t) => this.toTransactionDetail(t)), total }
  }

  @Get('config')
  async config(): Promise<PublicPlatformConfig> {
    const config = await this.platformConfigService.getConfig()
    return {
      feeRatePercent: config.feeRatePercent.toNumber(),
      minCreditLoadUsdc: config.minCreditLoadUsdc.toNumber(),
      minWithdrawalUsdc: config.minWithdrawalUsdc.toNumber(),
    }
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('config')
  async updateConfig(
    @Body(new ZodValidationPipe(updateConfigSchema)) dto: UpdateConfigDto,
  ): Promise<PlatformConfigDetail> {
    const config = await this.platformConfigService.updateConfig(dto)
    return this.toConfigDetail(config)
  }

  private toTransactionDetail(transaction: TransactionWithRelations): TransactionDetail {
    return {
      id: transaction.id,
      type: transaction.type,
      status: transaction.status,
      usdcAmount: transaction.usdcAmount.toNumber(),
      platformFee: transaction.platformFee.toNumber(),
      platformFeeRate: transaction.platformFeeRate.toNumber(),
      providerEarning: transaction.providerEarning.toNumber(),
      kwhAmount: transaction.kwhAmount ? transaction.kwhAmount.toNumber() : null,
      pricePerKwhUsed: transaction.pricePerKwhUsed ? transaction.pricePerKwhUsed.toNumber() : null,
      solanaSignature: transaction.solanaSignature,
      note: transaction.note,
      createdAt: transaction.createdAt,
      meter: transaction.meter
        ? { id: transaction.meter.id, meterAddr: transaction.meter.meterAddr }
        : null,
      loadedBy: transaction.loadedBy
        ? { id: transaction.loadedBy.id, name: transaction.loadedBy.name }
        : null,
    }
  }

  private toConfigDetail(config: PlatformConfig): PlatformConfigDetail {
    return {
      id: config.id,
      feeRatePercent: config.feeRatePercent.toNumber(),
      minCreditLoadUsdc: config.minCreditLoadUsdc.toNumber(),
      minWithdrawalUsdc: config.minWithdrawalUsdc.toNumber(),
      feeWalletAddress: config.feeWalletAddress,
      updatedAt: config.updatedAt,
    }
  }
}
