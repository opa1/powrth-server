import { Global, Module } from '@nestjs/common'
import { BillingModule } from '../billing/billing.module'
import { DepositService } from './deposit.service'
import { WalletController } from './wallet.controller'
import { WalletService } from './wallet.service'
import { WithdrawalService } from './withdrawal.service'

@Global()
@Module({
  imports: [BillingModule],
  controllers: [WalletController],
  providers: [WalletService, DepositService, WithdrawalService],
  exports: [WalletService, DepositService, WithdrawalService],
})
export class WalletModule {}
