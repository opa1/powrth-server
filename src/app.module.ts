import { Module } from '@nestjs/common'
import { AuthModule } from './auth/auth.module'
import { BillingModule } from './billing/billing.module'
import { ConfigModule } from './config/config.module'
import { ConsumersModule } from './consumers/consumers.module'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { MetersModule } from './meters/meters.module'
import { ProvidersModule } from './providers/providers.module'
import { UsersModule } from './users/users.module'
import { WalletModule } from './wallet/wallet.module'

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    UsersModule,
    WalletModule,
    ProvidersModule,
    ConsumersModule,
    MetersModule,
    BillingModule,
    HealthModule,
  ],
})
export class AppModule {}
