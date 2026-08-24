import { Module } from '@nestjs/common'
import { MetersModule } from '../meters/meters.module'
import { BillingController } from './billing.controller'
import { BillingService } from './billing.service'
import { PlatformConfigService } from './platform-config.service'

@Module({
  imports: [MetersModule],
  providers: [BillingService, PlatformConfigService],
  controllers: [BillingController],
  exports: [BillingService, PlatformConfigService],
})
export class BillingModule {}
