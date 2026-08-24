import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigService } from '../config/config.service'
import { UsersModule } from '../users/users.module'
import { WalletModule } from '../wallet/wallet.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AppleStrategy } from './strategies/apple.strategy'
import { GoogleStrategy } from './strategies/google.strategy'
import { XStrategy } from './strategies/x.strategy'

@Module({
  imports: [
    UsersModule,
    WalletModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, GoogleStrategy, AppleStrategy, XStrategy],
})
export class AuthModule {}
