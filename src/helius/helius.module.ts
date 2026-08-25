import { Global, Module } from '@nestjs/common'
import { HeliusWebhookService } from './helius-webhook.service'

@Global()
@Module({
  providers: [HeliusWebhookService],
  exports: [HeliusWebhookService],
})
export class HeliusModule {}
