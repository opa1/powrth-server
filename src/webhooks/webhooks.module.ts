import { Module } from '@nestjs/common'
import { WalletModule } from '../wallet/wallet.module'
import { WebhooksController } from './webhooks.controller'

@Module({
  imports: [WalletModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
