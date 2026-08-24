import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { AuthGuard } from '../common/guards/auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import { User, Withdrawal, WithdrawalStatus } from '../generated/prisma/client'
import { WithdrawDto, withdrawSchema } from './dto/withdraw.dto'
import { WalletService } from './wallet.service'
import { WithdrawalService } from './withdrawal.service'

interface WithdrawalDetail {
  id: string
  usdcAmount: number
  toWalletAddress: string
  solanaSignature: string | null
  status: WithdrawalStatus
  createdAt: Date
}

@Controller('wallet')
@UseGuards(AuthGuard)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly withdrawalService: WithdrawalService,
  ) {}

  @Get('address')
  address(@CurrentUser() user: User): { walletAddress: string } {
    return { walletAddress: user.walletAddress }
  }

  @Get('balance')
  async balance(@CurrentUser() user: User): Promise<{
    walletAddress: string
    platformUsdcBalance: number
    onChainUsdcBalance: number
  }> {
    const platformBalance = await this.walletService.getPlatformBalance(user.id)
    const onChainBalance = await this.walletService.getOnChainUsdcBalance(user.walletAddress)

    return {
      walletAddress: user.walletAddress,
      platformUsdcBalance: platformBalance.usdcBalance,
      onChainUsdcBalance: onChainBalance,
    }
  }

  // NestJS's ThrottlerGuard checks every route against every configured
  // named throttler (AND logic), not just the one named in @Throttle().
  // Skip the unrelated buckets so this route is bound only by 'wallet'.
  @UseGuards(RolesGuard)
  @Roles('PROVIDER')
  @Throttle({ wallet: { limit: 5, ttl: 60_000 } })
  @SkipThrottle({ auth: true, billing: true })
  @Post('withdraw')
  async withdraw(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(withdrawSchema)) dto: WithdrawDto,
  ): Promise<WithdrawalDetail> {
    const withdrawal = await this.withdrawalService.requestWithdrawal({
      callerUserId: user.id,
      usdcAmount: dto.usdcAmount,
      toWalletAddress: dto.toWalletAddress,
    })
    return this.toDetail(withdrawal)
  }

  @UseGuards(RolesGuard)
  @Roles('PROVIDER')
  @Get('withdrawals')
  async withdrawals(@CurrentUser() user: User): Promise<WithdrawalDetail[]> {
    const items = await this.withdrawalService.listByProvider(user.id)
    return items.map((w) => this.toDetail(w))
  }

  private toDetail(withdrawal: Withdrawal): WithdrawalDetail {
    return {
      id: withdrawal.id,
      usdcAmount: withdrawal.usdcAmount.toNumber(),
      toWalletAddress: withdrawal.toWalletAddress,
      solanaSignature: withdrawal.solanaSignature,
      status: withdrawal.status,
      createdAt: withdrawal.createdAt,
    }
  }
}
