import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AdminModule } from './admin/admin.module'
import { AuthModule } from './auth/auth.module'
import { BillingModule } from './billing/billing.module'
import { CommonModule } from './common/common.module'
import { ConfigModule } from './config/config.module'
import { ConsumersModule } from './consumers/consumers.module'
import { DatabaseModule } from './database/database.module'
import { HealthModule } from './health/health.module'
import { MetersModule } from './meters/meters.module'
import { ProvidersModule } from './providers/providers.module'
import { UsersModule } from './users/users.module'
import { WalletModule } from './wallet/wallet.module'
import { WebhooksModule } from './webhooks/webhooks.module'

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CommonModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [],
      useFactory: () => [
        { name: 'default', ttl: 60_000, limit: 60 },
        { name: 'auth', ttl: 60_000, limit: 5 },
        { name: 'billing', ttl: 60_000, limit: 20 },
        { name: 'wallet', ttl: 60_000, limit: 5 },
      ],
    }),
    AuthModule,
    UsersModule,
    WalletModule,
    ProvidersModule,
    ConsumersModule,
    MetersModule,
    BillingModule,
    WebhooksModule,
    AdminModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
